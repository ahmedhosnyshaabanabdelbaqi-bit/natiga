<?php

namespace Tests\Feature\Garage;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Vehicles\Actions\UpdateOdometer;
use App\Modules\Vehicles\Models\Enums\OdometerSource;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Vehicles\VehicleFixtures;
use Tests\TestCase;

class OdometerTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    public function test_increase_is_recorded_in_history_and_audited(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);

        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 15000])->assertSessionHasNoErrors()->assertRedirect();
        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 16500])->assertSessionHasNoErrors();

        $vehicle->refresh();
        $this->assertSame(16500, $vehicle->odometer_km);
        $this->assertNotNull($vehicle->odometer_updated_at);
        $this->assertSame([16500, 15000], $vehicle->odometerHistory()->pluck('odometer_km')->all());
        $this->assertSame(2, AuditLog::query()->where('action', 'vehicles.odometer_updated')->count());
    }

    public function test_decrease_requires_a_reason_and_writes_history_with_it(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);
        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 20000]);

        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 2000])->assertSessionHasErrors('reason');
        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 2000, 'reason' => 'typo'])->assertSessionHasErrors('reason');
        $this->assertSame(20000, $vehicle->fresh()->odometer_km);
        $this->assertSame(1, $vehicle->odometerHistory()->count());

        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 2000, 'reason' => 'Typo in the previous reading (extra zero)'])
            ->assertSessionHasNoErrors();

        $this->assertSame(2000, $vehicle->fresh()->odometer_km);
        $latest = $vehicle->odometerHistory()->first();
        $this->assertSame(2000, $latest->odometer_km);
        $this->assertSame('Typo in the previous reading (extra zero)', $latest->note);
        $audit = AuditLog::query()->where('action', 'vehicles.odometer_updated')->latest('id')->first();
        $this->assertSame(['odometer_km' => 20000], $audit->old_values);
        $this->assertSame('Typo in the previous reading (extra zero)', $audit->reason);
    }

    public function test_validation_rejects_negative_and_absurd_values(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);

        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => -1])->assertSessionHasErrors('odometer_km');
        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 99999999])->assertSessionHasErrors('odometer_km');
        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 'abc'])->assertSessionHasErrors('odometer_km');
        $this->assertSame(0, $vehicle->odometerHistory()->count());
    }

    public function test_members_cannot_record_readings_for_sold_vehicles_but_service_records_can_backfill(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member, ['status' => VehicleStatus::Sold]);

        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 5000])->assertSessionHasErrors('odometer_km');
        $this->assertSame(0, $vehicle->odometerHistory()->count());

        // Other modules (Maintenance service records, imports) call the action with their own source.
        app(UpdateOdometer::class)->execute($vehicle, $member, 4800, null, OdometerSource::ServiceRecord, now()->subMonth());
        $entry = $vehicle->odometerHistory()->sole();
        $this->assertSame(OdometerSource::ServiceRecord, $entry->source);
    }

    public function test_backfilled_older_reading_does_not_replace_the_current_one(): void
    {
        $member = $this->actingAsMember();
        $vehicle = $this->vehicleFor($member);
        $this->post("/account/garage/{$vehicle->public_id}/odometer", ['odometer_km' => 30000]);

        app(UpdateOdometer::class)->execute($vehicle, $member, 25000, 'Service record from last year', OdometerSource::Import, now()->subYear());

        $this->assertSame(30000, $vehicle->fresh()->odometer_km);
        $this->assertSame(2, $vehicle->odometerHistory()->count());
    }
}
