<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Staff correction of a member vehicle (see CorrectMemberVehicle). */
class CorrectMemberVehicleRequest extends FormRequest
{
    public function authorize(): bool
    {
        $vehicle = $this->route('vehicle');

        return $vehicle instanceof MemberVehicle && ($this->user()?->can('adminUpdate', $vehicle) ?? false);
    }

    protected function prepareForValidation(): void
    {
        foreach (['vehicle_variant_id', 'battery_variant_id', 'status'] as $key) {
            if ($this->input($key) === '' || $this->input($key) === 'none') {
                $this->merge([$key => null]);
            }
        }
    }

    public function rules(): array
    {
        return [
            'vehicle_make_id' => ['required', 'integer', Rule::exists('vehicle_makes', 'id')],
            'vehicle_model_id' => ['required', 'integer', Rule::exists('vehicle_models', 'id')->where('vehicle_make_id', (int) $this->input('vehicle_make_id'))],
            'vehicle_variant_id' => ['nullable', 'integer', Rule::exists('vehicle_variants', 'id')->where('vehicle_model_id', (int) $this->input('vehicle_model_id'))],
            'year' => ['required', 'integer', 'min:'.VehicleDataService::YEAR_MIN, 'max:'.VehicleDataService::YEAR_MAX],
            'market_version' => ['required', Rule::enum(MarketVersion::class)],
            'battery_variant_id' => ['nullable', 'integer', Rule::exists('battery_variants', 'id')],
            'status' => ['nullable', Rule::enum(VehicleStatus::class)],
            'clear_vin' => ['nullable', 'boolean'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'vehicle_model_id.exists' => __('vehicles.errors.model_not_in_make'),
            'vehicle_variant_id.exists' => __('vehicles.errors.variant_not_in_model'),
        ];
    }

    public function attributes(): array
    {
        return [
            'vehicle_make_id' => __('vehicles.fields.make'),
            'vehicle_model_id' => __('vehicles.fields.model'),
            'vehicle_variant_id' => __('vehicles.fields.variant'),
            'year' => __('vehicles.fields.year'),
            'market_version' => __('vehicles.fields.market_version'),
            'battery_variant_id' => __('vehicles.fields.battery'),
            'status' => __('core.labels.status'),
            'reason' => __('core.labels.reason'),
        ];
    }
}
