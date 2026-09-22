<?php

namespace App\Modules\Integrations\Services;

use App\Modules\Integrations\Contracts\ChargingProvider;
use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\HealthStatus;
use App\Modules\Integrations\Contracts\EmailProvider;
use App\Modules\Integrations\Contracts\ExchangeRateProvider;
use App\Modules\Integrations\Contracts\Integration;
use App\Modules\Integrations\Contracts\MapProvider;
use App\Modules\Integrations\Contracts\PaymentProvider;
use App\Modules\Integrations\Contracts\ReceivesWebhooks;
use App\Modules\Integrations\Contracts\ShippingProvider;
use App\Modules\Integrations\Contracts\SmsProvider;
use App\Modules\Integrations\Contracts\WhatsAppProvider;
use App\Modules\Integrations\Drivers\Charging\NotConfiguredChargingProvider;
use App\Modules\Integrations\Drivers\Email\NotConfiguredEmailProvider;
use App\Modules\Integrations\Drivers\ExchangeRate\NotConfiguredExchangeRateProvider;
use App\Modules\Integrations\Drivers\Map\NotConfiguredMapProvider;
use App\Modules\Integrations\Drivers\Payment\NotConfiguredPaymentProvider;
use App\Modules\Integrations\Drivers\Shipping\NotConfiguredShippingProvider;
use App\Modules\Integrations\Drivers\Sms\NotConfiguredSmsProvider;
use App\Modules\Integrations\Drivers\WhatsApp\NotConfiguredWhatsAppProvider;
use App\Modules\Integrations\Models\Enums\IntegrationEventStatus;
use App\Modules\Integrations\Models\IntegrationProvider;
use App\Modules\Integrations\Support\Sanitizer;
use Illuminate\Contracts\Container\Container;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use LogicException;
use Throwable;

/**
 * Resolves the configured driver per category (config ev.integrations.<category>.driver → class map),
 * runs health checks and exposes the status matrix. Unknown drivers, and log drivers in production,
 * resolve to the NotConfigured driver with a visible note — never to a fake "working" driver.
 */
final class IntegrationManager
{
    public const CATEGORIES = ['payment', 'map', 'email', 'sms', 'whatsapp', 'shipping', 'charging', 'exchange_rate'];

    /** @var array<string, class-string<Integration>> */
    public const CONTRACTS = [
        'payment' => PaymentProvider::class,
        'map' => MapProvider::class,
        'email' => EmailProvider::class,
        'sms' => SmsProvider::class,
        'whatsapp' => WhatsAppProvider::class,
        'shipping' => ShippingProvider::class,
        'charging' => ChargingProvider::class,
        'exchange_rate' => ExchangeRateProvider::class,
    ];

    /** @var array<string, class-string<Integration>> */
    public const NOT_CONFIGURED = [
        'payment' => NotConfiguredPaymentProvider::class,
        'map' => NotConfiguredMapProvider::class,
        'email' => NotConfiguredEmailProvider::class,
        'sms' => NotConfiguredSmsProvider::class,
        'whatsapp' => NotConfiguredWhatsAppProvider::class,
        'shipping' => NotConfiguredShippingProvider::class,
        'charging' => NotConfiguredChargingProvider::class,
        'exchange_rate' => NotConfiguredExchangeRateProvider::class,
    ];

