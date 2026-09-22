<?php

namespace App\Modules\Garage\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOdometerRequest extends FormRequest
{
    public function authorize(): bool
    {
        $vehicle = $this->route('vehicle');

        return $vehicle !== null && ($this->user()?->can('update', $vehicle) ?? false);
    }

    public function rules(): array
    {
        return [
            'odometer_km' => ['required', 'integer', 'min:0', 'max:2000000'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function attributes(): array
    {
        return ['odometer_km' => __('vehicles.fields.odometer'), 'reason' => __('core.labels.reason')];
    }
}
