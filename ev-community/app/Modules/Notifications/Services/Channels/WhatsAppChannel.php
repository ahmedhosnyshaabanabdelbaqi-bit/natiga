<?php

namespace App\Modules\Notifications\Services\Channels;

/**
 * WhatsApp is only ever "working" through a configured provider (Integrations module). Never assumed.
 * Override for tests / staging: config `ev.integrations.whatsapp.force_configured`.
 */
final class WhatsAppChannel
{
    public static function isConfigured(): bool
    {
        if (config('ev.integrations.whatsapp.force_configured') !== null) {
            return (bool) config('ev.integrations.whatsapp.force_configured');
        }

        return ProviderStatus::isConfigured('whatsapp') ?? false;
    }

    public static function driver(): string
    {
        return (string) config('ev.integrations.whatsapp.driver', 'none');
    }

    /** Provider-side template name used for notification messages (WhatsApp requires pre-approved templates). */
    public static function templateName(): string
    {
        return (string) config('ev.integrations.whatsapp.notification_template', 'ev_notification');
    }
}
