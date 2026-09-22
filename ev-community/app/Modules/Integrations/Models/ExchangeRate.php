<?php

namespace App\Modules\Integrations\Models;

use App\Models\User;
use Database\Factories\Integrations\ExchangeRateFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Append-only FX table. Convention: `base_currency` is the FOREIGN currency, `quote_currency`
 * the local one; `rate` is how many quote units 1 base unit buys (1 USD = 48.50 EGP →
 * base=USD, quote=EGP, rate=48.5). Rows are never edited: add a new dated entry instead.
 *
 * @property int $id
 * @property string $base_currency
 * @property string $quote_currency
 * @property string $rate
 * @property string $source
 * @property Carbon $rate_date
 */
class ExchangeRate extends Model
{
    /** @use HasFactory<ExchangeRateFactory> */
    use HasFactory;

    protected $table = 'exchange_rates';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'rate' => 'string',
            'rate_date' => 'date',
        ];
    }

    protected static function newFactory(): ExchangeRateFactory
    {
        return ExchangeRateFactory::new();
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Exchange rates are append-only; add a new dated entry instead.'));
    }

    public function enteredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'entered_by');
    }

    public function scopePair(Builder $query, string $base, string $quote): Builder
    {
        return $query->where('base_currency', strtoupper($base))->where('quote_currency', strtoupper($quote));
    }

    public function scopeOnOrBefore(Builder $query, \DateTimeInterface $date): Builder
    {
        return $query->whereDate('rate_date', '<=', $date);
    }

    public function scopeLatestFirst(Builder $query): Builder
    {
        return $query->orderByDesc('rate_date')->orderByDesc('id');
    }
}
