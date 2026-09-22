<?php

namespace App\Modules\Notifications\Services\Channels;

use App\Modules\Integrations\Contracts\Integration;
use App\Modules\Integrations\Services\Integrations;
use Throwable;

/**
 * Thin bridge to the Integrations module (`Integrations::email()/sms()/whatsapp()`).
 * A provider that throws while being resolved is reported and treated as not configured: the notification
 * pipeline never fails because an integration is misconfigured, it records `skipped:not_configured` instead.
 */
final class ProviderStatus
{
    public static function isConfigured(string $category): bool
    {
        try {
            return Integrations::isConfigured($category);
        } catch (Throwable $e) {
            report($e);

            return false;
        }
    }

    /** The provider for a category (email|sms|whatsapp) or null when it cannot be resolved. */
    public static function provider(string $category): ?Integration
    {
        try {
            return Integrations::resolve($category);
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }

    public static function driver(string $category): string
    {
        return self::provider($category)?->driver() ?? 'none';
    }
}
