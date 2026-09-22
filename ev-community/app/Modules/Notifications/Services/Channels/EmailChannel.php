<?php

namespace App\Modules\Notifications\Services\Channels;

/**
 * Email availability. Prefers the Integrations module's provider status (written in parallel);
 * falls back to the mail driver: `log`/`array` are never real deliveries.
 * Override for tests / staging: config `ev.integrations.email.force_configured`.
 */
final class EmailChannel
{
    public static function isConfigured(): bool
    {
        if (config('ev.integrations.email.force_configured') !== null) {
            return (bool) config('ev.integrations.email.force_configured');
        }
        $viaIntegrations = ProviderStatus::isConfigured('email');
        if ($viaIntegrations !== null) {
            return $viaIntegrations;
        }

        return ! in_array((string) config('mail.default'), ['log', 'array', '', 'null'], true);
    }

    public static function driver(): string
    {
        return (string) config('mail.default', 'log');
    }
}
