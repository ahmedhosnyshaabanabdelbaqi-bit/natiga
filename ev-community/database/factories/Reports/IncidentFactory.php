<?php

namespace Database\Factories\Reports;

use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\IncidentStatus;
use App\Modules\Reports\Operations\Models\Incident;
use App\Support\Sequence\NumberSequence;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Incident>
 */
class IncidentFactory extends Factory
{
    protected $model = Incident::class;

    public function definition(): array
    {
        return [
            'number' => fn () => NumberSequence::next('incident'),
            'severity' => fake()->randomElement(ExceptionSeverity::values()),
            'title' => fake()->sentence(5),
            'affected_module' => 'orders',
            'impact' => fake()->sentence(10),
            'status' => IncidentStatus::Open,
            'started_at' => now()->subHour(),
            'detected_at' => now()->subMinutes(30),
        ];
    }

    public function resolved(): static
    {
        return $this->state(fn () => ['status' => IncidentStatus::Resolved, 'resolved_at' => now(), 'root_cause' => 'Root cause', 'resolution' => 'Resolution']);
    }
}
