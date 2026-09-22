<?php

namespace App\Modules\Imports\Exporters;

use App\Models\User;
use App\Modules\Imports\Contracts\DescribesFilters;
use App\Modules\Integrations\Models\Currency;
use App\Modules\Integrations\Models\ExchangeRate;
use App\Modules\Integrations\Services\ExchangeRates;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\Rule;

/**
 * Reference exporter: the append-only exchange rate history (requires `exchange_rates.view`).
 * Filters: base currency, source (manual|provider), rate date range.
 */
final class ExchangeRatesExporter extends AbstractExporter implements DescribesFilters
{
    public const KEY = 'exchange_rates';

    public function key(): string
    {
        return self::KEY;
    }

    public function permission(): string
    {
        return 'exchange_rates.view';
    }

    public function columns(): array
    {
        return [
            $this->column('rate_date'),
            $this->column('base_currency'),
            $this->column('quote_currency'),
            $this->column('rate'),
            $this->column('source'),
            $this->column('source_reference'),
            $this->column('reason'),
            $this->column('entered_by'),
            $this->column('created_at'),
        ];
    }

    public function filterRules(): array
    {
        return [
            'base' => ['nullable', 'string', 'size:3', Rule::exists('currencies', 'code')],
            'source' => ['nullable', Rule::in(['manual', 'provider'])],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
        ];
    }

    public function filterFields(): array
    {
        $currencies = Currency::query()->active()->orderBy('code')->get()
            ->map(fn (Currency $c) => ['value' => $c->code, 'label' => $c->code.' — '.$c->name()])->values()->all();

        return [
            ['key' => 'base', 'type' => 'select', 'label' => __('imports.exporters.exchange_rates.filters.base'), 'options' => $currencies],
            ['key' => 'source', 'type' => 'select', 'label' => __('imports.exporters.exchange_rates.filters.source'), 'options' => [
                ['value' => 'manual', 'label' => __('imports.exporters.exchange_rates.sources.manual')],
                ['value' => 'provider', 'label' => __('imports.exporters.exchange_rates.sources.provider')],
            ]],
            ['key' => 'date_from', 'type' => 'date', 'label' => __('imports.exporters.exchange_rates.filters.date_from')],
            ['key' => 'date_to', 'type' => 'date', 'label' => __('imports.exporters.exchange_rates.filters.date_to')],
        ];
    }

    public function query(array $filters, User $user): Builder
    {
        return ExchangeRate::query()
            ->with('enteredBy:id,name')
            ->when($filters['base'] ?? null, fn (Builder $q, string $base) => $q->where('base_currency', strtoupper($base)))
            ->when(($filters['source'] ?? null) === 'manual', fn (Builder $q) => $q->where(fn (Builder $w) => $w->where('source', ExchangeRates::SOURCE_MANUAL)->orWhere('source', 'like', ExchangeRates::SOURCE_CORRECTION_PREFIX.'%')))
            ->when(($filters['source'] ?? null) === 'provider', fn (Builder $q) => $q->where('source', 'like', 'provider:%'))
            ->when($filters['date_from'] ?? null, fn (Builder $q, string $from) => $q->whereDate('rate_date', '>=', $from))
            ->when($filters['date_to'] ?? null, fn (Builder $q, string $to) => $q->whereDate('rate_date', '<=', $to))
            ->orderBy('id');
    }

    public function row(object $record, string $locale): array
    {
        /** @var ExchangeRate $record */
        return [
            'rate_date' => $record->rate_date->toDateString(),
            'base_currency' => $record->base_currency,
            'quote_currency' => $record->quote_currency,
            'rate' => ExchangeRates::normalizeRate((string) $record->rate),
            'source' => $this->sourceLabel($record->source, $locale),
            'source_reference' => $record->source_reference,
            'reason' => $record->reason,
            'entered_by' => $record->enteredBy?->name,
            'created_at' => $record->created_at?->timezone((string) config('app.timezone', 'Africa/Cairo'))->format('Y-m-d H:i'),
        ];
    }

    private function sourceLabel(string $source, string $locale): string
    {
        return match (true) {
            $source === ExchangeRates::SOURCE_MANUAL => (string) __('imports.exporters.exchange_rates.sources.manual', [], $locale),
            str_starts_with($source, ExchangeRates::SOURCE_CORRECTION_PREFIX) => (string) __('imports.exporters.exchange_rates.sources.correction', [], $locale),
            str_starts_with($source, 'provider:') => (string) __('imports.exporters.exchange_rates.sources.provider', [], $locale).' ('.substr($source, 9).')',
            default => $source,
        };
    }
}
