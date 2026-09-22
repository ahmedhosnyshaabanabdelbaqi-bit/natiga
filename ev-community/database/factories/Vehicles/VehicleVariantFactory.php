<?php

namespace Database\Factories\Vehicles;

use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<VehicleVariant> */
class VehicleVariantFactory extends Factory
{
    protected $model = VehicleVariant::class;

    public function definition(): array
    {
        return [
            'vehicle_model_id' => VehicleModel::factory(),
            'name_ar' => 'المدى الطويل 64 ك.و.س',
            'name_en' => 'Long Range 64 kWh',
            'trim' => 'Long Range',
            'market_version' => MarketVersion::Europe,
            'year_from' => 2022,
            'year_to' => null,
            'battery_capacity_kwh' => '64.00',
            'motor_kw' => 150,
            'range_km_wltp' => 450,
            'notes' => 'approximate public spec; verify',
            'is_active' => true,
            'sort_order' => 0,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
