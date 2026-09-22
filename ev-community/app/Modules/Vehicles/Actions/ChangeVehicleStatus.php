<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Support\Facades\DB;

final class ChangeVehicleStatus
{
    public function __construct(private AuditService $audit) {}

    public function execute(MemberVehicle $vehicle, VehicleStatus $to, User $actor, ?string $reason = null): MemberVehicle
    {
        return DB::transaction(function () use ($vehicle, $to, $actor, $reason) {
            $vehicle = MemberVehicle::query()->whereKey($vehicle->id)->lockForUpdate()->firstOrFail();
            $from = $vehicle->status;
            if ($from === $to) {
                return $vehicle; // idempotent
            }

            $changes = ['status' => $to];
            if ($to !== VehicleStatus::Active && $vehicle->is_primary) {
                $changes['is_primary'] = false; // a sold/archived vehicle can never be the primary one
            }
            $vehicle->forceFill($changes)->save();

            $this->audit->log('vehicles.status_changed', $vehicle, old: ['status' => $from->value], new: ['status' => $to->value], reason: $reason, actor: $actor, entityLabel: $vehicle->displayName());

            return $vehicle;
        });
    }
}
