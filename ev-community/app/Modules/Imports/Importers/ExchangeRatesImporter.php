<?php

namespace App\Modules\Imports\Importers;

use App\Modules\Imports\Services\ImportContext;
use App\Modules\Integrations\Models\Currency;
use App\Modules\Integrations\Models\ExchangeRate;
use App\Modules\Integrations\Services\ExchangeRates;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Reference importer: manual exchange rates (append-only) through ExchangeRates::addManualRate(),
 * so every imported row gets the same checks, row lock and audit entry as a rate typed in the UI.
 *
 * Columns: base_currency* (foreign, e.g. USD), quote_currency (default: platform base currency),
 * rate* (1 base = rate quote), rate_date* (not in the future), reason (default: "Imported from IMP-...").
 * Duplicate = a manual rate for the same pair and date already exists, or an earlier row of the file has it.
 */
final class ExchangeRatesImporter extends AbstractImporter
{
    public const KEY = 'exchange_rates';

    /** decimal(18,8): at most 10 integer digits and 8 decimals. */
    private const MAX_INTEGER_DIGITS = 10;

    private const MAX_SCALE = 8;

    public function __construct(private readonly ExchangeRates $rates) {}

    public function key(): string
    {
        return self::KEY;
    }

    public function permission(): string
    {
        return 'exchange_rates.manage';
    }

    public function columns(): array
    {
        return [
            $this->column('base_currency', true, 'USD'),
            $this->column('quote_currency', false, $this->rates->baseCurrency()),
            $this->column('rate', true, '48.50'),
            $this->column('rate_date', true, now()->toDateString()),
            $this->column('reason', false, __('imports.importers.exchange_rates.example_reason')),
        ];
    }

    public function normalizeRow(array $raw): array
    {
        $row = parent::normalizeRow($raw);

        return [
            'base_currency' => $this->code($row['base_currency'] ?? null),
            'quote_currency' => $this->code($row['quote_currency'] ?? null) ?? $this->rates->baseCurrency(),
            'rate' => $this->decimal($row['rate'] ?? null) ?? ($row['rate'] ?? null),
            'rate_date' => $this->date($row['rate_date'] ?? null) ?? ($row['rate_date'] ?? null),
            'reason' => $row['reason'] ?? null,
        ];
    }

    public function validateRow(array $row, ImportContext $ctx): array
    {
        $errors = [];
        $currencies = $ctx->remember('active_currencies', fn () => Currency::query()->active()->pluck('code')->all());
        $prefix = 'imports.importers.exchange_rates.errors.';

        foreach (['base_currency', 'quote_currency'] as $field) {
            $code = $row[$field] ?? null;
            if ($code === null) {
                $errors[$field] = __('imports.validation.required');
            } elseif (! in_array($code, $currencies, true)) {
                $errors[$field] = __($prefix.'unknown_currency', ['currency' => $code]);
            }
        }
        if (! isset($errors['base_currency']) && ! isset($errors['quote_currency']) && $row['base_currency'] === $row['quote_currency']) {
            $errors['quote_currency'] = __($prefix.'same_currency');
        }

        $rate = $row['rate'] ?? null;
        if ($rate === null) {
            $errors['rate'] = __('imports.validation.required');
        } elseif (! is_string($rate) || ! preg_match('/^\d+(\.\d+)?$/', $rate)) {
            $errors['rate'] = __($prefix.'rate_invalid');
        } else {
            $decimal = BigDecimal::of($rate);
            $integerDigits = strlen(ltrim((string) $decimal->getIntegralPart(), '0'));
            if (! $decimal->isPositive()) {
                $errors['rate'] = __($prefix.'rate_invalid');
            } elseif ($integerDigits > self::MAX_INTEGER_DIGITS || $decimal->strippedOfTrailingZeros()->getScale() > self::MAX_SCALE) {
                $errors['rate'] = __($prefix.'rate_precision', ['digits' => self::MAX_INTEGER_DIGITS, 'scale' => self::MAX_SCALE]);
            }
        }

        $date = $row['rate_date'] ?? null;
        if ($date === null) {
            $errors['rate_date'] = __('imports.validation.required');
        } elseif (! preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $date)) {
            $errors['rate_date'] = __('imports.validation.date');
        } elseif (CarbonImmutable::parse((string) $date)->greaterThan(CarbonImmutable::today())) {
            $errors['rate_date'] = __($prefix.'future_date');
        }

        $reason = $row['reason'] ?? null;
        if ($reason !== null && (mb_strlen($reason) < 5 || mb_strlen($reason) > 500)) {
            $errors['reason'] = __($prefix.'reason_length', ['min' => 5, 'max' => 500]);
        }

        return $errors;
    }

    public function isDuplicate(array $row, ImportContext $ctx): bool
    {
        $key = $row['base_currency'].'/'.$row['quote_currency'].'@'.$row['rate_date'];
        if ($ctx->seen('pair_date', $key)) {
            return true;
        }

        return ExchangeRate::query()
            ->pair((string) $row['base_currency'], (string) $row['quote_currency'])
            ->whereDate('rate_date', (string) $row['rate_date'])
            ->where('source', ExchangeRates::SOURCE_MANUAL)
            ->exists();
    }

    public function importRow(array $row, ImportContext $ctx): ?Model
    {
        $actor = $ctx->user ?? throw new \LogicException('Exchange rate imports need an acting user.');
        $reason = $row['reason'] ?? __('imports.importers.exchange_rates.default_reason', ['number' => $ctx->import->number]);

        return $this->rates->addManualRate(
            (string) $row['base_currency'],
            (string) $row['quote_currency'],
            (string) $row['rate'],
            (string) $row['rate_date'],
            $actor,
            (string) $reason,
        );
    }

    public function chunkSize(): int
    {
        return 250;
    }
}
