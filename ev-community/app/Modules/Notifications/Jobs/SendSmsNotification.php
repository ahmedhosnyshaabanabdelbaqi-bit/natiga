<?php

namespace App\Modules\Notifications\Jobs;

use App\Models\User;
use App\Modules\Integrations\Contracts\Data\SmsMessage;
use App\Modules\Integrations\Services\Integrations;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Notifications\Support\NotificationUrl;

/**
 * Sends one SMS delivery through `Integrations::sms()`. Never fakes a delivery: a `logged` result (development
 * driver) is recorded as `skipped:logged_only`, a provider failure is retried then marked `failed`.
 */
class SendSmsNotification extends DeliveryJob
{
    public const MAX_LENGTH = 480;

    protected function deliver(NotificationDelivery $delivery, Notification $notification, User $user, NotificationService $service): void
    {
        $provider = Integrations::sms();
        $result = $provider->send(new SmsMessage(
            (string) $user->mobile,
            self::body($notification),
            'notification:'.$notification->public_id,
            $user->preferredLocale(),
        ));
        $this->record($delivery, $result, $provider->driver());
    }

    protected function missingAddressReason(): string
    {
        return NotificationDelivery::SKIP_NO_MOBILE;
    }

    public static function body(Notification $notification): string
    {
        $link = $notification->url ? "\n".NotificationUrl::absolute($notification->url) : '';
        $text = trim($notification->title."\n".$notification->body);
        $room = self::MAX_LENGTH - mb_strlen($link);

        return (mb_strlen($text) > $room ? rtrim(mb_substr($text, 0, max(0, $room - 1))).'…' : $text).$link;
    }
}
