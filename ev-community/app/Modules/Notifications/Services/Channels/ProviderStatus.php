<?php

namespace App\Modules\Notifications\Services\Channels;

use Throwable;

/**
 * Thin bridge to `App\Modules\Integrations\Services\Integrations::<category>()` (written by another module).
 * Returns null when the Integrations service is not available yet so callers can apply their own fallback.
 */
final class ProviderStatus
{
    public const INTEGRATIONS = 'App\\Modules\\Integrations\\Services\\Integrations';

    public static function isConfigured(string $category): ?bool
    {
        $provider = self::provider($category);
        if ($provider === null) {
            return null;
        }
        try {
            return method_exists($provider, 'isConfigured') ? (bool) $provider->isConfigured() : null;
        } catch (Throwable $e) {
            report($e);

            return false;
        }
    }

    /** The provider object for a category (email|sms|whatsapp) or null when unavailable. */
    public static function provider(string $category): ?object
    {
        if (! class_exists(self::INTEGRATIONS) || ! method_exists(self::INTEGRATIONS, $category)) {
            return null;
        }
        try {
            $provider = self::INTEGRATIONS::$category();
        } catch (Throwable $e) {
            report($e);

            return null;
        }

        return is_object($provider) ? $provider : null;
    }
}
