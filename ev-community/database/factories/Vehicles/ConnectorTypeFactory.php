<?php

namespace Database\Factories\Vehicles;

use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\CurrentType;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ConnectorType> */
class ConnectorTypeFactory extends Factory
{
    protected $model = ConnectorType::class;

    public function definition(): array
    {
        $code = 'conn_'.fake()->unique()->lexify('????');

        return [
            'code' => $code,
            'name_ar' => strtoupper($code),
            'name_en' => strtoupper($code),
            'current_type' => CurrentType::Ac,
            'is_active' => true,
            'sort_order' => 0,
        ];
    }

    public function dc(): static
    {
        return $this->state(fn () => ['current_type' => CurrentType::Dc]);
    }
}
