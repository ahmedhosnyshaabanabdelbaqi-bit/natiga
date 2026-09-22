<?php

namespace App\Modules\Notifications\Services\Channels;

/**
 * SMS is only ever "working" through a configured provider (Integrations module). Never assumed.
 * Override for tests / staging: config `ev.integrations.sms.force_configured`.
 */
final class SmsChannel
{
    public static function isConfigured(): bool
    {
        if (config('ev.integrations.sms.force_configured') !== null) {
            return (bool) config('ev.integrations.sms.force_configured');
        }

        return ProviderStatus::isConfigured('sms') ?? false;
    }

    public static function driver(): string
    {
        return (string) config('ev.integrations.sms.driver', 'none');
    }
}
