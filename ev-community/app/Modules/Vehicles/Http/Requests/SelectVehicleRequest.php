<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SelectVehicleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // guests may pick a vehicle (stored in their session)
    }

    public function rules(): array
    {
        return [
            'make_id' => ['required', 'integer', Rule::exists('vehicle_makes', 'id')->where('is_active', true)],
            'model_id' => ['required', 'integer', Rule::exists('vehicle_models', 'id')->where('vehicle_make_id', (int) $this->input('make_id'))],
            'variant_id' => ['nullable', 'integer', Rule::exists('vehicle_variants', 'id')->where('vehicle_model_id', (int) $this->input('model_id'))],
            'year' => ['nullable', 'integer', 'min:'.VehicleDataService::YEAR_MIN, 'max:'.VehicleDataService::YEAR_MAX],
        ];
    }
}
