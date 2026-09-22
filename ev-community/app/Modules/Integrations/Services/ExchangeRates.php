<?php

namespace App\Modules\Integrations\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Integrations\Exceptions\IntegrationNotConfiguredException;
use App\Modules\Integrations\Models\Currency;
use App\Modules\Integrations\Models\ExchangeRate;
use App\Modules\Integrations\Models\IntegrationSyncLog;
use App\Modules\Integrations\Support\Sanitizer;
use App\Support\Exceptions\DomainException;
use App\Support\Money\Money;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * FX lookups and append-only manual rates.
 *
 * Convention (exchange_rates): `base_currency` is the FOREIGN currency, `quote_currency` the local
 * one, `rate` = how many quote units 1 base unit buys. 1 USD = 48.50 EGP → base=USD, quote=EGP,
 * rate=48.5. `rate()` returns the latest row on/before the requested date; when only the inverse
 * pair exists the reciprocal is returned with source suffixed ":inverse".
 */
final class ExchangeRates
{
    public const AUDIT_ADDED = 'exchange_rates.added';

    public const AUDIT_SYNCED = 'exchange_rates.synced';

    public function __construct(private readonly AuditService $audit, private readonly IntegrationManager $manager) {}

    public function baseCurrency(): string
    {
        return strtoupper((string) config('ev.base_currency', 'EGP'));
    }

    /** @return array{rate: string, source: string, rate_date: string}|null */
    public function rate(string $base, string $quote, ?CarbonInterface $date = null): ?array
    {
        $base = strtoupper($base);
        $quote = strtoupper($quote);
        $date = CarbonImmutable::instance($date ?? now())->startOfDay();
        if ($base === $quote) {
            return ['rate' => '1', 'source' => 'identity', 'rate_date' => $date->toDateString()];
        }
        $row = ExchangeRate::query()->pair($base, $quote)->onOrBefore($date)->latestFirst()->first();
        if ($row) {
            return ['rate' => self::normalizeRate((string) $row->rate), 'source' => $row->source, 'rate_date' => $row->rate_date->toDateString()];
        }
        $inverse = ExchangeRate::query()->pair($quote, $base)->onOrBefore($date)->latestFirst()->first();
        if ($inverse) {
            $rate = BigDecimal::one()->dividedBy(BigDecimal::of((string) $inverse->rate), 8, RoundingMode::HALF_UP);

            return ['rate' => (string) $rate, 'source' => $inverse->source.':inverse', 'rate_date' => $inverse->rate_date->toDateString()];
        }

        return null;
    }

    /**
     * Convert an amount into the platform base currency using the rate valid on `date`, returning
     * the full FX snapshot to store on the converted record.
     *
     * @return array{amount: string, currency: string, rate: string, source: string, rate_date: string, original_amount: string, original_currency: string}
     */
    public function convertToBase(string $amount, string $currency, ?CarbonInterface $date = null): array
    {
        $base = $this->baseCurrency();
        $currency = strtoupper($currency);
        $date = CarbonImmutable::instance($date ?? now())->startOfDay();
        $original = Money::toDecimal($amount, $currency);
        if ($currency === $base) {
            return ['amount' => $original, 'currency' => $base, 'rate' => '1', 'source' => 'identity', 'rate_date' => $date->toDateString(), 'original_amount' => $original, 'original_currency' => $currency];
        }
        $rate = $this->rate($currency, $base, $date)
            ?? throw DomainException::because('integrations.errors.rate_missing', ['base' => $currency, 'quote' => $base, 'date' => $date->toDateString()], 'currency');

        return [
            'amount' => Money::convert($original, $currency, $base, $rate['rate']),
            'currency' => $base,
            'rate' => $rate['rate'],
            'source' => $rate['source'],
            'rate_date' => $rate['rate_date'],
            'original_amount' => $original,
            'original_currency' => $currency,
        ];
    }

