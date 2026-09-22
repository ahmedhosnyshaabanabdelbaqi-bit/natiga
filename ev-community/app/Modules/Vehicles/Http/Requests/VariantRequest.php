<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class VariantRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('vehicles.manage_master') ?? false;
    }

    public function rules(): array
    {
        $min = VehicleDataService::YEAR_MIN;
        $max = VehicleDataService::YEAR_MAX;

        return [
            'vehicle_model_id' => ['required', 'integer', Rule::exists('vehicle_models', 'id')],
            'name_ar' => ['required', 'string', 'max:160'],
            'name_en' => ['required', 'string', 'max:160'],
            'trim' => ['nullable', 'string', 'max:80'],
            'market_version' => ['required', Rule::enum(MarketVersion::class)],
            'year_from' => ['required', 'integer', "min:$min", "max:$max"],
            'year_to' => ['nullable', 'integer', "min:$min", "max:$max", 'gte:year_from'],
            'battery_variant_id' => ['nullable', 'integer', Rule::exists('battery_variants', 'id')],
            'ac_connector_type_id' => ['nullable', 'integer', Rule::exists('connector_types', 'id')->where('current_type', 'ac')],
            'dc_connector_type_id' => ['nullable', 'integer', Rule::exists('connector_types', 'id')->where('current_type', 'dc')],
            'battery_capacity_kwh' => ['nullable', 'numeric', 'min:1', 'max:500'],
            'motor_kw' => ['nullable', 'integer', 'min:1', 'max:2000'],
            'range_km_wltp' => ['nullable', 'integer', 'min:1', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:-1000', 'max:1000'],
        ];
    }
}
