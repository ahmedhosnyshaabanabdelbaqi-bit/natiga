<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\Enums\OdometerSource;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleOdometerEntry;
use App\Support\Exceptions\DomainException;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Records a new odometer reading. A reading lower than the current one requires a reason
 * (odometer replacement, previous typo...). Every call appends to vehicle_odometer_history.
 * Other modules (Maintenance service records, imports) call this with their own source.
 */
final class UpdateOdometer
{
    public function __construct(private AuditService $audit) {}

    /**
     * @param  CarbonInterface|null  $recordedAt  null = a reading taken now (becomes the current one). A past date backfills
     *                                            history (service records, imports) and only becomes current when it is
     *                                            not older than the vehicle's current reading.
     */
    public function execute(MemberVehicle $vehicle, User $actor, int $odometerKm, ?string $reason = null, OdometerSource $source = OdometerSource::Manual, ?CarbonInterface $recordedAt = null): VehicleOdometerEntry
    {
        if ($odometerKm < 0) {
            throw DomainException::because('garage.odometer.invalid', field: 'odometer_km');
        }
        $reason = $reason !== null && trim($reason) !== '' ? trim($reason) : null;
        $backfill = $recordedAt !== null;
        $recordedAt ??= now();

        return DB::transaction(function () use ($vehicle, $actor, $odometerKm, $reason, $source, $recordedAt, $backfill) {
            $vehicle = MemberVehicle::query()->whereKey($vehicle->id)->lockForUpdate()->firstOrFail();
            $previous = $vehicle->odometer_km;

            // Members only record readings for cars they still drive; service records / imports may backfill any vehicle.
            if ($source === OdometerSource::Manual && ! $vehicle->isActive()) {
                throw DomainException::because('garage.odometer.inactive', field: 'odometer_km');
            }

            $becomesCurrent = ! $backfill
                || $vehicle->odometer_updated_at === null
                || $recordedAt->greaterThanOrEqualTo($vehicle->odometer_updated_at);

            // A new current reading lower than the previous one needs an explanation (typo, odometer replaced...).
            if ($becomesCurrent && $previous !== null && $odometerKm < $previous && ($reason === null || mb_strlen($reason) < 5)) {
                throw DomainException::because('garage.odometer.decrease_requires_reason', ['previous' => $previous], 'reason');
            }

            $entry = $vehicle->odometerHistory()->create([
                'odometer_km' => $odometerKm,
                'source' => $source,
                'recorded_at' => $recordedAt,
                'note' => $reason,
                'created_by' => $actor->id,
            ]);

            if ($becomesCurrent) {
                $vehicle->forceFill(['odometer_km' => $odometerKm, 'odometer_updated_at' => $recordedAt])->save();
            }

            $this->audit->log('vehicles.odometer_updated', $vehicle,
                old: ['odometer_km' => $previous],
                new: ['odometer_km' => $odometerKm, 'source' => $source->value, 'current' => $becomesCurrent],
                reason: $reason, actor: $actor, entityLabel: $vehicle->displayName());

            return $entry;
        });
    }
}