    /**
     * Append a manually entered rate (never edits). Requires exchange_rates.manage and a reason.
     */
    public function addManualRate(string $base, string $quote, string $rate, CarbonInterface|string $date, User $actor, string $reason, string $source = 'manual'): ExchangeRate
    {
        if (! $actor->can('exchange_rates.manage')) {
            throw DomainException::forbidden();
        }
        $base = strtoupper(trim($base));
        $quote = strtoupper(trim($quote));
        $source = trim($source) === '' ? 'manual' : mb_substr(trim($source), 0, 60);
        $rateDate = CarbonImmutable::parse($date instanceof CarbonInterface ? $date->toDateString() : $date)->startOfDay();
        if (mb_strlen(trim($reason)) < 5) {
            throw DomainException::because('core.errors.reason_required', [], 'reason');
        }
        if ($base === $quote) {
            throw DomainException::because('integrations.errors.same_currency', [], 'quote_currency');
        }
        $known = Currency::query()->active()->whereIn('code', [$base, $quote])->pluck('code')->all();
        foreach ([$base => 'base_currency', $quote => 'quote_currency'] as $code => $field) {
            if (! in_array($code, $known, true)) {
                throw DomainException::because('integrations.errors.unknown_currency', ['currency' => $code], $field);
            }
        }
        try {
            $decimal = BigDecimal::of(trim($rate));
        } catch (Throwable) {
            throw DomainException::because('integrations.errors.rate_positive', [], 'rate');
        }
        if ($decimal->isNegativeOrZero()) {
            throw DomainException::because('integrations.errors.rate_positive', [], 'rate');
        }
        if ($rateDate->greaterThan(CarbonImmutable::today())) {
            throw DomainException::because('integrations.errors.future_date', [], 'rate_date');
        }

        return DB::transaction(function () use ($base, $quote, $decimal, $rateDate, $actor, $reason, $source) {
            $exists = ExchangeRate::query()->pair($base, $quote)->whereDate('rate_date', $rateDate)->where('source', $source)->lockForUpdate()->exists();
            if ($exists) {
                throw DomainException::conflict('integrations.errors.rate_exists', ['base' => $base, 'quote' => $quote, 'date' => $rateDate->toDateString()]);
            }
            $row = ExchangeRate::query()->create([
                'base_currency' => $base,
                'quote_currency' => $quote,
                'rate' => (string) $decimal->toScale(8, RoundingMode::HALF_UP),
                'source' => $source,
                'source_reference' => null,
                'rate_date' => $rateDate->toDateString(),
                'reason' => trim($reason),
                'entered_by' => $actor->id,
            ]);
            $this->audit->log(self::AUDIT_ADDED, $row, new: ['base_currency' => $base, 'quote_currency' => $quote, 'rate' => $row->rate, 'rate_date' => $rateDate->toDateString(), 'source' => $source], reason: trim($reason), actor: $actor, entityLabel: "{$base}/{$quote} {$rateDate->toDateString()}");

            return $row;
        });
    }

