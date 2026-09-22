<?php

namespace App\Support\Money;

use Brick\Math\BigDecimal;
use Brick\Math\BigNumber;
use Brick\Math\RoundingMode;
use Brick\Money\AllocationMode;
use Brick\Money\Context\DefaultContext;
use Brick\Money\Money as BrickMoney;
use Brick\Money\SplitMode;
use InvalidArgumentException;

/**
 * Exact decimal money helpers (brick/money 0.15 + brick/math 0.19). All amounts are decimal
 * strings, never floats. DB columns: decimal(14,2) + currency char(3).
 * Rounding: half-up to the currency's minor units.
 */
final class Money
{
    public const ROUNDING = RoundingMode::HalfUp;

    public static function of(string|int|float|BigNumber $amount, string $currency = 'EGP'): BrickMoney
    {
        return BrickMoney::of(self::number($amount), strtoupper($currency), new DefaultContext, self::ROUNDING);
    }

    public static function zero(string $currency = 'EGP'): BrickMoney
    {
        return BrickMoney::zero(strtoupper($currency));
    }

    /**
     * @param  iterable<BrickMoney|string|int|float>  $amounts
     */
    public static function sum(iterable $amounts, string $currency = 'EGP'): BrickMoney
    {
        $total = self::zero($currency);
        foreach ($amounts as $amount) {
            $total = $total->plus($amount instanceof BrickMoney ? $amount : self::of($amount, $currency));
        }

        return $total;
    }

    /** Decimal string with the currency's scale, e.g. "12000.00". */
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
        return self::toDecimal(self::of($amount, $currency)->multipliedBy(self::number($factor), self::ROUNDING));
    }

    /** Percentage of an amount (e.g. a 30 % deposit). */
    public static function percent(string|int $amount, string|int|float $percent, string $currency = 'EGP'): string
    {
        $factor = BigDecimal::of(self::number($percent))->dividedBy(100, 12, self::ROUNDING);

        return self::toDecimal(self::of($amount, $currency)->multipliedBy($factor, self::ROUNDING));
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
     * Allocate an amount proportionally to weights so that the parts sum exactly to the total.
     * Remainder minor units go to the parts with the largest fractional remainder.
     *
     * @param  array<int|string, string|int|float>  $weights
     * @return array<int|string, string>
     */
    public static function allocate(string|int $amount, array $weights, string $currency = 'EGP'): array
    {
        if ($weights === []) {
            throw new InvalidArgumentException('Cannot allocate to zero targets');
        }
        $ratios = [];
        foreach ($weights as $weight) {
            $decimal = BigDecimal::of(self::number($weight));
            if ($decimal->isNegative()) {
                throw new InvalidArgumentException('Allocation weights must not be negative');
            }
            $ratios[] = $decimal;
        }
        $allZero = true;
        foreach ($ratios as $ratio) {
            if (! $ratio->isZero()) {
                $allZero = false;
                break;
            }
        }
        if ($allZero) {
            $ratios = array_fill(0, count($ratios), BigDecimal::one());
        }

        $parts = self::of($amount, $currency)->allocate($ratios, AllocationMode::FloorToLargestRemainder);
        $result = [];
        foreach (array_keys($weights) as $i => $key) {
            $result[$key] = (string) $parts[$i]->getAmount();
        }

        return $result;
    }

    /** Split into N equal parts; remainder minor units go to the first parts. */
    public static function split(string|int $amount, int $parts, string $currency = 'EGP'): array
    {
        return array_map(fn (BrickMoney $m) => (string) $m->getAmount(), self::of($amount, $currency)->split($parts, SplitMode::ToFirst));
    }

    /**
     * Convert with an explicit FX rate snapshot (1 unit of $from = $rate units of $to).
     * Never fetches a live rate. Result is rounded half-up to the target currency's minor units.
     */
    public static function convert(string|int $amount, string $from, string $to, string $rate): string
    {
        $converted = self::of($amount, $from)->convertedTo(strtoupper($to), BigDecimal::of($rate), new DefaultContext, self::ROUNDING);

        return (string) $converted->getAmount();
    }

    public static function format(string|int|float|null $amount, string $currency = 'EGP', ?string $locale = null): string
    {
        if ($amount === null) {
            return '—';
        }
        $locale ??= app()->getLocale();
        $money = self::of($amount, $currency);
        $digits = $money->getCurrency()->getDefaultFractionDigits();
        $decimal = $money->getAmount()->toScale($digits, self::ROUNDING);
        [$int, $frac] = array_pad(explode('.', (string) $decimal->abs()), 2, '');
        $grouped = strrev(implode(',', str_split(strrev($int), 3)));
        $formatted = ($decimal->isNegative() ? '-' : '').$grouped.($digits > 0 ? '.'.$frac : '');
        $code = $money->getCurrency()->getCurrencyCode();

        return $locale === 'ar' ? $formatted.' '.self::arabicCurrencyName($code) : $code.' '.$formatted;
    }

    private static function number(string|int|float|BigNumber $value): string|int|BigNumber
    {
        if (is_float($value)) {
            // Floats are accepted only for literal constants; converted through a fixed-precision string.
            return rtrim(rtrim(number_format($value, 8, '.', ''), '0'), '.') ?: '0';
        }

        return $value;
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
