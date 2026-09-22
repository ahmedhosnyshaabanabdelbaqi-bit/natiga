<?php

namespace Database\Factories\Vehicles;

use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<VehicleModel> */
class VehicleModelFactory extends Factory
{
    protected $model = VehicleModel::class;

    public function definition(): array
    {
        $name = 'Model '.strtoupper(fake()->unique()->lexify('??'));

        return [
            'vehicle_make_id' => VehicleMake::factory(),
            'slug' => Str::slug($name),
            'name_ar' => $name,
            'name_en' => $name,
            'body_type' => 'suv',
            'is_active' => true,
            'sort_order' => 0,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
