<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\MemberVehicle;

/** Returns the decrypted VIN and leaves an audit trail ('vehicles.vin_revealed'). */
final class RevealVin
{
    public function __construct(private AuditService $audit) {}

    public function execute(MemberVehicle $vehicle, User $actor): ?string
    {
        $vin = $vehicle->vin;
        if ($vin === null) {
            return null;
        }
        $this->audit->log('vehicles.vin_revealed', $vehicle, new: ['vin_last4' => substr($vin, -4)], actor: $actor, entityLabel: $vehicle->displayName());

        return $vin;
    }
}
