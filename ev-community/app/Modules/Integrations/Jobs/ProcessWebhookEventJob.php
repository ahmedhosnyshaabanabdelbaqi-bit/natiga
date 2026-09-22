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
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Processes one stored webhook event through the WebhookHandlers registry.
 * received/failed → processing → processed | failed. Retried by the queue (5 tries, 30/60/300s);
 * a missing handler fails immediately without retries (a deploy must register one).
 *
 * A per-event cache lock (longer than the job timeout) marks the event as being worked on. An event
 * found in `processing` while nobody holds the lock was claimed by a worker that died (timeout, OOM,
 * deploy restart): it is reclaimed instead of staying stuck in `processing` forever.
 */
class ProcessWebhookEventJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    /** Seconds; must stay below the queue's retry_after (90) and the lock lifetime. */
    public int $timeout = 60;

    /** Lifetime of the per-event lock: longer than $timeout so a live worker never loses it. */
    public const LOCK_SECONDS = 150;

    /** Delay before looking again when another worker holds the event. */
    public const BUSY_RELEASE_SECONDS = 60;

    public function __construct(public readonly int $webhookEventId) {}

    public static function lockKey(int $webhookEventId): string
    {
        return 'integrations:webhook-event:'.$webhookEventId;
    }

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [30, 60, 300];
    }

    public function handle(): void
    {
        $lock = Cache::lock(self::lockKey($this->webhookEventId), self::LOCK_SECONDS);
        if (! $lock->get()) {
            // Another worker is processing this event right now: look again later (it is done by then,
            // or its worker died and the lock expired).
            $this->release(self::BUSY_RELEASE_SECONDS);

            return;
        }
        try {
            $this->process();
        } finally {
            $lock->release();
        }
    }

    private function process(): void
    {
        $event = DB::transaction(function (): ?WebhookEvent {
            $event = WebhookEvent::query()->whereKey($this->webhookEventId)->lockForUpdate()->first();
            if (! $event || $event->signature_valid !== true) {
                return null;
            }
            if (in_array($event->status, [WebhookEventStatus::Processed, WebhookEventStatus::Ignored], true)) {
                return null; // already done or refused
            }
            if ($event->status === WebhookEventStatus::Processing) {
                // We hold the event lock, so the worker that set `processing` is gone: reclaim the event.
                Log::warning('integration.webhook.stale_processing_reclaimed', ['webhook_event_id' => $event->id, 'provider' => $event->provider]);
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
