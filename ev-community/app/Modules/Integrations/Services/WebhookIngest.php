<?php

namespace App\Modules\Integrations\Services;

use App\Modules\Integrations\Contracts\Data\WebhookIdentity;
use App\Modules\Integrations\Contracts\ReceivesWebhooks;
use App\Modules\Integrations\Jobs\ProcessWebhookEventJob;
use App\Modules\Integrations\Models\Enums\IntegrationEventStatus;
use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use App\Modules\Integrations\Models\WebhookEvent;
use App\Modules\Integrations\Support\Sanitizer;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Receives a provider callback: verifies the signature, stores the event idempotently
 * (unique provider + fingerprint) and queues processing. Returns the outcome for the HTTP layer.
 */
final class WebhookIngest
{
    public const ACCEPTED = 'accepted';

    public const DUPLICATE = 'duplicate';

    public const REJECTED = 'rejected';

    public const UNSUPPORTED = 'unsupported';

    private const MAX_RAW_BYTES = 262_144; // 256 KB stored at most

    public function __construct(private readonly IntegrationManager $manager) {}

    /** @return array{outcome: string, event: ?WebhookEvent} */
    public function ingest(string $category, Request $request): array
    {
        if (! in_array($category, IntegrationManager::CATEGORIES, true) || ! $this->manager->acceptsWebhooks($category)) {
            return ['outcome' => self::UNSUPPORTED, 'event' => null];
        }
        /** @var ReceivesWebhooks $provider */
        $provider = $this->manager->resolve($category);
        $driver = $this->manager->driverLabel($category);

        $raw = (string) $request->getContent();
        $valid = false;
        try {
            $valid = $provider->verifyWebhookSignature($request) === true;
        } catch (Throwable $e) {
            Log::warning('integration.webhook.signature_check_failed', ['provider' => $category, 'error' => Sanitizer::error($e->getMessage())]);
        }

        $identity = new WebhookIdentity;
        $identityError = null;
        if ($valid) {
            try {
                $identity = $provider->webhookIdentity($request);
            } catch (Throwable $e) {
                $identityError = Sanitizer::error(class_basename($e).': '.$e->getMessage());
            }
        }

        $fingerprint = $identity->externalEventId !== null && $identity->externalEventId !== ''
            ? hash('sha256', $category.'|'.$identity->externalEventId)
            : hash('sha256', $category.'|'.$raw);

        $attributes = [
            'provider' => $category,
            'event_type' => Sanitizer::truncate($identity->eventType, 80),
            'external_event_id' => Sanitizer::truncate($identity->externalEventId, 191),
            'fingerprint' => $fingerprint,
            'headers' => Sanitizer::headers($request->headers->all()) + ['_driver' => $driver],
            'payload' => $this->payload($request, $raw),
            'signature_valid' => $valid,
            'status' => $valid ? WebhookEventStatus::Received : WebhookEventStatus::Ignored,
            'retry_count' => 0,
            'error' => $valid ? $identityError : __('integrations.webhooks.signature_invalid'),
            'received_at' => now(),
        ];

        try {
            $event = WebhookEvent::query()->create($attributes);
        } catch (UniqueConstraintViolationException) {
            $existing = WebhookEvent::query()->where('provider', $category)->where('fingerprint', $fingerprint)->first();
            IntegrationEvents::record($category, 'inbound', 'webhook.duplicate', IntegrationEventStatus::Success, null, null, ['driver' => $driver, 'event_type' => $identity->eventType, 'signature_valid' => $valid], $identity->externalEventId);

            return ['outcome' => $existing?->signature_valid === false || ! $valid ? self::REJECTED : self::DUPLICATE, 'event' => $existing];
        }

        IntegrationEvents::record(
            $category,
            'inbound',
            'webhook.received',
            $valid ? IntegrationEventStatus::Success : IntegrationEventStatus::Failed,
            null,
            $valid ? null : 'invalid signature',
            ['driver' => $driver, 'event_type' => $identity->eventType, 'signature_valid' => $valid, 'webhook_event_id' => $event->id],
            $identity->externalEventId,
        );

        if (! $valid) {
            return ['outcome' => self::REJECTED, 'event' => $event];
        }

        ProcessWebhookEventJob::dispatch($event->id);

        return ['outcome' => self::ACCEPTED, 'event' => $event];
    }

    /** Re-queue a failed event (admin retry). */
    public function retry(WebhookEvent $event): void
    {
        $event->forceFill(['status' => WebhookEventStatus::Received, 'error' => null])->save();
        ProcessWebhookEventJob::dispatch($event->id);
    }

    /** @return array<string, mixed> */
    private function payload(Request $request, string $raw): array
    {
        if (strlen($raw) > self::MAX_RAW_BYTES) {
            return ['_truncated' => true, '_bytes' => strlen($raw), '_raw' => mb_substr($raw, 0, 4000)];
        }
        if ($request->isJson() || str_starts_with(ltrim($raw), '{') || str_starts_with(ltrim($raw), '[')) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return Sanitizer::redact($decoded);
            }

            return ['_raw' => $raw, '_json_error' => json_last_error_msg()];
        }
        $form = $request->post();
        if ($form !== []) {
            return Sanitizer::redact($form);
        }

        return ['_raw' => $raw];
    }
}
