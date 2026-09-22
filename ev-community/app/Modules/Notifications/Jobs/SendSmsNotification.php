<?php

namespace App\Modules\Notifications\Jobs;

use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\Channels\ProviderStatus;
use App\Modules\Notifications\Services\Channels\SmsChannel;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use RuntimeException;
use Throwable;

/**
 * Sends one SMS delivery through the configured provider (Integrations module). Never fakes a delivery:
 * without a configured provider the delivery is `skipped:not_configured`.
 */
class SendSmsNotification implements ShouldQueue
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
        $delivery = NotificationDelivery::query()->with('notification.user')->find($this->deliveryId);
        if ($delivery === null || $delivery->status !== DeliveryStatus::Queued) {
            return;
        }
        $notification = $delivery->notification;
        $user = $notification?->user;
        if ($notification === null || $user === null || ! $user->mobile) {
            $delivery->markSkipped(NotificationDelivery::SKIP_NO_MOBILE);

            return;
        }
        $provider = SmsChannel::isConfigured() ? ProviderStatus::provider('sms') : null;
        if ($provider === null || ! method_exists($provider, 'send') || ! class_exists('App\\Modules\\Integrations\\Contracts\\Data\\SmsMessage')) {
            $delivery->markSkipped(NotificationDelivery::SKIP_NOT_CONFIGURED);

            return;
        }

        $delivery->increment('attempts');
        try {
            $messageClass = 'App\\Modules\\Integrations\\Contracts\\Data\\SmsMessage';
            $body = mb_substr(trim($notification->title."\n".$notification->body.($notification->url ? "\n".app(\App\Modules\Notifications\Services\NotificationService::class)->absoluteUrl($notification->url) : '')), 0, 480);
            $result = $provider->send(new $messageClass($user->mobile, $body, 'notification:'.$notification->public_id, $user->preferredLocale()));
            $this->record($delivery, $result, SmsChannel::driver());
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

    /** Maps the provider SendResult (sent|queued|logged|failed) onto the delivery. */
    public static function record(NotificationDelivery $delivery, object $result, string $provider): void
    {
        $status = is_object($result->status ?? null) && property_exists($result->status, 'value') ? (string) $result->status->value : (string) ($result->status ?? 'failed');
        $messageId = isset($result->providerMessageId) && is_string($result->providerMessageId) ? $result->providerMessageId : null;
        match ($status) {
            'sent', 'queued' => $delivery->markSent($provider, $messageId),
            'logged' => $delivery->markSkipped(NotificationDelivery::SKIP_NOT_CONFIGURED),
            default => throw new RuntimeException((string) ($result->error ?? 'Provider rejected the message')),
        };
    }
}
