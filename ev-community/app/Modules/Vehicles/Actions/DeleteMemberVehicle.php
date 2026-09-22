<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\VehicleImageStore;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;

/**
 * Hard-deletes an archived vehicle when no module objects (see VehicleDeletionGuards).
 */
final class DeleteMemberVehicle
{
    public function __construct(private AuditService $audit, private VehicleImageStore $images) {}

    public function execute(MemberVehicle $vehicle, User $actor, ?string $reason = null): void
    {
        DB::transaction(function () use ($vehicle, $actor, $reason) {
            $vehicle = MemberVehicle::query()->whereKey($vehicle->id)->lockForUpdate()->firstOrFail();
            if (($blocked = $vehicle->deletionBlockedReason()) !== null) {
                throw DomainException::because('garage.delete.blocked', ['reason' => $blocked]);
            }

            $label = $vehicle->displayName();
            $this->audit->log('vehicles.deleted', $vehicle, old: [
                'public_id' => $vehicle->public_id,
                'vehicle_make_id' => $vehicle->vehicle_make_id,
                'vehicle_model_id' => $vehicle->vehicle_model_id,
                'year' => $vehicle->year,
                'status' => $vehicle->status->value,
                'has_vin' => $vehicle->hasVin(),
            ], reason: $reason, actor: $actor, entityLabel: $label);

            $this->images->detach($vehicle);
            $vehicle->odometerHistory()->delete();
            $vehicle->delete();
        });
    }
}
