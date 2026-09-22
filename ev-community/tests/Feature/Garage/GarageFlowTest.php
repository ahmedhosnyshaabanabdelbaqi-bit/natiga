<?php

namespace Tests\Feature\Garage;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Files\Models\Attachment;
use App\Modules\Garage\Services\VehicleDeletionGuards;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Feature\Vehicles\VehicleFixtures;
use Tests\TestCase;

class GarageFlowTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake((string) config('filesystems.private_disk', 'private'));
        Storage::fake((string) config('filesystems.public_disk', 'public'));
    }

    protected function tearDown(): void
    {
        VehicleDeletionGuards::reset();
        parent::tearDown();
    }

    public function test_empty_garage_renders_with_add_call_to_action(): void
    {
        $this->actingAsMember();

        $this->get('/account/garage')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('member/garage/index')
            ->has('vehicles', 0)
            ->where('canAdd', true)
            ->where('counts.active', 0));
    }

    public function test_garage_lists_only_the_members_own_vehicles(): void
    {
        $member = $this->actingAsMember();
        $mine = $this->vehicleFor($member, ['is_primary' => true]);
        $this->vehicleFor($this->makeMember());

        $this->get('/account/garage')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('member/garage/index')
            ->has('vehicles', 1)
            ->where('vehicles.0.id', $mine->public_id)
            ->where('vehicles.0.is_primary', true)
            ->missing('vehicles.0.vin'));
    }

    public function test_wizard_page_receives_the_localized_catalog(): void
    {
        $this->actingAsMember();
        $variant = $this->variant();

        $this->get('/account/garage/create')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('member/garage/create')
            ->has('vehicleData.makes', 1)
            ->where('vehicleData.makes.0.models.0.variants.0.id', $variant->id)
            ->where('maxImageMb', 10)
            ->has('vehicleData.market_versions', count(MarketVersion::cases())));
    }

    public function test_member_adds_a_vehicle_with_photo_vin_and_first_odometer_reading(): void
    {
        $member = $this->actingAsMember();
        $variant = $this->variant();

        $response = $this->post('/account/garage', [
            'vehicle_make_id' => $variant->model->vehicle_make_id,
            'vehicle_model_id' => $variant->vehicle_model_id,
            'vehicle_variant_id' => $variant->id,
            'year' => 2023,
            'market_version' => 'europe',
            'vin' => ' lgxce4cb5n-0000001 ',
            'nickname' => 'Daily',
            'color' => 'White',
            'plate_hint' => 'abc',
            'odometer_km' => 12500,
            'image' => UploadedFile::fake()->image('car.jpg', 1200, 800),
        ]);

        $vehicle = MemberVehicle::query()->forUser($member)->sole();
        $response->assertRedirect('/account/garage/'.$vehicle->public_id);
        $this->assertTrue($vehicle->is_primary, 'the first vehicle becomes the primary one');
        $this->assertSame(VehicleStatus::Active, $vehicle->status);
        $this->assertSame('LGXCE4CB5N0000001', $vehicle->vin);
        $this->assertSame('ABC', $vehicle->plate_hint);
        $this->assertSame(12500, $vehicle->odometer_km);
        $this->assertSame(1, $vehicle->odometerHistory()->count());
        $this->assertNotNull($vehicle->image_attachment_id);
        $attachment = Attachment::query()->findOrFail($vehicle->image_attachment_id);
        $this->assertSame(Attachment::VISIBILITY_PRIVATE, $attachment->visibility);
        $this->assertSame($vehicle->getMorphClass(), $attachment->owner_type);

        $audit = AuditLog::query()->where('action', 'vehicles.created')->sole();
        $this->assertTrue($audit->new_values['has_vin']);
        $this->assertStringNotContainsString('LGXCE4CB5N0000001', json_encode($audit->new_values));
    }

    public function test_i_dont_know_variant_is_accepted_and_the_year_is_required(): void
    {
        $member = $this->actingAsMember();
        $model = VehicleModel::factory()->create();

        $this->post('/account/garage', [
            'vehicle_make_id' => $model->vehicle_make_id,
            'vehicle_model_id' => $model->id,
            'vehicle_variant_id' => '',
            'market_version' => 'china',
        ])->assertSessionHasErrors('year');

        $this->post('/account/garage', [
            'vehicle_make_id' => $model->vehicle_make_id,
            'vehicle_model_id' => $model->id,
            'vehicle_variant_id' => 'none',
            'year' => 2022,
            'market_version' => 'china',
        ])->assertRedirect();

        $vehicle = MemberVehicle::query()->forUser($member)->sole();
        $this->assertNull($vehicle->vehicle_variant_id);
        $this->assertSame(MarketVersion::China, $vehicle->market_version);
    }

    public function test_model_must_belong_to_make_and_inactive_master_data_is_rejected(): void
    {
        $this->actingAsMember();
        $model = VehicleModel::factory()->create();
        $otherMake = VehicleMake::factory()->create();
        $inactiveMake = VehicleMake::factory()->inactive()->create();
        $inactiveModel = VehicleModel::factory()->create(['vehicle_make_id' => $inactiveMake->id]);

        $this->post('/account/garage', ['vehicle_make_id' => $otherMake->id, 'vehicle_model_id' => $model->id, 'year' => 2022, 'market_version' => 'europe'])
            ->assertSessionHasErrors('vehicle_model_id');
        $this->post('/account/garage', ['vehicle_make_id' => $inactiveMake->id, 'vehicle_model_id' => $inactiveModel->id, 'year' => 2022, 'market_version' => 'europe'])
            ->assertSessionHasErrors('vehicle_make_id');
        $this->assertSame(0, MemberVehicle::query()->count());
    }

    public function test_image_larger_than_the_limit_is_rejected(): void
    {
        $this->actingAsMember();
        $model = VehicleModel::factory()->create();

        $this->post('/account/garage', [
            'vehicle_make_id' => $model->vehicle_make_id,
            'vehicle_model_id' => $model->id,
            'year' => 2022,
            'market_version' => 'europe',
            'image' => UploadedFile::fake()->create('huge.jpg', 11 * 1024, 'image/jpeg'),
        ])->assertSessionHasErrors('image');
        $this->assertSame(0, MemberVehicle::query()->count());
    }

    public function test_second_vehicle_is_not_primary_and_primary_can_be_switched(): void
    {
        $member = $this->actingAsMember();
        $first = $this->vehicleFor($member, ['is_primary' => true]);
        $second = $this->vehicleFor($member);

        $this->post("/account/garage/{$second->public_id}/primary")->assertRedirect();

        $this->assertFalse($first->fresh()->is_primary);
        $this->assertTrue($second->fresh()->is_primary);
        $this->assertSame(1, MemberVehicle::query()->forUser($member)->primary()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'vehicles.primary_changed', 'entity_id' => $second->id]);

        // idempotent: asking again changes nothing
        $this->post("/account/garage/{$second->public_id}/primary")->assertRedirect();
        $this->assertSame(1, AuditLog::query()->where('action', 'vehicles.primary_changed')->count());
    }

    public function test_selling_the_primary_vehicle_promotes_another_active_one(): void
    {
        $member = $this->actingAsMember();
        $primary = $this->vehicleFor($member, ['is_primary' => true]);
        $other = $this->vehicleFor($member);

        $this->post("/account/garage/{$primary->public_id}/status", ['status' => 'sold', 'reason' => 'Sold to a friend'])->assertRedirect();

        $this->assertSame(VehicleStatus::Sold, $primary->fresh()->status);
        $this->assertFalse($primary->fresh()->is_primary);
        $this->assertTrue($other->fresh()->is_primary);
        $audit = AuditLog::query()->where('action', 'vehicles.status_changed')->sole();
        $this->assertSame('Sold to a friend', $audit->reason);

        // a sold vehicle cannot become primary
        $this->post("/account/garage/{$primary->public_id}/primary")->assertSessionHasErrors('domain');
    }

    public function test_member_edits_details_without_touching_the_vin_unless_asked(): void
    {
        $member = $this->actingAsMember();
        $variant = $this->variant();
        $vehicle = $this->vehicleFor($member, [
            'vehicle_make_id' => $variant->model->vehicle_make_id,
            'vehicle_model_id' => $variant->vehicle_model_id,
            'vin' => $this->vin(5),
        ]);
        $hash = $vehicle->vin_hash;

        $this->put("/account/garage/{$vehicle->public_id}", [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'vehicle_variant_id' => $variant->id,
            'year' => 2024,
            'market_version' => 'gulf',
            'nickname' => 'Family car',
        ])->assertRedirect('/account/garage/'.$vehicle->public_id);

        $vehicle->refresh();
        $this->assertSame($hash, $vehicle->vin_hash, 'VIN kept when the field is not submitted');
        $this->assertSame('Family car', $vehicle->nickname);
        $this->assertSame(2024, $vehicle->year);
        $this->assertSame($variant->id, $vehicle->vehicle_variant_id);

        // explicit removal clears both the encrypted VIN and its hash
        $this->put("/account/garage/{$vehicle->public_id}", [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'year' => 2024,
            'market_version' => 'gulf',
            'vin' => '',
        ])->assertRedirect();
        $vehicle->refresh();
        $this->assertNull($vehicle->vin);
        $this->assertNull($vehicle->vin_hash);
    }

    public function test_editing_keeps_a_make_that_was_deactivated_after_registration(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);
        VehicleMake::query()->whereKey($vehicle->vehicle_make_id)->update(['is_active' => false]);
        VehicleModel::query()->whereKey($vehicle->vehicle_model_id)->update(['is_active' => false]);

        $this->get("/account/garage/{$vehicle->public_id}/edit")->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('member/garage/edit')
            ->where('currentSelection.make.id', $vehicle->vehicle_make_id)
            ->missing('vehicle.vin'));

        $this->put("/account/garage/{$vehicle->public_id}", [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'year' => $vehicle->year,
            'market_version' => 'europe',
            'nickname' => 'Still mine',
        ])->assertSessionHasNoErrors()->assertRedirect();
        $this->assertSame('Still mine', $vehicle->fresh()->nickname);
    }

    public function test_photo_can_be_replaced_and_removed(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);
        $base = [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'year' => $vehicle->year,
            'market_version' => 'europe',
        ];

        $this->put("/account/garage/{$vehicle->public_id}", $base + ['image' => UploadedFile::fake()->image('a.png', 600, 400)])->assertRedirect();
        $first = $vehicle->fresh()->image_attachment_id;
        $this->assertNotNull($first);

        $this->put("/account/garage/{$vehicle->public_id}", $base + ['image' => UploadedFile::fake()->image('b.png', 600, 400)])->assertRedirect();
        $second = $vehicle->fresh()->image_attachment_id;
        $this->assertNotSame($first, $second);
        $this->assertDatabaseMissing('attachments', ['id' => $first]);

        $this->put("/account/garage/{$vehicle->public_id}", $base + ['remove_image' => 1])->assertRedirect();
        $this->assertNull($vehicle->fresh()->image_attachment_id);
        $this->assertDatabaseMissing('attachments', ['id' => $second]);
    }

    public function test_only_archived_vehicles_can_be_deleted_and_module_guards_can_block_it(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);

        $this->delete("/account/garage/{$vehicle->public_id}")->assertSessionHasErrors('domain');
        $this->assertModelExists($vehicle);

        $vehicle->forceFill(['status' => VehicleStatus::Archived])->save();
        VehicleDeletionGuards::register(fn (MemberVehicle $v): ?string => $v->is($vehicle) ? 'Linked to order ORD-2026-000001' : null);

        $this->get("/account/garage/{$vehicle->public_id}")->assertInertia(fn (Assert $page) => $page
            ->where('vehicle.can_delete', false)
            ->where('vehicle.delete_blocked_reason', 'Linked to order ORD-2026-000001'));
        $this->delete("/account/garage/{$vehicle->public_id}")->assertSessionHasErrors('domain');
        $this->assertModelExists($vehicle);

        VehicleDeletionGuards::reset();
        $vehicle->odometerHistory()->create(['odometer_km' => 100, 'recorded_at' => now(), 'created_by' => $member->id]);
        $this->delete("/account/garage/{$vehicle->public_id}")->assertRedirect('/account/garage');
        $this->assertModelMissing($vehicle);
        $this->assertDatabaseHas('audit_logs', ['action' => 'vehicles.deleted', 'entity_id' => $vehicle->id]);
    }

    public function test_deletion_guard_can_be_registered_with_or_without_a_key(): void
    {
        $keyed = VehicleDeletionGuards::register('orders', fn (MemberVehicle $v): ?string => null);
        $anonymous = VehicleDeletionGuards::register(fn (MemberVehicle $v): ?string => null);

        $this->assertSame('orders', $keyed);
        $this->assertContains($anonymous, VehicleDeletionGuards::keys());
        $this->assertCount(2, VehicleDeletionGuards::keys());
    }

    public function test_vehicle_page_renders_header_and_lazy_section_tabs(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member, ['vin' => $this->vin(9), 'odometer_km' => 5000]);

        $this->get("/account/garage/{$vehicle->public_id}")->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('member/garage/show')
            ->where('vehicle.id', $vehicle->public_id)
            ->where('vehicle.vin_masked', '*************0009')
            ->where('vehicle.has_vin', true)
            ->missing('vehicle.vin')
            ->where('sections.0.key', 'info')
            ->where('activeSection', 'info')
            ->where('canRevealVin', true)
            // optional props: not resolved on the first visit
            ->missing('section_info')
            ->missing('section_odometer')
            ->missing('section_charging_compatibility'));
    }

    public function test_vin_reveal_returns_the_vin_to_its_owner_and_is_audited(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member, ['vin' => $this->vin(3)]);

        $this->postJson("/account/garage/{$vehicle->public_id}/vin/reveal")
            ->assertOk()
            ->assertJsonPath('data.vin', $this->vin(3))
            ->assertHeader('Cache-Control', 'no-store, private');

        $audit = AuditLog::query()->where('action', 'vehicles.vin_revealed')->sole();
        $this->assertSame($member->id, $audit->actor_id);
        $this->assertSame(['vin_last4' => '0003'], $audit->new_values);
    }
}
