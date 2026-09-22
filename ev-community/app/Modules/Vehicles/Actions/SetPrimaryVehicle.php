<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;

final class SetPrimaryVehicle
{
    public function __construct(private AuditService $audit) {}

    public function execute(MemberVehicle $vehicle, User $actor): MemberVehicle
    {
        return DB::transaction(function () use ($vehicle, $actor) {
            $vehicle = MemberVehicle::query()->whereKey($vehicle->id)->lockForUpdate()->firstOrFail();
            if (! $vehicle->isActive()) {
                throw DomainException::because('garage.primary.must_be_active');
            }
            if ($vehicle->is_primary) {
                return $vehicle;
            }
            $previous = MemberVehicle::query()->where('user_id', $vehicle->user_id)->primary()->lockForUpdate()->first();
            $previous?->forceFill(['is_primary' => false])->save();
            $vehicle->forceFill(['is_primary' => true])->save();

            $this->audit->log('vehicles.primary_changed', $vehicle, old: ['primary_vehicle_id' => $previous?->public_id], new: ['primary_vehicle_id' => $vehicle->public_id], actor: $actor, entityLabel: $vehicle->displayName());

            return $vehicle;
        });
    }
}
