<?php

namespace App\Modules\Notifications\Jobs;

use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\Channels\EmailChannel;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Sends one email delivery. Idempotent: only `queued` deliveries are sent, so a retried/duplicated job never
 * double-sends. 3 attempts with 30s/2m/10m backoff; the final failure marks the delivery `failed` with the error.
 */
class SendEmailNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public readonly int $deliveryId) {}

    /** @return int[] */
    public function backoff(): array
    {
        return [30, 120, 600];
    }

    public function handle(): void
    {
        $delivery = NotificationDelivery::query()->with('notification.user.membership')->find($this->deliveryId);
        if ($delivery === null || $delivery->status !== DeliveryStatus::Queued) {
            return;
        }
        $notification = $delivery->notification;
        $user = $notification?->user;
        if ($notification === null || $user === null || ! filter_var($user->email, FILTER_VALIDATE_EMAIL)) {
            $delivery->markSkipped(NotificationDelivery::SKIP_NO_EMAIL);

            return;
        }
        if (! EmailChannel::isConfigured()) {
            $delivery->markSkipped(NotificationDelivery::SKIP_NOT_CONFIGURED);

            return;
        }

        $delivery->increment('attempts');
        try {
            $locale = $user->preferredLocale();
            Mail::to($user->email, $user->name)->locale($locale)->send(new NotificationMail($notification, $user, $locale));
            $delivery->markSent(EmailChannel::driver());
        } catch (Throwable $e) {
            $delivery->forceFill(['error' => mb_substr($e->getMessage(), 0, 2000)])->save();
            throw $e;
        }
    }

    public function failed(?Throwable $exception): void
    {
        $delivery = NotificationDelivery::query()->find($this->deliveryId);
        if ($delivery !== null && $delivery->status === DeliveryStatus::Queued) {
            $delivery->markFailed($exception?->getMessage() ?? 'failed');
        }
    }
}
