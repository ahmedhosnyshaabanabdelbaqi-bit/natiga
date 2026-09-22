<?php

namespace App\Modules\Integrations\Services;

use App\Modules\Integrations\Models\Enums\IntegrationEventStatus;
use App\Modules\Integrations\Models\IntegrationEvent;
use App\Modules\Integrations\Support\Sanitizer;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Structured, secret-free log of every integration call (DB row + application log line).
 * Recording never throws: a logging failure must not break the business call.
 */
final class IntegrationEvents
{
    /** @param  array<string, mixed>  $meta */
    public static function record(string $provider, string $direction, string $operation, IntegrationEventStatus|string $status, ?int $durationMs = null, ?string $error = null, array $meta = [], ?string $reference = null): ?IntegrationEvent
    {
        $status = $status instanceof IntegrationEventStatus ? $status : IntegrationEventStatus::from($status);
        $error = Sanitizer::error($error, 1000);
        $meta = Sanitizer::redact($meta);
        $context = ['provider' => $provider, 'direction' => $direction, 'operation' => $operation, 'status' => $status->value, 'duration_ms' => $durationMs, 'reference' => $reference, 'error' => $error, 'meta' => $meta, 'request_id' => ev_request_id()];

        $status === IntegrationEventStatus::Success
            ? Log::channel(config('logging.default'))->info('integration.call', $context)
            : Log::channel(config('logging.default'))->warning('integration.call', $context);

        try {
            return IntegrationEvent::query()->create([
                'provider' => mb_substr($provider, 0, 40),
                'direction' => $direction,
                'operation' => mb_substr($operation, 0, 80),
                'reference' => $reference !== null ? mb_substr($reference, 0, 191) : null,
                'status' => $status,
                'duration_ms' => $durationMs !== null ? max(0, $durationMs) : null,
                'error' => $error,
                'meta' => $meta === [] ? null : $meta,
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            Log::error('integration.event_store_failed', ['error' => $e->getMessage(), 'provider' => $provider, 'operation' => $operation]);

            return null;
        }
    }
}
