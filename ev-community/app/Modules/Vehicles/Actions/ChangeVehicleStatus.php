<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\VehicleIntegrity;
use Illuminate\Support\Facades\DB;

/**
 * active ⇄ sold ⇄ archived. A sold/archived vehicle is never the primary one: the most recently added
 * remaining active vehicle is promoted. Re-activating a vehicle re-checks its VIN against the other
 * active vehicles (the VIN may have been registered by the new owner in the meantime).
 */
final class ChangeVehicleStatus
{
    public function __construct(private AuditService $audit, private VehicleIntegrity $integrity) {}

    public function execute(MemberVehicle $vehicle, VehicleStatus $to, User $actor, ?string $reason = null): MemberVehicle
    {
        $reason = $reason !== null && trim($reason) !== '' ? trim($reason) : null;

        return $this->integrity->guardVinUniqueness(fn () => DB::transaction(function () use ($vehicle, $to, $actor, $reason) {
            $this->integrity->lockGarage((int) $vehicle->user_id);
            $vehicle = MemberVehicle::query()->whereKey($vehicle->id)->lockForUpdate()->firstOrFail();
            $from = $vehicle->status;
            if ($from === $to) {
                return $vehicle; // idempotent
            }

            $changes = ['status' => $to];
            $promoted = null;
            if ($to === VehicleStatus::Active) {
                if ($vehicle->hasVin()) {
                    $this->integrity->assertVinNotDuplicated((string) $vehicle->vin, $vehicle);
                }
                if (! MemberVehicle::query()->where('user_id', $vehicle->user_id)->primary()->whereKeyNot($vehicle->id)->exists()) {
                    $changes['is_primary'] = true;
                }
            } elseif ($vehicle->is_primary) {
                $changes['is_primary'] = false; // a sold/archived vehicle can never be the primary one
            }
            $vehicle->forceFill($changes)->save();

            if (($changes['is_primary'] ?? null) === false) {
                $promoted = MemberVehicle::query()->where('user_id', $vehicle->user_id)->active()->whereKeyNot($vehicle->id)
                    ->orderByDesc('created_at')->orderByDesc('id')->lockForUpdate()->first();
                $promoted?->forceFill(['is_primary' => true])->save();
            }

            $this->audit->log('vehicles.status_changed', $vehicle,
                old: ['status' => $from->value],
                new: ['status' => $to->value] + ($promoted ? ['promoted_primary_vehicle_id' => $promoted->public_id] : []),
                reason: $reason, actor: $actor, entityLabel: $vehicle->displayName());

            return $vehicle;
        }));
    }
}
