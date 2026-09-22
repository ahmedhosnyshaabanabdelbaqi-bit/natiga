<?php

namespace App\Modules\Vehicles\Services;

use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use App\Support\Exceptions\DomainException;

/** Cross-field business rules shared by create/update. */
final class VehicleIntegrity
{
    public function assertHierarchy(int $makeId, int $modelId, int|string|null $variantId): void
    {
        $model = VehicleModel::query()->find($modelId);
        if (! $model || (int) $model->vehicle_make_id !== $makeId) {
            throw DomainException::because('vehicles.errors.model_not_in_make', field: 'vehicle_model_id');
        }
        if ($variantId !== null && $variantId !== '') {
            $variant = VehicleVariant::query()->find((int) $variantId);
            if (! $variant || (int) $variant->vehicle_model_id !== $modelId) {
                throw DomainException::because('vehicles.errors.variant_not_in_model', field: 'vehicle_variant_id');
            }
        }
    }

    /** Exact duplicates across ACTIVE vehicles are blocked (sold/archived copies are tolerated). */
    public function assertVinNotDuplicated(string $vin, ?MemberVehicle $except = null): void
    {
        if (! MemberVehicle::isValidVin($vin)) {
            throw DomainException::because('vehicles.errors.vin_invalid', field: 'vin');
        }
        $query = MemberVehicle::query()->withVinHash($vin)->active();
        if ($except) {
            $query->whereKeyNot($except->id);
        }
        if ($query->exists()) {
            throw DomainException::because('vehicles.errors.vin_duplicate', field: 'vin');
        }
    }
}
