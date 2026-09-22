<?php

namespace App\Modules\Notifications\Jobs;

use App\Models\User;
use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\SendStatus;
use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\DeliveryFailures;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use RuntimeException;
use Throwable;

/**
 * Base for the per-channel delivery jobs. Retry semantics:
 *  - only `queued` deliveries are processed (a duplicated or late job never double-sends);
 *  - the channel rules (provider configured, preference, consent, address) are re-checked right before sending;
 *  - a short cache lock prevents two workers from sending the same delivery concurrently;
 *  - 3 attempts with 30 s / 2 min / 10 min backoff; the last failure marks the delivery `failed` with the error
 *    and raises a `notifications` exception in the Exception Center (see DeliveryFailures).
 */
abstract class DeliveryJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(public readonly int $deliveryId) {}

    /** @return int[] */
    public function backoff(): array
    {
        return [30, 120, 600];
    }

    public function handle(NotificationService $service): void
    {
        $lock = Cache::lock('notifications:delivery:'.$this->deliveryId, $this->timeout + 30);
        if (! $lock->get()) {
            $this->release(30);

            return;
        }

        try {
            $delivery = NotificationDelivery::query()->with('notification.user.membership')->find($this->deliveryId);
            if ($delivery === null || $delivery->status !== DeliveryStatus::Queued) {
                return;
            }
            $notification = $delivery->notification;
            $user = $notification?->user;
            if ($notification === null || $user === null) {
                $delivery->markSkipped($this->missingAddressReason());

                return;
            }
            $reason = $service->skipReasonFor($delivery, $notification, $user);
            if ($reason !== null) {
                $delivery->markSkipped($reason);

                return;
            }

            $delivery->increment('attempts');
            try {
                $this->deliver($delivery, $notification, $user, $service);
            } catch (Throwable $e) {
                $delivery->forceFill(['error' => DeliveryFailures::clean($e->getMessage())])->save();
                throw $e;
            }
        } finally {
            $lock->release();
        }
    }

    public function failed(?Throwable $exception): void
    {
        DeliveryFailures::record($this->deliveryId, $exception);
    }

    abstract protected function deliver(NotificationDelivery $delivery, Notification $notification, User $user, NotificationService $service): void;

    abstract protected function missingAddressReason(): string;

    /** Maps a provider SendResult onto the delivery; a provider failure throws so the queue retries. */
    protected function record(NotificationDelivery $delivery, SendResult $result, string $provider): void
    {
        match ($result->status) {
            SendStatus::Sent, SendStatus::Queued => $delivery->markSent($provider, $result->providerMessageId),
            SendStatus::Logged => $delivery->markSkipped(NotificationDelivery::SKIP_LOGGED_ONLY),
            SendStatus::Failed => throw new RuntimeException($result->error ?? 'Provider rejected the message'),
        };
    }
}
