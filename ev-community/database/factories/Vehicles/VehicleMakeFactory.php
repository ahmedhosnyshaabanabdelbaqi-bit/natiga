<?php

namespace Database\Factories\Vehicles;

use App\Modules\Vehicles\Models\VehicleMake;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<VehicleMake> */
class VehicleMakeFactory extends Factory
{
    protected $model = VehicleMake::class;

    public function definition(): array
    {
        $name = ucfirst(fake()->unique()->lexify('????')).' Motors';

        return [
            'slug' => Str::slug($name),
            'name_ar' => $name,
            'name_en' => $name,
            'country_code' => 'CN',
            'is_active' => true,
            'sort_order' => 0,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
