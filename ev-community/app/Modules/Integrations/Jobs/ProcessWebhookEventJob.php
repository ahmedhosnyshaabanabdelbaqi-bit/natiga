<?php

namespace App\Modules\Integrations\Jobs;

use App\Modules\Integrations\Exceptions\WebhookHandlerMissingException;
use App\Modules\Integrations\Models\Enums\IntegrationEventStatus;
use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use App\Modules\Integrations\Models\WebhookEvent;
use App\Modules\Integrations\Services\IntegrationEvents;
use App\Modules\Integrations\Services\WebhookHandlers;
use App\Modules\Integrations\Support\Sanitizer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Processes one stored webhook event through the WebhookHandlers registry.
 * received/failed → processing → processed | failed. Retried by the queue (5 tries, 30/60/300s);
 * a missing handler fails immediately without retries (a deploy must register one).
 */
class ProcessWebhookEventJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(public readonly int $webhookEventId) {}

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [30, 60, 300];
    }

    public function handle(): void
    {
        $event = DB::transaction(function (): ?WebhookEvent {
            $event = WebhookEvent::query()->whereKey($this->webhookEventId)->lockForUpdate()->first();
            if (! $event || $event->signature_valid !== true) {
                return null;
            }
            if (in_array($event->status, [WebhookEventStatus::Processed, WebhookEventStatus::Ignored, WebhookEventStatus::Processing], true)) {
                return null; // already done, refused, or being processed by another worker
            }
            $event->forceFill(['status' => WebhookEventStatus::Processing])->save();

            return $event;
        });
        if (! $event) {
            return;
        }

        $started = hrtime(true);
        try {
            WebhookHandlers::handle($event);
            $event->forceFill(['status' => WebhookEventStatus::Processed, 'processed_at' => now(), 'error' => null])->save();
            IntegrationEvents::record($event->provider, 'inbound', 'webhook.process', IntegrationEventStatus::Success, $this->elapsed($started), null, ['webhook_event_id' => $event->id, 'event_type' => $event->event_type], $event->external_event_id);
        } catch (WebhookHandlerMissingException $e) {
            $this->markFailed($event, $e, $started);
            // Not retryable: no module handles this provider yet. Admins can retry after a deploy.
        } catch (Throwable $e) {
            $this->markFailed($event, $e, $started);
            throw $e; // let the queue apply tries/backoff
        }
    }

    public function failed(?Throwable $exception): void
    {
        $event = WebhookEvent::query()->find($this->webhookEventId);
        if ($event && $event->status === WebhookEventStatus::Processing) {
            $event->forceFill(['status' => WebhookEventStatus::Failed, 'error' => Sanitizer::error($exception?->getMessage() ?? 'job failed', 1000)])->save();
        }
    }

    private function markFailed(WebhookEvent $event, Throwable $e, int|float $started): void
    {
        $event->forceFill([
            'status' => WebhookEventStatus::Failed,
            'retry_count' => $event->retry_count + 1,
            'error' => Sanitizer::error(class_basename($e).': '.$e->getMessage(), 1000),
        ])->save();
        IntegrationEvents::record($event->provider, 'inbound', 'webhook.process', IntegrationEventStatus::Failed, $this->elapsed($started), class_basename($e).': '.$e->getMessage(), ['webhook_event_id' => $event->id, 'event_type' => $event->event_type, 'retry_count' => $event->retry_count], $event->external_event_id);
    }

    private function elapsed(int|float $started): int
    {
        return (int) round((hrtime(true) - $started) / 1_000_000);
    }
}
