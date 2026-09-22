<?php

namespace Database\Factories\System;

use App\Modules\System\Models\StatusBanner;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StatusBanner>
 */
class StatusBannerFactory extends Factory
{
    protected $model = StatusBanner::class;

    public function definition(): array
    {
        return [
            'level' => fake()->randomElement(['information', 'warning', 'major']),
            'message_ar' => 'إشعار تجريبي '.fake()->word(),
            'message_en' => 'Sample notice '.fake()->word(),
            'targets' => ['public', 'member'],
            'is_active' => true,
            'starts_at' => null,
            'ends_at' => null,
        ];
    }
}
