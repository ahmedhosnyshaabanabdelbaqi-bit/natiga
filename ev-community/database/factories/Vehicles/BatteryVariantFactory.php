<?php

namespace Database\Factories\Vehicles;

use App\Modules\Vehicles\Models\BatteryVariant;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<BatteryVariant> */
class BatteryVariantFactory extends Factory
{
    protected $model = BatteryVariant::class;

    public function definition(): array
    {
        $capacity = fake()->unique()->numberBetween(30, 120);

        return [
            'name' => $capacity.' kWh LFP',
            'capacity_kwh' => $capacity.'.00',
            'chemistry' => 'LFP',
            'notes' => 'approximate public spec; verify',
        ];
    }
}
