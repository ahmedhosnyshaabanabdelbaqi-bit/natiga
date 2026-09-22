<?php

namespace Tests\Feature\Integrations\Support;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\RateResult;
use App\Modules\Integrations\Contracts\ExchangeRateProvider;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use RuntimeException;

/**
 * Test-only FX vendor that supports sync: fixed rates for USD/EUR/SAR, no quote for CNY (skipped) and a
 * failing call for AED. Registered through `Integrations::extend('exchange_rate', 'fake', ...)`.
 */
final class FakeExchangeRateProvider implements ExchangeRateProvider
{
    public const RATES = ['USD' => '48.5', 'EUR' => '52.125', 'SAR' => '12.9333'];

    public function key(): string
    {
        return 'exchange_rate';
    }

    public function driver(): string
    {
        return 'fake';
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function supportsSync(): bool
    {
        return true;
    }

    public function healthCheck(): HealthResult
    {
        return HealthResult::operational('fake fx');
    }

    public function fetchRate(string $base, string $quote, ?CarbonInterface $date = null): ?RateResult
    {
        if ($base === 'AED') {
            throw new RuntimeException('upstream timeout for https://fx.example/latest?api_key=secret-123');
        }
        if (! isset(self::RATES[$base])) {
            return null;
        }

        return new RateResult($base, $quote, self::RATES[$base], CarbonImmutable::instance($date ?? now())->startOfDay(), 'fake', 'fx-ref-'.$base);
    }
}
