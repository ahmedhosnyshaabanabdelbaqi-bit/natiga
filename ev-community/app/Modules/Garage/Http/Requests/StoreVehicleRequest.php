<?php

namespace App\Modules\Garage\Http\Requests;

use App\Modules\Vehicles\Models\MemberVehicle;

class StoreVehicleRequest extends VehicleRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', MemberVehicle::class) ?? false;
    }

    public function rules(): array
    {
        return $this->vehicleRules() + [
            'odometer_km' => ['nullable', 'integer', 'min:0', 'max:2000000'],
        ];
    }
}
