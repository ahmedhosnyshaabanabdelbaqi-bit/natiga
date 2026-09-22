<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SelectVehicleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // guests may pick a vehicle (stored in their session only)
    }

    protected function prepareForValidation(): void
    {
        foreach (['variant_id', 'year'] as $key) {
            if ($this->input($key) === '' || $this->input($key) === 'none') {
                $this->merge([$key => null]);
            }
        }
    }

    public function rules(): array
    {
        return [
            'make_id' => ['required', 'integer', Rule::exists('vehicle_makes', 'id')->where('is_active', true)],
            'model_id' => ['required', 'integer', Rule::exists('vehicle_models', 'id')->where('vehicle_make_id', (int) $this->input('make_id'))->where('is_active', true)],
            'variant_id' => ['nullable', 'integer', Rule::exists('vehicle_variants', 'id')->where('vehicle_model_id', (int) $this->input('model_id'))->where('is_active', true)],
            'year' => ['nullable', 'integer', 'min:'.VehicleDataService::YEAR_MIN, 'max:'.VehicleDataService::maxYear()],
        ];
    }

    public function messages(): array
    {
        return [
            'model_id.exists' => __('vehicles.errors.model_not_in_make'),
            'variant_id.exists' => __('vehicles.errors.variant_not_in_model'),
        ];
    }

    public function attributes(): array
    {
        return [
            'make_id' => __('vehicles.fields.make'),
            'model_id' => __('vehicles.fields.model'),
            'variant_id' => __('vehicles.fields.variant'),
            'year' => __('vehicles.fields.year'),
        ];
    }
}
