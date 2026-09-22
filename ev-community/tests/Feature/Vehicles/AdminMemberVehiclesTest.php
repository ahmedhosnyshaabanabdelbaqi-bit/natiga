<?php

namespace Tests\Feature\Vehicles;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\System\Services\DashboardKpis;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AdminMemberVehiclesTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    public function test_member_vehicles_need_vehicles_view(): void
    {
        $vehicle = $this->vehicleFor($this->makeMember());

        $this->actingAsStaff(['vehicles.manage_master']);
        $this->get('/admin/vehicles/members')->assertForbidden();
        $this->get("/admin/vehicles/members/{$vehicle->public_id}")->assertForbidden();
        $this->post('/admin/vehicles/members/vin-lookup', ['vin' => $this->vin()])->assertForbidden();

        // a plain member never reaches the admin panel
        $this->actingAsMember();
        $this->get('/admin/vehicles/members')->assertForbidden();
    }

    public function test_list_searches_by_member_number_and_name_and_never_exposes_vins(): void
    {
        $alice = $this->makeMember(['name' => 'Alice Hassan']);
        $bob = $this->makeMember(['name' => 'Bob Salem']);
        $aliceCar = $this->vehicleFor($alice, ['vin' => $this->vin(21)]);
        $this->vehicleFor($bob, ['vin' => $this->vin(22)]);
        $this->actingAsStaff(['vehicles.view']);

        $all = $this->get('/admin/vehicles/members')->assertOk();
        $all->assertInertia(fn (Assert $page) => $page->component('admin/vehicles/members/index')->has('vehicles.data', 2));
        $this->assertStringNotContainsString($this->vin(21), $all->getContent());
        $this->assertStringNotContainsString(MemberVehicle::hashVin($this->vin(21)), $all->getContent());

        $this->get('/admin/vehicles/members?q=alice')->assertInertia(fn (Assert $page) => $page
            ->has('vehicles.data', 1)
            ->where('vehicles.data.0.id', $aliceCar->public_id)
            ->where('vehicles.data.0.has_vin', true)
            ->missing('vehicles.data.0.vin'));

        $this->get('/admin/vehicles/members?q='.$bob->membership->member_number)->assertInertia(fn (Assert $page) => $page
            ->has('vehicles.data', 1)
            ->where('vehicles.data.0.member.member_number', $bob->membership->member_number));

        // LIKE wildcards in the search box are literal
        $this->get('/admin/vehicles/members?q=%25')->assertInertia(fn (Assert $page) => $page->has('vehicles.data', 0));
    }

    public function test_filters_by_status_and_missing_variant(): void
    {
        $member = $this->makeMember();
        $this->vehicleFor($member, ['status' => VehicleStatus::Sold]);
        $variant = $this->variant();
        $this->vehicleFor($member, ['vehicle_make_id' => $variant->model->vehicle_make_id, 'vehicle_model_id' => $variant->vehicle_model_id, 'vehicle_variant_id' => $variant->id]);
        $this->actingAsStaff(['vehicles.view']);

        $this->get('/admin/vehicles/members?status=sold')->assertInertia(fn (Assert $page) => $page->has('vehicles.data', 1)->where('vehicles.data.0.status.value', 'sold'));
        $this->get('/admin/vehicles/members?variant=missing')->assertInertia(fn (Assert $page) => $page->has('vehicles.data', 1)->where('vehicles.data.0.variant', null));
        $this->get('/admin/vehicles/members?status=bogus')->assertInertia(fn (Assert $page) => $page->has('vehicles.data', 2)->where('filters.status', null));
    }

    public function test_vin_lookup_matches_by_hash_and_is_audited_without_the_vin(): void
    {
        $owner = $this->makeMember();
        $car = $this->vehicleFor($owner, ['vin' => $this->vin(23)]);
        $this->vehicleFor($this->makeMember(), ['vin' => $this->vin(24)]);
        $staff = $this->actingAsStaff(['vehicles.view']);

        $this->post('/admin/vehicles/members/vin-lookup', ['vin' => 'lgxce4cb5n 0000023'])->assertRedirect('/admin/vehicles/members');
        $this->get('/admin/vehicles/members')->assertInertia(fn (Assert $page) => $page
            ->where('vinLookup.matched', true)
            ->has('vehicles.data', 1)
            ->where('vehicles.data.0.id', $car->public_id));

        // the flashed lookup is gone on the next request
        $this->get('/admin/vehicles/members')->assertInertia(fn (Assert $page) => $page->where('vinLookup', null)->has('vehicles.data', 2));

        $audit = AuditLog::query()->where('action', 'vehicles.vin_lookup')->sole();
        $this->assertSame($staff->id, $audit->actor_id);
        $this->assertSame(['matches' => 1], $audit->new_values);
        $this->assertStringNotContainsString('0000023', json_encode($audit->toArray()));

        $this->post('/admin/vehicles/members/vin-lookup', ['vin' => 'NOT-A-VIN'])->assertSessionHasErrors('vin');
    }

    public function test_detail_shows_odometer_history_but_only_the_masked_vin(): void
    {
        $owner = $this->makeMember();
        $car = $this->vehicleFor($owner, ['vin' => $this->vin(25), 'odometer_km' => 900]);
        $car->odometerHistory()->create(['odometer_km' => 900, 'recorded_at' => now(), 'created_by' => $owner->id]);
        $this->actingAsStaff(['vehicles.view']);

        $response = $this->get("/admin/vehicles/members/{$car->public_id}")->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('admin/vehicles/members/show')
            ->where('vehicle.id', $car->public_id)
            ->where('vehicle.info.vin_masked', '*************0025')
            ->has('odometerHistory', 1)
            ->where('odometerHistory.0.created_by', $owner->name)
            ->where('canCorrect', false)
            ->where('catalog', null));
        $this->assertStringNotContainsString($this->vin(25), $response->getContent());
    }

    public function test_correction_needs_edit_permission_and_a_reason_and_is_audited(): void
    {
        $owner = $this->makeMember();
        $car = $this->vehicleFor($owner, ['vin' => $this->vin(26), 'is_primary' => true]);
        $variant = $this->variant();
        $payload = [
            'vehicle_make_id' => $variant->model->vehicle_make_id,
            'vehicle_model_id' => $variant->vehicle_model_id,
            'vehicle_variant_id' => $variant->id,
            'year' => 2021,
            'market_version' => 'china',
            'status' => 'sold',
            'clear_vin' => 1,
            'reason' => 'Ownership verified by phone; car was sold',
        ];

        $this->actingAsStaff(['vehicles.view']);
        $this->put("/admin/vehicles/members/{$car->public_id}", $payload)->assertForbidden();

        $staff = $this->actingAsStaff(['vehicles.view', 'vehicles.edit_member_vehicle']);
        $this->get("/admin/vehicles/members/{$car->public_id}")->assertInertia(fn (Assert $page) => $page->where('canCorrect', true)->has('catalog.makes'));
        $this->put("/admin/vehicles/members/{$car->public_id}", ['reason' => 'x'] + $payload)->assertSessionHasErrors('reason');

        $this->put("/admin/vehicles/members/{$car->public_id}", $payload)->assertSessionHasNoErrors()->assertRedirect("/admin/vehicles/members/{$car->public_id}");

        $car->refresh();
        $this->assertSame($variant->id, $car->vehicle_variant_id);
        $this->assertSame(2021, $car->year);
        $this->assertNull($car->vin_hash);
        $this->assertSame(VehicleStatus::Sold, $car->status);
        $this->assertFalse($car->is_primary);

        $audit = AuditLog::query()->where('action', 'vehicles.corrected_by_staff')->sole();
        $this->assertSame($staff->id, $audit->actor_id);
        $this->assertSame('Ownership verified by phone; car was sold', $audit->reason);
        $this->assertFalse($audit->new_values['has_vin']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'vehicles.status_changed', 'entity_id' => $car->id, 'actor_id' => $staff->id]);
    }

    public function test_vehicles_total_kpi_counts_active_vehicles_for_permitted_staff(): void
    {
        $member = $this->makeMember();
        $this->vehicleFor($member);
        $this->vehicleFor($member, ['status' => VehicleStatus::Archived]);

        $viewer = $this->makeStaff(['vehicles.view']);
        $kpi = collect(DashboardKpis::resolveFor($viewer))->firstWhere('key', 'vehicles_total');
        $this->assertSame(1, $kpi['value']);
        $this->assertSame('/admin/vehicles/members?status=active', $kpi['href']);

        $outsider = $this->makeStaff([]);
        $this->assertNull(collect(DashboardKpis::resolveFor($outsider))->firstWhere('key', 'vehicles_total'));
    }

    public function test_garage_overview_aggregates_live_data(): void
    {
        $variant = $this->variant();
        $member = $this->makeMember();
        $this->vehicleFor($member, ['vehicle_make_id' => $variant->model->vehicle_make_id, 'vehicle_model_id' => $variant->vehicle_model_id, 'vehicle_variant_id' => $variant->id, 'year' => 2023, 'vin' => $this->vin(27), 'odometer_km' => 10]);
        $this->vehicleFor($member, ['vehicle_make_id' => $variant->model->vehicle_make_id, 'vehicle_model_id' => $variant->vehicle_model_id, 'year' => 2024]);
        $this->vehicleFor($this->makeMember(), ['status' => VehicleStatus::Sold, 'year' => 2019]);

        $this->actingAsStaff([]);
        $this->get('/admin/garage')->assertForbidden();

        $this->actingAsStaff(['vehicles.view']);
        $this->get('/admin/garage')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('admin/garage/index')
            ->where('stats.totals.all', 3)
            ->where('stats.totals.active', 2)
            ->where('stats.totals.sold', 1)
            ->where('stats.totals.without_variant', 1)
            ->where('stats.totals.without_vin', 1)
            ->where('stats.totals.with_odometer', 1)
            ->where('stats.totals.members_with_vehicles', 1)
            ->where('stats.top_models.0.model_id', $variant->vehicle_model_id)
            ->where('stats.top_models.0.total', 2)
            ->has('stats.by_year', 2));
    }
}
