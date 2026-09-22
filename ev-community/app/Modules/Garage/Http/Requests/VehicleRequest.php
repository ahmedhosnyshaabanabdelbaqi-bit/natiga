<?php

namespace App\Modules\Garage\Http\Requests;

use App\Modules\Files\Rules\SafeUpload;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Shared rules for adding / editing a garage vehicle.
 *
 * New selections must be ACTIVE master data. When editing, the vehicle's current make/model/variant
 * stay valid even if an admin has deactivated them since (the member can still rename the car).
 */
abstract class VehicleRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $merge = [];
        if ($this->has('vin')) {
            $merge['vin'] = MemberVehicle::normalizeVin(is_string($this->input('vin')) ? $this->input('vin') : null);
        }
        if ($this->has('plate_hint')) {
            $plate = is_string($this->input('plate_hint')) ? mb_strtoupper(trim($this->input('plate_hint'))) : '';
            $merge['plate_hint'] = $plate === '' ? null : $plate;
        }
        foreach (['vehicle_variant_id', 'battery_variant_id', 'odometer_km'] as $key) {
            if ($this->input($key) === '' || $this->input($key) === 'none') {
                $merge[$key] = null;
            }
        }
        $this->merge($merge);
    }

    /** The vehicle being edited (null when adding). */
    protected function currentVehicle(): ?MemberVehicle
    {
        $vehicle = $this->route('vehicle');

        return $vehicle instanceof MemberVehicle ? $vehicle : null;
    }

    protected function vehicleRules(): array
    {
        $current = $this->currentVehicle();
        $activeOr = fn (?int $currentId) => fn (Builder $q) => $q->where(fn (Builder $w) => $w->where('is_active', true)
            ->when($currentId !== null, fn (Builder $c) => $c->orWhere('id', $currentId)));

        return [
            'vehicle_make_id' => ['required', 'integer', Rule::exists('vehicle_makes', 'id')->where($activeOr($current?->vehicle_make_id))],
            'vehicle_model_id' => ['required', 'integer', Rule::exists('vehicle_models', 'id')
                ->where('vehicle_make_id', (int) $this->input('vehicle_make_id'))
                ->where($activeOr($current?->vehicle_model_id))],
            'vehicle_variant_id' => ['nullable', 'integer', Rule::exists('vehicle_variants', 'id')
                ->where('vehicle_model_id', (int) $this->input('vehicle_model_id'))
                ->where($activeOr($current?->vehicle_variant_id))],
            'year' => ['required', 'integer', 'min:'.VehicleDataService::YEAR_MIN, 'max:'.VehicleDataService::maxYear()],
            'market_version' => ['required', Rule::enum(MarketVersion::class)],
            'battery_variant_id' => ['nullable', 'integer', Rule::exists('battery_variants', 'id')],
            'vin' => ['nullable', 'string', 'regex:'.MemberVehicle::VIN_PATTERN],
            'nickname' => ['nullable', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'max:40'],
            'plate_hint' => ['nullable', 'string', 'max:3'],
            'image' => ['nullable', 'file', new SafeUpload('image')],
        ];
    }

    public function messages(): array
    {
        return [
            'vin.regex' => __('vehicles.errors.vin_invalid'),
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
            'vin' => __('vehicles.fields.vin'),
            'nickname' => __('vehicles.fields.nickname'),
            'color' => __('vehicles.fields.color'),
            'plate_hint' => __('vehicles.fields.plate_hint'),
            'odometer_km' => __('vehicles.fields.odometer'),
            'image' => __('vehicles.fields.image'),
        ];
    }
}
