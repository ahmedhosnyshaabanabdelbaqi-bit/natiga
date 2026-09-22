<?php

namespace App\Modules\Integrations\Services;

use App\Modules\Integrations\Contracts\ChargingProvider;
use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\EmailProvider;
use App\Modules\Integrations\Contracts\ExchangeRateProvider;
use App\Modules\Integrations\Contracts\Integration;
use App\Modules\Integrations\Contracts\MapProvider;
use App\Modules\Integrations\Contracts\PaymentProvider;
use App\Modules\Integrations\Contracts\ShippingProvider;
use App\Modules\Integrations\Contracts\SmsProvider;
use App\Modules\Integrations\Contracts\WhatsAppProvider;

/**
 * Static entry point used by business modules:
 *
 *   Integrations::map()->geocode('...');            Integrations::isConfigured('payment');
 *   Integrations::status('shipping');               Integrations::matrix();
 */
final class Integrations
{
    public static function manager(): IntegrationManager
    {
        return app(IntegrationManager::class);
    }

    public static function payment(): PaymentProvider
    {
        return self::manager()->payment();
    }

    public static function map(): MapProvider
    {
        return self::manager()->map();
    }

    public static function email(): EmailProvider
    {
        return self::manager()->email();
    }

    public static function sms(): SmsProvider
    {
        return self::manager()->sms();
    }

    public static function whatsapp(): WhatsAppProvider
    {
        return self::manager()->whatsapp();
    }

    public static function shipping(): ShippingProvider
    {
        return self::manager()->shipping();
    }

    public static function charging(): ChargingProvider
    {
        return self::manager()->charging();
    }

    public static function exchangeRate(): ExchangeRateProvider
    {
        return self::manager()->exchangeRate();
    }

    public static function resolve(string $key): Integration
    {
        return self::manager()->resolve($key);
    }

    public static function isConfigured(string $key): bool
    {
        return self::manager()->isConfigured($key);
    }

    /** @return array{key: string, status: string, driver: string, configured: bool, last_checked_at: ?string, last_success_at: ?string, last_error: ?string, fallback: string} */
    public static function status(string $key): array
    {
        return self::manager()->status($key);
    }

    public static function check(string $key): HealthResult
    {
        return self::manager()->check($key);
    }

    /** @return array<string, HealthResult> */
    public static function checkAll(): array
    {
        return self::manager()->checkAll();
    }

    /** @return array<int, array<string, mixed>> */
    public static function matrix(): array
    {
        return self::manager()->matrix();
    }

    public static function extend(string $category, string $driver, string $class): void
    {
        self::manager()->extend($category, $driver, $class);
    }

    /** @return string[] */
    public static function keys(): array
    {
        return IntegrationManager::CATEGORIES;
    }
}