    /**
     * Pull today's rates for every active foreign currency from the configured provider.
     *
     * @return array{provider: string, inserted: int, skipped: int, failed: int, errors: array<int, string>}
     */
    public function sync(?CarbonInterface $date = null, ?User $actor = null): array
    {
        $provider = $this->manager->exchangeRate();
        if (! $this->manager->isConfigured('exchange_rate')) {
            throw IntegrationNotConfiguredException::for('exchange_rate');
        }
        if (! $provider->supportsSync()) {
            throw DomainException::because('integrations.errors.sync_not_supported', ['driver' => $provider->driver()]);
        }
        $base = $this->baseCurrency();
        $source = 'provider:'.$provider->driver();
        $date = CarbonImmutable::instance($date ?? now())->startOfDay();
        $log = IntegrationSyncLog::query()->create(['provider' => 'exchange_rate', 'job' => 'exchange_rates.sync', 'started_at' => now(), 'status' => 'running']);
        $summary = ['provider' => $provider->driver(), 'inserted' => 0, 'skipped' => 0, 'failed' => 0, 'errors' => []];

        foreach ($this->foreignCurrencies() as $code) {
            try {
                $result = $provider->fetchRate($code, $base, $date);
                if ($result === null) {
                    $summary['skipped']++;

                    continue;
                }
                $created = DB::transaction(function () use ($result, $source) {
                    $exists = ExchangeRate::query()->pair($result->base, $result->quote)->whereDate('rate_date', $result->rateDate)->where('source', $source)->lockForUpdate()->exists();
                    if ($exists) {
                        return false;
                    }
                    ExchangeRate::query()->create([
                        'base_currency' => strtoupper($result->base),
                        'quote_currency' => strtoupper($result->quote),
                        'rate' => (string) BigDecimal::of($result->rate)->toScale(8, RoundingMode::HALF_UP),
                        'source' => $source,
                        'source_reference' => $result->reference !== null ? mb_substr($result->reference, 0, 255) : null,
                        'rate_date' => $result->rateDate->toDateString(),
                        'reason' => null,
                        'entered_by' => null,
                    ]);

                    return true;
                });
                $created ? $summary['inserted']++ : $summary['skipped']++;
            } catch (Throwable $e) {
                $summary['failed']++;
                $summary['errors'][] = $code.': '.Sanitizer::error($e->getMessage(), 200);
            }
        }

        $log->forceFill([
            'finished_at' => now(),
            'status' => $summary['failed'] === 0 ? 'success' : ($summary['inserted'] > 0 ? 'partial' : 'failed'),
            'records_processed' => $summary['inserted'] + $summary['skipped'],
            'records_failed' => $summary['failed'],
            'summary' => json_encode($summary, JSON_UNESCAPED_UNICODE),
        ])->save();
        $this->audit->log(self::AUDIT_SYNCED, $log, new: ['inserted' => $summary['inserted'], 'skipped' => $summary['skipped'], 'failed' => $summary['failed'], 'source' => $source], actor: $actor);

        return $summary;
    }

    /** @return string[] active non-base currency codes */
    public function foreignCurrencies(): array
    {
        return Currency::query()->active()->where('code', '!=', $this->baseCurrency())->orderBy('code')->pluck('code')->all();
    }

    /** @return array<int, array{code: string, name: string, is_base: bool}> */
    public function currencies(): array
    {
        return Currency::query()->active()->orderByDesc('is_base')->orderBy('code')->get()
            ->map(fn (Currency $c) => ['code' => $c->code, 'name' => $c->name(), 'is_base' => $c->is_base])->all();
    }

    /**
     * Latest rate to the base currency per active foreign currency (for the admin cards).
     *
     * @return array<int, array{currency: string, name: string, rate: ?string, source: ?string, rate_date: ?string, stale: bool}>
     */
    public function latestPerCurrency(): array
    {
        $base = $this->baseCurrency();
        $staleDays = max(1, (int) config('ev.integrations.exchange_rate.stale_days', 7));
        $out = [];
        foreach (Currency::query()->active()->where('code', '!=', $base)->orderBy('code')->get() as $currency) {
            $row = ExchangeRate::query()->pair($currency->code, $base)->latestFirst()->first();
            $out[] = [
                'currency' => $currency->code,
                'name' => $currency->name(),
                'rate' => $row ? self::normalizeRate((string) $row->rate) : null,
                'source' => $row?->source,
                'rate_date' => $row?->rate_date->toDateString(),
                'stale' => $row ? $row->rate_date->diffInDays(now()->startOfDay(), false) > $staleDays : true,
            ];
        }

        return $out;
    }

    /** Trim trailing zeros for display while keeping at least 2 decimals ("48.50000000" → "48.50"). */
    public static function normalizeRate(string $rate): string
    {
        $decimal = BigDecimal::of($rate)->stripTrailingZeros();
        if ($decimal->getScale() < 2) {
            $decimal = $decimal->toScale(2);
        }

        return (string) $decimal;
    }
}
