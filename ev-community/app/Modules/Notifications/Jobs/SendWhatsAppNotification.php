<?php

namespace App\Modules\Notifications\Jobs;

use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\Channels\ProviderStatus;
use App\Modules\Notifications\Services\Channels\WhatsAppChannel;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Sends one WhatsApp delivery through the configured provider using the pre-approved notification template
 * (`ev.integrations.whatsapp.notification_template`, parameters: title, body, url). Never fakes a delivery.
 */
class SendWhatsAppNotification implements ShouldQueue
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
        $provider = WhatsAppChannel::isConfigured() ? ProviderStatus::provider('whatsapp') : null;
        if ($provider === null || ! method_exists($provider, 'sendTemplate') || ! class_exists('App\\Modules\\Integrations\\Contracts\\Data\\WhatsAppTemplateMessage')) {
            $delivery->markSkipped(NotificationDelivery::SKIP_NOT_CONFIGURED);

            return;
        }

        $delivery->increment('attempts');
        try {
            $messageClass = 'App\\Modules\\Integrations\\Contracts\\Data\\WhatsAppTemplateMessage';
            $parameters = [$notification->title, $notification->body, app(NotificationService::class)->absoluteUrl($notification->url)];
            $result = $provider->sendTemplate(new $messageClass($user->mobile, WhatsAppChannel::templateName(), $parameters, $user->preferredLocale(), 'notification:'.$notification->public_id));
            SendSmsNotification::record($delivery, $result, WhatsAppChannel::driver());
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
