<?php

namespace Database\Factories\Integrations;

use App\Modules\Integrations\Models\Enums\IntegrationEventStatus;
use App\Modules\Integrations\Models\IntegrationEvent;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<IntegrationEvent>
 */
class IntegrationEventFactory extends Factory
{
    protected $model = IntegrationEvent::class;

    public function definition(): array
    {
        return [
            'provider' => 'map',
            'direction' => 'outbound',
            'operation' => 'geocode',
            'reference' => null,
            'status' => IntegrationEventStatus::Success,
            'duration_ms' => fake()->numberBetween(20, 900),
            'error' => null,
            'meta' => ['driver' => 'osm'],
            'created_at' => now(),
        ];
    }
}
