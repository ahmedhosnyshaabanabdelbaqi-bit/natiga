<?php

namespace App\Modules\Notifications\Services\Channels;

/**
 * SMS is only ever "working" through a configured provider (`Integrations::sms()`). Never assumed.
 * The development `log` driver counts as configured outside production, but its `logged` results are recorded
 * as `skipped:not_configured` deliveries (never as sent).
 */
final class SmsChannel
{
    public static function isConfigured(): bool
    {
        return ProviderStatus::isConfigured('sms');
    }

    public static function driver(): string
    {
        return ProviderStatus::driver('sms');
    }
}
