<?php

namespace Tests\Feature\Garage;

use App\Models\User;
use App\Modules\Garage\Services\GarageSections;
use App\Modules\System\Models\ModuleSetting;
use App\Modules\System\Services\Modules;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;
use Tests\Feature\Vehicles\VehicleFixtures;
use Tests\TestCase;

class GarageSectionsTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        Modules::flush();
    }

    protected function tearDown(): void
    {
        foreach (['test_orders', 'test_secret', 'test_broken', 'test_empty'] as $key) {
            GarageSections::forget($key);
        }
        Modules::flush();
        parent::tearDown();
    }

    /** Toggle a module's stored state (the admin toggle itself belongs to the System module and is tested there). */
    private function setModule(string $key, bool $enabled): void
    {
        ModuleSetting::query()->updateOrCreate(['key' => $key], ['enabled' => $enabled]);
        Modules::flush();
    }

    public function test_core_sections_are_registered_in_order(): void
    {
        $keys = array_column(GarageSections::tabsFor(null), 'key');

        $this->assertSame(['info', 'odometer', 'charging_compatibility'], array_slice($keys, 0, 3));
    }

    public function test_sections_of_disabled_modules_are_hidden(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);
        GarageSections::register('test_orders', 'garage.sections.info', fn (MemberVehicle $v, User $u) => ['count' => 3], module: 'group_buying', order: 40);

        $this->setModule('group_buying', true);
        $this->assertContains('test_orders', array_column(GarageSections::tabsFor($member), 'key'));

        $this->setModule('group_buying', false);
        $this->assertNotContains('test_orders', array_column(GarageSections::tabsFor($member), 'key'));

        $this->get("/account/garage/{$vehicle->public_id}")->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('member/garage/show')
            ->where('sections', fn ($sections) => ! in_array('test_orders', collect($sections)->pluck('key')->all(), true))
            ->missing('section_test_orders'));

        // the prop does not exist at all for a disabled module, even when requested explicitly
        $this->get("/account/garage/{$vehicle->public_id}", $this->partialReload('member/garage/show', ['section_test_orders']))
            ->assertOk()
            ->assertJsonMissingPath('props.section_test_orders');
    }

    public function test_permission_gated_sections_follow_the_viewer(): void
    {
        $member = $this->actingAsMember();
        GarageSections::register('test_secret', 'garage.sections.info', fn () => ['ok' => true], order: 50, permission: 'vehicles.view');

        $this->assertNotContains('test_secret', array_column(GarageSections::tabsFor($member), 'key'));

        $member->givePermissionTo(Permission::findOrCreate('vehicles.view', 'web'));
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->assertContains('test_secret', array_column(GarageSections::tabsFor($member->fresh()), 'key'));
    }

    public function test_section_data_is_resolved_lazily_through_a_partial_reload(): void
    {
        $member = $this->actingAsMember();
        $c = $this->connectors();
        $this->rule($c['ccs2'], $c['gbt_dc'], Compatibility::Incompatible);
        $this->rule($c['type2'], $c['gbt_ac'], Compatibility::Adapter);
        $variant = $this->variant(ac: 'type2', dc: 'ccs2');
        $vehicle = $this->vehicleFor($member, [
            'vehicle_make_id' => $variant->model->vehicle_make_id,
            'vehicle_model_id' => $variant->vehicle_model_id,
            'vehicle_variant_id' => $variant->id,
            'odometer_km' => 42000,
            'vin' => $this->vin(4),
        ]);
        $vehicle->odometerHistory()->create(['odometer_km' => 42000, 'recorded_at' => now(), 'created_by' => $member->id]);
        $url = "/account/garage/{$vehicle->public_id}";

        $this->get($url, $this->partialReload('member/garage/show', ['section_info']))
            ->assertOk()
            ->assertJsonPath('props.section_info.variant', $variant->name())
            ->assertJsonPath('props.section_info.vin_masked', '*************0004')
            ->assertJsonPath('props.section_info.connectors.dc.code', 'ccs2')
            ->assertJsonMissingPath('props.section_odometer');

        $this->get($url, $this->partialReload('member/garage/show', ['section_odometer']))
            ->assertOk()
            ->assertJsonPath('props.section_odometer.current_km', 42000)
            ->assertJsonPath('props.section_odometer.history.0.odometer_km', 42000)
            ->assertJsonPath('props.section_odometer.history.0.created_by', null);

        $charging = $this->get($url, $this->partialReload('member/garage/show', ['section_charging_compatibility']))->assertOk()->json('props.section_charging_compatibility');
        $this->assertTrue($charging['known']);
        $this->assertEqualsCanonicalizing(['type2', 'ccs2'], array_column($charging['direct'], 'code'));
        $this->assertSame(['gbt_ac'], array_column($charging['adapter'], 'code'));
        $this->assertSame(['gbt_dc'], array_column($charging['incompatible'], 'code'));
    }

    public function test_unknown_variant_has_no_charging_data_and_resolver_failures_do_not_break_the_page(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);
        GarageSections::register('test_broken', 'garage.sections.info', fn () => throw new \RuntimeException('boom'), order: 60);

        $url = "/account/garage/{$vehicle->public_id}";
        $this->get($url, $this->partialReload('member/garage/show', ['section_charging_compatibility']))
            ->assertOk()
            ->assertJsonPath('props.section_charging_compatibility.known', false);

        $this->get($url, $this->partialReload('member/garage/show', ['section_test_broken']))
            ->assertOk()
            ->assertJsonPath('props.section_test_broken.error', __('core.states.error'));
    }

    public function test_active_tab_follows_the_query_string(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);

        $this->get("/account/garage/{$vehicle->public_id}?tab=odometer")->assertInertia(fn (Assert $page) => $page->where('activeSection', 'odometer'));
        $this->get("/account/garage/{$vehicle->public_id}?tab=nope")->assertInertia(fn (Assert $page) => $page->where('activeSection', 'info'));
    }

    public function test_section_keys_must_be_snake_case(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        GarageSections::register('Bad-Key', 'x', fn () => []);
    }
}
