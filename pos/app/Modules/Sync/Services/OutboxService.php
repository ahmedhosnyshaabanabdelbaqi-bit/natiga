<?php

declare(strict_types=1);

namespace App\Modules\Sync\Services;

use App\Modules\Sync\Models\OutboxMessage;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Transactional outbox.
 *
 * Side effects (printing, notifications, e-invoice relays, webhooks) are queued
 * INSIDE the money transaction but executed AFTER it commits. A failed side
 * effect therefore never rolls back a completed sale, and a retry never repeats
 * the money.
 */
class OutboxService
{
    /** @param array<string,mixed> $payload */
    public function publish(string $topic, array $payload): OutboxMessage
    {
        return OutboxMessage::query()->create([
            'uuid' => (string) Str::uuid7(),
            'topic' => $topic,
            'payload' => $payload,
            'status' => 'pending',
            'available_at' => now(),
        ]);
    }

    /** @return Collection<int,OutboxMessage> */
    public function due(int $limit = 50)
    {
        return OutboxMessage::query()
            ->where('status', 'pending')
            ->where('available_at', '<=', now())
            ->orderBy('id')
            ->limit($limit)
            ->get();
    }

    public function markSent(OutboxMessage $message): void
    {
        $message->forceFill(['status' => 'sent', 'sent_at' => now()])->save();
    }

    /** Exponential backoff; gives up (status `dead`) after 8 attempts. */
    public function markFailed(OutboxMessage $message, string $error): void
    {
        $attempts = (int) $message->attempts + 1;

        $message->forceFill([
            'attempts' => $attempts,
            'last_error' => substr($error, 0, 2000),
            'status' => $attempts >= 8 ? 'dead' : 'pending',
            'available_at' => now()->addSeconds(min(3600, 2 ** $attempts * 5)),
        ])->save();
    }
}
