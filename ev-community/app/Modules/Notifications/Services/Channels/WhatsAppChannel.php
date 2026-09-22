<?php

namespace App\Modules\Notifications\Services\Channels;

/**
 * WhatsApp is only ever "working" through a configured provider (`Integrations::whatsapp()`). Never assumed.
 */
final class WhatsAppChannel
{
    public static function isConfigured(): bool
    {
        return ProviderStatus::isConfigured('whatsapp');
    }

    public static function driver(): string
    {
        return ProviderStatus::driver('whatsapp');
    }

    /** Provider-side template name used for notification messages (WhatsApp requires pre-approved templates). */
    public static function templateName(): string
    {
        return (string) config('ev.integrations.whatsapp.notification_template', 'ev_notification');
    }
}
