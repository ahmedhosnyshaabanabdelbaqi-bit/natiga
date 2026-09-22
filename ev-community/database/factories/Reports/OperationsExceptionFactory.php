<?php

namespace Database\Factories\Reports;

use App\Modules\Reports\Operations\Models\Enums\ExceptionCategory;
use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\ExceptionStatus;
use App\Modules\Reports\Operations\Models\OperationsException;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OperationsException>
 */
class OperationsExceptionFactory extends Factory
{
    protected $model = OperationsException::class;

    public function definition(): array
    {
        return [
            'category' => fake()->randomElement(ExceptionCategory::values()),
            'severity' => fake()->randomElement(ExceptionSeverity::values()),
            'title' => fake()->sentence(6),
            'details' => ['sample' => fake()->word()],
            'source' => 'factory',
            'dedup_key' => null,
            'status' => ExceptionStatus::Open,
            'detected_at' => now(),
            'occurrences' => 1,
        ];
    }

    public function p0(): static
    {
        return $this->state(fn () => ['severity' => ExceptionSeverity::P0]);
    }

    public function resolved(): static
    {
        return $this->state(fn () => ['status' => ExceptionStatus::Resolved, 'resolved_at' => now(), 'resolution' => 'fixed']);
    }
}
