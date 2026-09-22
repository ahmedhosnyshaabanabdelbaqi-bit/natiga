<?php

namespace App\Modules\Integrations\Drivers\ExchangeRate;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\RateResult;
use App\Modules\Integrations\Contracts\ExchangeRateProvider;
use App\Modules\Integrations\Models\ExchangeRate;
use App\Modules\Integrations\Services\ExchangeRates;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Throwable;

/**
 * Reads the exchange_rates table only (rates entered by the accountant). Nothing is fetched
 * from the internet; `supportsSync()` is false.
 */
final class ManualExchangeRateProvider implements ExchangeRateProvider
{
    public function key(): string
    {
        return 'exchange_rate';
    }

    public function driver(): string
    {
        return 'manual';
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function supportsSync(): bool
    {
        return false;
    }

    public function healthCheck(): HealthResult
    {
        try {
            $latest = ExchangeRate::query()->latestFirst()->first();
        } catch (Throwable $e) {
            return HealthResult::unavailable(__('integrations.exchange_rates.table_unavailable'), ['error' => class_basename($e)]);
        }
        if (! $latest) {
            return HealthResult::degraded(__('integrations.exchange_rates.no_rates_yet'), ['driver' => 'manual']);
        }
        $staleDays = max(1, (int) config('ev.integrations.exchange_rate.stale_days', 7));
        $ageDays = $latest->rate_date->diffInDays(now()->startOfDay(), false);
        if ($ageDays > $staleDays) {
            return HealthResult::degraded(__('integrations.exchange_rates.stale', ['days' => (int) $ageDays]), ['latest_rate_date' => $latest->rate_date->toDateString()]);
        }

        return HealthResult::operational(__('integrations.exchange_rates.manual_ok', ['date' => $latest->rate_date->toDateString()]), ['latest_rate_date' => $latest->rate_date->toDateString()]);
    }

    public function fetchRate(string $base, string $quote, ?CarbonInterface $date = null): ?RateResult
    {
        $date = ExchangeRates::platformDay($date);
        $row = ExchangeRate::query()->pair($base, $quote)->onOrBefore($date)->latestFirst()->first();
        if (! $row) {
            return null;
        }

        return new RateResult(
            base: $row->base_currency,
            quote: $row->quote_currency,
            rate: (string) $row->rate,
            rateDate: CarbonImmutable::instance($row->rate_date),
            source: $row->source,
            reference: $row->source_reference,
        );
    }
}
