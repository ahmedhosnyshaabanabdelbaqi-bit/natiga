<?php

namespace App\Support\Money;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Brick\Money\Context\CustomContext;
use Brick\Money\Money as BrickMoney;
use InvalidArgumentException;

/**
 * Exact decimal money helpers. All amounts are strings/decimals, never floats.
 * DB columns: decimal(14,2) + currency char(3). Rounding: HALF_UP to the currency's minor units.
 */
final class Money
{
    public static function of(string|int|float|BigDecimal $amount, string $currency = 'EGP'): BrickMoney
    {
        if (is_float($amount)) {
            // Floats are rejected on purpose for stored values; accept them only for constants (e.g. 0.3) via strings.
            $amount = number_format($amount, 8, '.', '');
        }

        return BrickMoney::of($amount, strtoupper($currency), roundingMode: RoundingMode::HALF_UP);
    }

    public static function zero(string $currency = 'EGP'): BrickMoney
    {
        return BrickMoney::zero(strtoupper($currency));
    }

    public static function sum(iterable $amounts, string $currency = 'EGP'): BrickMoney
    {
        $total = self::zero($currency);
        foreach ($amounts as $amount) {
            $total = $total->plus($amount instanceof BrickMoney ? $amount : self::of($amount, $currency));
        }

        return $total;
    }

    /** @return string decimal string with the currency's scale, e.g. "12000.00" */
    public static function toDecimal(BrickMoney|string|int|float $amount, string $currency = 'EGP'): string
    {
        $money = $amount instanceof BrickMoney ? $amount : self::of($amount, $currency);

        return (string) $money->getAmount();
    }

    public static function add(string|int $a, string|int $b, string $currency = 'EGP'): string
    {
        return self::toDecimal(self::of($a, $currency)->plus(self::of($b, $currency)));
    }

    public static function sub(string|int $a, string|int $b, string $currency = 'EGP'): string
    {
        return self::toDecimal(self::of($a, $currency)->minus(self::of($b, $currency)));
    }

    public static function mul(string|int $amount, string|int|float $factor, string $currency = 'EGP'): string
    {
        $factor = is_float($factor) ? number_format($factor, 8, '.', '') : (string) $factor;

        return self::toDecimal(self::of($amount, $currency)->multipliedBy($factor, RoundingMode::HALF_UP));
    }

    /** Percentage of an amount (e.g. deposit 30%). */
    public static function percent(string|int $amount, string|int|float $percent, string $currency = 'EGP'): string
    {
        $percent = is_float($percent) ? number_format($percent, 8, '.', '') : (string) $percent;

        return self::toDecimal(self::of($amount, $currency)->multipliedBy(BigDecimal::of($percent)->dividedBy(100, 12, RoundingMode::HALF_UP), RoundingMode::HALF_UP));
    }

    public static function compare(string|int $a, string|int $b, string $currency = 'EGP'): int
    {
        return self::of($a, $currency)->compareTo(self::of($b, $currency));
    }

    public static function isZero(string|int $a, string $currency = 'EGP'): bool
    {
        return self::of($a, $currency)->isZero();
    }

    public static function isNegative(string|int $a, string $currency = 'EGP'): bool
    {
        return self::of($a, $currency)->isNegative();
    }

    public static function max(string|int $a, string|int $b, string $currency = 'EGP'): string
    {
        return self::compare($a, $b, $currency) >= 0 ? self::toDecimal($a, $currency) : self::toDecimal($b, $currency);
    }

    public static function min(string|int $a, string|int $b, string $currency = 'EGP'): string
    {
        return self::compare($a, $b, $currency) <= 0 ? self::toDecimal($a, $currency) : self::toDecimal($b, $currency);
    }

    /**
     * Allocate an amount proportionally to weights so that the parts sum exactly to the total
     * (remainders distributed to the largest fractional parts). Returns decimal strings.
     *
     * @param  array<int|string, string|int|float>  $weights
     * @return array<int|string, string>
     */
    public static function allocate(string|int $amount, array $weights, string $currency = 'EGP'): array
    {
        if ($weights === []) {
            throw new InvalidArgumentException('Cannot allocate to zero targets');
        }
        $money = self::of($amount, $currency);
        $ratios = array_map(fn ($w) => (int) round(((float) $w) * 1_000_000), $weights);
        if (array_sum($ratios) === 0) {
            $ratios = array_fill_keys(array_keys($weights), 1);
        }
        $parts = $money->allocate(...array_values($ratios));
        $result = [];
        foreach (array_keys($weights) as $i => $key) {
            $result[$key] = (string) $parts[$i]->getAmount();
        }

        return $result;
    }

    /** Split an amount into N equal parts, remainder cents going to the first parts. */
    public static function split(string|int $amount, int $parts, string $currency = 'EGP'): array
    {
        return array_map(fn ($m) => (string) $m->getAmount(), self::of($amount, $currency)->split($parts));
    }

    /**
     * Convert with an explicit FX rate snapshot (1 from = rate to). Never fetches a live rate.
     */
    public static function convert(string|int $amount, string $from, string $to, string $rate): string
    {
        $source = self::of($amount, $from);
        $converted = $source->convertedTo(strtoupper($to), $rate, new CustomContext(8), RoundingMode::HALF_UP);

        return (string) $converted->to(BrickMoney::of(0, strtoupper($to))->getContext(), RoundingMode::HALF_UP)->getAmount();
    }

    public static function format(string|int|float|null $amount, string $currency = 'EGP', ?string $locale = null): string
    {
        if ($amount === null) {
            return '—';
        }
        $locale ??= app()->getLocale();
        $money = self::of((string) $amount, $currency);
        $intl = config('ev.locales.'.$locale.'.intl', 'en-EG').'-u-nu-latn';
        $formatted = number_format((float) (string) $money->getAmount(), $money->getCurrency()->getDefaultFractionDigits(), '.', ',');
        $name = $locale === 'ar' ? self::arabicCurrencyName($money->getCurrency()->getCurrencyCode()) : $money->getCurrency()->getCurrencyCode();

        return $locale === 'ar' ? $formatted.' '.$name : $name.' '.$formatted;
    }

    private static function arabicCurrencyName(string $code): string
    {
        return match ($code) {
            'EGP' => 'ج.م',
            'USD' => 'دولار',
            'EUR' => 'يورو',
            'CNY' => 'يوان',
            'SAR' => 'ر.س',
            'AED' => 'د.إ',
            default => $code,
        };
    }
}
