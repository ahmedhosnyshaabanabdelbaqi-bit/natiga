<?php

namespace App\Modules\Notifications\Services\Channels;

/**
 * Email availability, from `Integrations::email()->isConfigured()` (a real mail transport; `log`/`array` never count).
 * `config('ev.integrations.email.force_configured') === true` forces it on (tests / staging); the default `false`
 * means "not forced", never "forced off".
 */
final class EmailChannel
{
    public static function isConfigured(): bool
    {
        if (config('ev.integrations.email.force_configured') === true) {
            return true;
        }

        return ProviderStatus::isConfigured('email');
    }

    public static function driver(): string
    {
        return (string) config('mail.default', 'log');
    }
}