    /** Environment variable names per category (names only, for the admin matrix and docs). */
    public const ENV = [
        'payment' => ['PAYMENT_PROVIDER', 'PAYMENT_API_KEY', 'PAYMENT_SECRET', 'PAYMENT_WEBHOOK_SECRET'],
        'map' => ['MAP_PROVIDER', 'MAP_PUBLIC_KEY', 'MAP_SERVER_KEY', 'MAP_TILE_URL', 'MAP_DEFAULT_LAT', 'MAP_DEFAULT_LNG', 'MAP_DEFAULT_ZOOM'],
        'email' => ['MAIL_MAILER', 'MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_SCHEME', 'MAIL_FROM_ADDRESS', 'MAIL_FROM_NAME'],
        'sms' => ['SMS_PROVIDER', 'SMS_API_KEY', 'SMS_SENDER_ID'],
        'whatsapp' => ['WHATSAPP_PROVIDER', 'WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
        'shipping' => ['SHIPPING_PROVIDER', 'SHIPPING_API_KEY'],
        'charging' => ['CHARGING_PROVIDER', 'CHARGING_API_KEY'],
        'exchange_rate' => ['EXCHANGE_RATE_PROVIDER', 'EXCHANGE_RATE_API_KEY'],
    ];

    /** Drivers that only write to the log; refused in production. */
    private const LOG_DRIVER = 'log';

    /** @var array<string, array<string, class-string<Integration>>> category => driver name => class ('*' = any name) */
    private array $drivers = [];

    /** @var array<string, Integration> */
    private array $resolved = [];

    /** @var array<string, string|null> */
    private array $notes = [];

    public function __construct(private readonly Container $app) {}

    /** Register (or override) a driver class for a category. Vendor packages call this from their ServiceProvider. */
    public function extend(string $category, string $driver, string $class): void
    {
        $this->assertCategory($category);
        if (! is_subclass_of($class, self::CONTRACTS[$category])) {
            throw new InvalidArgumentException(sprintf('Driver [%s] must implement %s', $class, self::CONTRACTS[$category]));
        }
        $this->drivers[$category][$driver] = $class;
        $this->forget($category);
    }

    /** @return array<string, array<string, class-string<Integration>>> */
    public function drivers(): array
    {
        return $this->drivers;
    }

    /** @return string[] */
    public function keys(): array
    {
        return self::CATEGORIES;
    }

    public function configuredDriverName(string $category): string
    {
        $this->assertCategory($category);

        return trim((string) config('ev.integrations.'.$category.'.driver', 'none'));
    }

    public function resolve(string $category): Integration
    {
        $this->assertCategory($category);
        if (isset($this->resolved[$category])) {
            return $this->resolved[$category];
        }

        $name = $this->configuredDriverName($category);
        $note = null;
        $class = $this->drivers[$category][$name] ?? $this->drivers[$category]['*'] ?? null;

        if ($name === '' || $name === 'none') {
            $class = self::NOT_CONFIGURED[$category];
        } elseif ($class === null) {
            $note = __('integrations.errors.unknown_driver', ['driver' => $name, 'integration' => __('integrations.categories.'.$category)]);
            Log::warning('integration.unknown_driver', ['category' => $category, 'driver' => $name]);
            $class = self::NOT_CONFIGURED[$category];
        } elseif ($name === self::LOG_DRIVER && $this->app->make('app')->isProduction()) {
            $note = __('integrations.errors.log_driver_production');
            Log::warning('integration.log_driver_in_production', ['category' => $category]);
            $class = self::NOT_CONFIGURED[$category];
        }

        $contract = self::CONTRACTS[$category];
        $instance = $this->app->make($class);
        if (! $instance instanceof $contract) {
            throw new LogicException(sprintf('Driver [%s] does not implement %s', $class, $contract));
        }
        $this->notes[$category] = $note;

        return $this->resolved[$category] = $instance;
    }

    /** Drop cached instances (after config changes, in tests). */
    public function forget(?string $category = null): void
    {
        if ($category === null) {
            $this->resolved = [];
            $this->notes = [];

            return;
        }
        unset($this->resolved[$category], $this->notes[$category]);
    }

    public function payment(): PaymentProvider
    {
        /** @var PaymentProvider */
        return $this->resolve('payment');
    }

    public function map(): MapProvider
    {
        /** @var MapProvider */
        return $this->resolve('map');
    }

    public function email(): EmailProvider
    {
        /** @var EmailProvider */
        return $this->resolve('email');
    }

    public function sms(): SmsProvider
    {
        /** @var SmsProvider */
        return $this->resolve('sms');
    }

    public function whatsapp(): WhatsAppProvider
    {
        /** @var WhatsAppProvider */
        return $this->resolve('whatsapp');
    }

    public function shipping(): ShippingProvider
    {
        /** @var ShippingProvider */
        return $this->resolve('shipping');
    }

    public function charging(): ChargingProvider
    {
        /** @var ChargingProvider */
        return $this->resolve('charging');
    }

    public function exchangeRate(): ExchangeRateProvider
    {
        /** @var ExchangeRateProvider */
        return $this->resolve('exchange_rate');
    }

    public function isConfigured(string $category): bool
    {
        $provider = $this->resolve($category);

        return ($this->notes[$category] ?? null) === null && $provider->isConfigured();
    }

    /** Human driver label for the matrix: configured name, flagged when it could not be honoured. */
    public function driverLabel(string $category): string
    {
        $name = $this->configuredDriverName($category);
        $this->resolve($category);
        if ($name === '') {
            $name = 'none';
        }

        return ($this->notes[$category] ?? null) !== null ? $name.' ✕' : $name;
    }

    public function acceptsWebhooks(string $category): bool
    {
        $provider = $this->resolve($category);
        if (! $provider instanceof ReceivesWebhooks || ! $this->isConfigured($category)) {
            return false;
        }

        return ! $provider instanceof ShippingProvider || $provider->supportsWebhooks();
    }

    /** @return string[] categories that currently accept POST /webhooks/{category} */
    public function webhookProviders(): array
    {
        return array_values(array_filter(self::CATEGORIES, fn (string $c) => $this->acceptsWebhooks($c)));
    }

    /**
     * @return array{key: string, status: string, driver: string, configured: bool, last_checked_at: ?string, last_success_at: ?string, last_error: ?string, fallback: string}
     */
    public function status(string $category): array
    {
        $configured = $this->isConfigured($category);
        $row = $this->row($category);
        $status = HealthStatus::NotConfigured;
        if ($configured) {
            $status = $row && $row->status !== HealthStatus::NotConfigured ? $row->status : HealthStatus::Unknown;
        }

        return [
            'key' => $category,
            'status' => $status->value,
            'driver' => $this->driverLabel($category),
            'configured' => $configured,
            'last_checked_at' => $row?->last_checked_at?->toIso8601String(),
            'last_success_at' => $row?->last_success_at?->toIso8601String(),
            'last_error' => $this->notes[$category] ?? ($status === HealthStatus::NotConfigured ? null : $row?->last_error),
            'fallback' => __('integrations.fallback.'.$category),
        ];
    }

    /** Runs the driver health check, upserts integration_providers, logs an integration_events row and syncs the ops exception. */
    public function check(string $category): HealthResult
    {
        $provider = $this->resolve($category);
        $note = $this->notes[$category] ?? null;
        $started = hrtime(true);
        try {
            $result = $note !== null ? HealthResult::notConfigured($note) : $provider->healthCheck();
        } catch (Throwable $e) {
            report($e);
            $result = HealthResult::unavailable(__('integrations.health.check_crashed', ['error' => class_basename($e)]), ['exception' => $e::class]);
        }
        $durationMs = (int) round((hrtime(true) - $started) / 1_000_000);
        $now = now();

        try {
            $row = IntegrationProvider::query()->firstOrNew(['key' => $category]);
            $row->driver = mb_substr($this->driverLabel($category), 0, 60);
            $row->status = $result->status;
            $row->last_checked_at = $now;
            if ($result->status->isHealthy()) {
                $row->last_success_at = $now;
            }
            $row->last_error = $result->status->isHealthy() ? null : Sanitizer::truncate($result->message, 1000);
            $row->public_config = $this->publicConfigFor($category, $provider);
            $row->save();
        } catch (Throwable $e) {
            report($e);
        }

        IntegrationEvents::record(
            $category,
            'outbound',
            'health_check',
            $result->status->isProblem() ? IntegrationEventStatus::Failed : IntegrationEventStatus::Success,
            $durationMs,
            $result->status->isProblem() ? $result->message : null,
            ['health' => $result->status->value, 'driver' => $this->driverLabel($category), 'details' => $result->meta],
        );
        OperationsExceptionsBridge::sync($category, $result);

        return $result;
    }

    /** @return array<string, HealthResult> */
    public function checkAll(): array
    {
        $out = [];
        foreach (self::CATEGORIES as $category) {
            $out[$category] = $this->check($category);
        }

        return $out;
    }

    /**
     * Status matrix for the admin page and the production readiness report.
     *
     * @return array<int, array<string, mixed>>
     */
    public function matrix(): array
    {
        $rows = [];
        foreach (self::CATEGORIES as $category) {
            $status = $this->status($category);
            $rows[] = $status + [
                'name' => __('integrations.categories.'.$category),
                'driver_label' => $this->driverDisplayName($category),
                'webhook_url' => $this->acceptsWebhooks($category) ? route('webhooks.handle', ['provider' => $category]) : null,
                'docs' => 'docs/modules/integrations.md#'.str_replace('_', '-', $category),
                'env' => self::ENV[$category],
                'public_config' => $this->publicConfigFor($category, $this->resolve($category)),
            ];
        }

        return $rows;
    }

    private function driverDisplayName(string $category): string
    {
        $name = $this->configuredDriverName($category) ?: 'none';
        $key = 'integrations.drivers.'.$name;
        $label = __($key);

        return $label === $key ? $name : $label;
    }

    private function row(string $category): ?IntegrationProvider
    {
        try {
            return IntegrationProvider::query()->find($category);
        } catch (Throwable) {
            return null; // table not migrated yet
        }
    }

    /** @return array<string, mixed> */
    private function publicConfigFor(string $category, Integration $provider): array
    {
        $base = ['driver' => $this->driverLabel($category), 'configured' => $this->isConfigured($category)];
        if ($provider instanceof MapProvider) {
            return $base + $provider->publicConfig();
        }

        return $base;
    }

    private function assertCategory(string $category): void
    {
        if (! in_array($category, self::CATEGORIES, true)) {
            throw new InvalidArgumentException("Unknown integration category [{$category}]");
        }
    }
}
