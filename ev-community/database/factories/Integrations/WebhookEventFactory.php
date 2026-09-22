<?php

namespace Database\Factories\Integrations;

use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use App\Modules\Integrations\Models\WebhookEvent;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<WebhookEvent>
 */
class WebhookEventFactory extends Factory
{
    protected $model = WebhookEvent::class;

    public function definition(): array
    {
        $eventId = 'evt_'.Str::lower(Str::random(16));

        return [
            'provider' => 'payment',
            'event_type' => 'transaction.processed',
            'external_event_id' => $eventId,
            'fingerprint' => hash('sha256', 'payment|'.$eventId),
            'headers' => ['content-type' => 'application/json'],
            'payload' => ['id' => $eventId, 'type' => 'transaction.processed', 'status' => 'paid'],
            'signature_valid' => true,
            'status' => WebhookEventStatus::Received,
            'retry_count' => 0,
            'received_at' => now(),
        ];
    }

    public function failed(?string $error = 'handler failed'): static
    {
        return $this->state(fn () => ['status' => WebhookEventStatus::Failed, 'error' => $error, 'retry_count' => 1]);
    }

    public function processed(): static
    {
        return $this->state(fn () => ['status' => WebhookEventStatus::Processed, 'processed_at' => now()]);
    }

    public function ignored(): static
    {
        return $this->state(fn () => ['status' => WebhookEventStatus::Ignored, 'signature_valid' => false]);
    }
}
