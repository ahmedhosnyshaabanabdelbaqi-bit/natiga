<?php

namespace Tests\Feature\Garage;

use App\Modules\Vehicles\Actions\ChangeVehicleStatus;
use App\Modules\Vehicles\Actions\CreateMemberVehicle;
use App\Modules\Vehicles\Actions\SetPrimaryVehicle;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Support\Exceptions\DomainException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Vehicles\VehicleFixtures;
use Tests\TestCase;

class VinAndConcurrencyTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    public function test_vin_is_encrypted_at_rest_and_hash_matches_the_normalized_vin(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member, ['vin' => $this->vin(11)]);

        $raw = DB::table('member_vehicles')->where('id', $vehicle->id)->first();
        $this->assertNotSame($this->vin(11), $raw->vin);
        $this->assertStringNotContainsString($this->vin(11), (string) $raw->vin);
        $this->assertSame(hash('sha256', $this->vin(11)), $raw->vin_hash);
        $this->assertSame($this->vin(11), $vehicle->fresh()->vin, 'decrypts through the model cast');
    }

    public function test_exact_duplicate_vin_across_active_vehicles_is_blocked_with_a_clear_message(): void
    {
        $this->vehicleFor($this->makeMember(), ['vin' => $this->vin(12)]);
        $member = $this->actingAsMember();
        $existing = $this->vehicleFor($this->makeMember());

        $this->post('/account/garage', [
            'vehicle_make_id' => $existing->vehicle_make_id,
            'vehicle_model_id' => $existing->vehicle_model_id,
            'year' => 2023,
            'market_version' => 'europe',
            'vin' => strtolower($this->vin(12)),
        ])->assertSessionHasErrors(['vin' => __('vehicles.errors.vin_duplicate')]);

        $this->assertSame(0, MemberVehicle::query()->forUser($member)->count());
    }

    public function test_invalid_vin_format_is_rejected(): void
    {
        $this->actingAsMember();
        $existing = $this->vehicleFor($this->makeMember());

        $this->post('/account/garage', [
            'vehicle_make_id' => $existing->vehicle_make_id,
            'vehicle_model_id' => $existing->vehicle_model_id,
            'year' => 2023,
            'market_version' => 'europe',
            'vin' => 'LGXCE4CB5N012345O',
        ])->assertSessionHasErrors(['vin' => __('vehicles.errors.vin_invalid')]);
    }

    public function test_a_vin_of_a_sold_vehicle_can_be_registered_by_the_new_owner_but_the_seller_cannot_reactivate_it(): void
    {
        $seller = $this->makeMember();
        $sold = $this->vehicleFor($seller, ['vin' => $this->vin(13), 'status' => VehicleStatus::Sold]);
        $buyer = $this->makeMember();

        $bought = app(CreateMemberVehicle::class)->execute($buyer, [
            'vehicle_make_id' => $sold->vehicle_make_id,
            'vehicle_model_id' => $sold->vehicle_model_id,
            'year' => 2022,
            'vin' => $this->vin(13),
        ]);
        $this->assertSame($sold->vin_hash, $bought->vin_hash);

        $this->actingAs($seller);
        $this->post("/account/garage/{$sold->public_id}/status", ['status' => 'active'])->assertSessionHasErrors('vin');
        $this->assertSame(VehicleStatus::Sold, $sold->fresh()->status);
    }

    public function test_editing_a_vehicle_to_a_vin_already_active_elsewhere_is_blocked(): void
    {
        $this->vehicleFor($this->makeMember(), ['vin' => $this->vin(14)]);
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);

        $this->put("/account/garage/{$vehicle->public_id}", [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'year' => 2023,
            'market_version' => 'europe',
            'vin' => $this->vin(14),
        ])->assertSessionHasErrors('vin');
        $this->assertNull($vehicle->fresh()->vin_hash);

        // re-submitting the vehicle's own VIN is not a duplicate of itself
        $vehicle->forceFill(['vin' => $this->vin(15)])->save();
        $this->put("/account/garage/{$vehicle->public_id}", [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'year' => 2023,
            'market_version' => 'europe',
            'vin' => $this->vin(15),
        ])->assertSessionHasNoErrors();
    }

    public function test_database_refuses_two_active_vehicles_with_the_same_vin(): void
    {
        $this->vehicleFor($this->makeMember(), ['vin' => $this->vin(16)]);

        // Simulates the second of two concurrent registrations that both passed the application check.
        $this->expectException(UniqueConstraintViolationException::class);
        $this->vehicleFor($this->makeMember(), ['vin' => $this->vin(16)]);
    }

    public function test_a_concurrent_registration_of_the_same_vin_is_reported_as_a_duplicate_vin_error(): void
    {
        $member = $this->makeMember();
        $other = $this->makeMember();
        $template = $this->vehicleFor($this->makeMember());
        $vin = $this->vin(17);

        // Another request registers the same VIN between our duplicate check and our INSERT.
        $raced = false;
        MemberVehicle::creating(function (MemberVehicle $vehicle) use (&$raced, $other, $template, $vin) {
            if ($raced || $vehicle->vin_hash !== MemberVehicle::hashVin($vin)) {
                return;
            }
            $raced = true;
            DB::table('member_vehicles')->insert([
                'public_id' => (string) Str::ulid(),
                'user_id' => $other->id,
                'membership_id' => $other->membership->id,
                'vehicle_make_id' => $template->vehicle_make_id,
                'vehicle_model_id' => $template->vehicle_model_id,
                'year' => 2022,
                'market_version' => 'europe',
                'vin' => encrypt($vin, false),
                'vin_hash' => MemberVehicle::hashVin($vin),
                'status' => 'active',
                'is_primary' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        try {
            app(CreateMemberVehicle::class)->execute($member, [
                'vehicle_make_id' => $template->vehicle_make_id,
                'vehicle_model_id' => $template->vehicle_model_id,
                'year' => 2022,
                'vin' => $vin,
            ]);
            $this->fail('Expected a duplicate VIN error.');
        } catch (DomainException $e) {
            $this->assertSame('vehicles.errors.vin_duplicate', $e->key);
            $this->assertSame('vin', $e->field);
        }
        $this->assertTrue($raced);
        $this->assertSame(0, MemberVehicle::query()->forUser($member)->count());
    }

    public function test_at_most_one_primary_vehicle_per_member_is_enforced_by_the_database(): void
    {
        $member = $this->makeMember();
        $this->vehicleFor($member, ['is_primary' => true]);

        $this->expectException(UniqueConstraintViolationException::class);
        $this->vehicleFor($member, ['is_primary' => true]);
    }

    public function test_repeated_primary_and_status_changes_are_idempotent(): void
    {
        $member = $this->makeMember();
        $a = $this->vehicleFor($member, ['is_primary' => true]);
        $b = $this->vehicleFor($member);

        $set = app(SetPrimaryVehicle::class);
        $set->execute($b, $member);
        $set->execute($b, $member);
        $set->execute($a, $member);
        $set->execute($b, $member);

        $this->assertSame(1, MemberVehicle::query()->forUser($member)->primary()->count());
        $this->assertTrue($b->fresh()->is_primary);

        $change = app(ChangeVehicleStatus::class);
        $change->execute($a, VehicleStatus::Archived, $member);
        $change->execute($a, VehicleStatus::Archived, $member);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'vehicles.status_changed')->count());
    }

    public function test_first_vehicle_of_each_member_becomes_primary_even_when_created_back_to_back(): void
    {
        $member = $this->makeMember();
        $model = $this->vehicleFor($this->makeMember());
        $create = app(CreateMemberVehicle::class);
        $data = ['vehicle_make_id' => $model->vehicle_make_id, 'vehicle_model_id' => $model->vehicle_model_id, 'year' => 2021];

        $first = $create->execute($member, $data);
        $second = $create->execute($member, $data);

        $this->assertTrue($first->is_primary);
        $this->assertFalse($second->is_primary);
    }
}
