<?php

namespace App\Modules\Garage\Http\Requests;

class UpdateVehicleRequest extends VehicleRequest
{
    public function authorize(): bool
    {
        $vehicle = $this->route('vehicle');

        return $vehicle !== null && ($this->user()?->can('update', $vehicle) ?? false);
    }

    public function rules(): array
    {
        return $this->vehicleRules() + [
            'remove_image' => ['nullable', 'boolean'],
        ];
    }
}
