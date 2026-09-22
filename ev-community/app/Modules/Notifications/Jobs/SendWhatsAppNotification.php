<?php

namespace App\Modules\Notifications\Jobs;

use App\Models\User;
use App\Modules\Integrations\Contracts\Data\WhatsAppTemplateMessage;
use App\Modules\Integrations\Services\Integrations;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\Channels\WhatsAppChannel;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Notifications\Support\NotificationUrl;

/**
 * Sends one WhatsApp delivery through `Integrations::whatsapp()` using the pre-approved notification template
 * (`ev.integrations.whatsapp.notification_template`, parameters: title, body, link). Never fakes a delivery.
 */
class SendWhatsAppNotification extends DeliveryJob
{
    protected function deliver(NotificationDelivery $delivery, Notification $notification, User $user, NotificationService $service): void
    {
        $provider = Integrations::whatsapp();
        $result = $provider->sendTemplate(new WhatsAppTemplateMessage(
            (string) $user->mobile,
            WhatsAppChannel::templateName(),
            [mb_substr($notification->title, 0, 200), mb_substr($notification->body, 0, 900), NotificationUrl::absolute($notification->url)],
            $user->preferredLocale(),
            'notification:'.$notification->public_id,
        ));
        $this->record($delivery, $result, $provider->driver());
    }

    protected function missingAddressReason(): string
    {
        return NotificationDelivery::SKIP_NO_MOBILE;
    }
}
