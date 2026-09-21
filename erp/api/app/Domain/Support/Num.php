<?php

namespace App\Domain\Support;

use Brick\Math\BigDecimal;
use Brick\Math\Exception\MathException;
use Brick\Math\RoundingMode;

/**
 * Exact decimal arithmetic for every money, quantity and cost calculation.
 *
 * Built on brick/math rather than raw floats. Values are passed around as
 * strings and carried at full working precision, then rounded once at the point
 * a document or ledger line stores them — so a chain of calculations does not
 * accumulate rounding error, and 0.1 + 0.2 is exactly 0.3.
 *
 * Rounding is HALF_UP (away from zero on a tie), which is the convention
 * documented in docs/04-posting-matrix.md and applied consistently. Installing
 * the bcmath or gmp extension makes brick/math faster; it is not required for
 * correctness, and results are identical either way.
 */
final class Num
{
    /** Working precision for intermediate results (costs, unit prices). */
    public const CALC_SCALE = 8;

    /** Scale for quantities as stored. */
    public const QTY_SCALE = 4;

    /** Scale for money as posted to the ledger. */
    public const MONEY_SCALE = 2;

    private static function dec(mixed $value): BigDecimal
    {
        if ($value === null || $value === '') {
            return BigDecimal::zero();
        }

        if ($value instanceof BigDecimal) {
            return $value;
        }

        try {
            return BigDecimal::of(is_float($value) ? sprintf('%.14F', $value) : (string) $value);
        } catch (MathException) {
            return BigDecimal::zero();
        }
    }

    public static function of(mixed $value): string
    {
        return (string) self::dec($value);
    }

    public static function add(mixed $a, mixed $b, int $scale = self::CALC_SCALE): string
    {
        return (string) self::dec($a)->plus(self::dec($b))->toScale($scale, RoundingMode::HalfUp);
    }

    public static function sub(mixed $a, mixed $b, int $scale = self::CALC_SCALE): string
    {
        return (string) self::dec($a)->minus(self::dec($b))->toScale($scale, RoundingMode::HalfUp);
    }

    public static function mul(mixed $a, mixed $b, int $scale = self::CALC_SCALE): string
    {
        return (string) self::dec($a)->multipliedBy(self::dec($b))->toScale($scale, RoundingMode::HalfUp);
    }

    /** Division by zero yields zero rather than throwing — callers guard the meaning. */
    public static function div(mixed $a, mixed $b, int $scale = self::CALC_SCALE): string
    {
        $divisor = self::dec($b);

        if ($divisor->isZero()) {
            return (string) BigDecimal::zero()->toScale($scale);
        }

        return (string) self::dec($a)->dividedBy($divisor, $scale, RoundingMode::HalfUp);
    }

    /** Integer quotient, truncated toward zero. Used for "how many times does X fit". */
    public static function intDiv(mixed $a, mixed $b): string
    {
        $divisor = self::dec($b);

        if ($divisor->isZero()) {
            return '0';
        }

        return (string) self::dec($a)->dividedBy($divisor, 0, RoundingMode::Down);
    }

    public static function cmp(mixed $a, mixed $b, int $scale = self::CALC_SCALE): int
    {
        return self::dec($a)->toScale($scale, RoundingMode::HalfUp)
            ->compareTo(self::dec($b)->toScale($scale, RoundingMode::HalfUp));
    }

    public static function isZero(mixed $a, int $scale = self::CALC_SCALE): bool
    {
        return self::dec($a)->toScale($scale, RoundingMode::HalfUp)->isZero();
    }

    public static function isPositive(mixed $a, int $scale = self::CALC_SCALE): bool
    {
        return self::dec($a)->toScale($scale, RoundingMode::HalfUp)->isPositive();
    }

    public static function isNegative(mixed $a, int $scale = self::CALC_SCALE): bool
    {
        return self::dec($a)->toScale($scale, RoundingMode::HalfUp)->isNegative();
    }

    public static function abs(mixed $a): string
    {
        return (string) self::dec($a)->abs();
    }

    public static function neg(mixed $a, int $scale = self::CALC_SCALE): string
    {
        return (string) self::dec($a)->negated()->toScale($scale, RoundingMode::HalfUp);
    }

    public static function min(mixed $a, mixed $b): string
    {
        return self::dec($a)->isLessThanOrEqualTo(self::dec($b)) ? self::of($a) : self::of($b);
    }

    public static function max(mixed $a, mixed $b): string
    {
        return self::dec($a)->isGreaterThanOrEqualTo(self::dec($b)) ? self::of($a) : self::of($b);
    }

    /** Half-up rounding: a tie goes away from zero, matching the documented policy. */
    public static function round(mixed $value, int $scale = self::MONEY_SCALE): string
    {
        return (string) self::dec($value)->toScale($scale, RoundingMode::HalfUp);
    }

    public static function money(mixed $value): string
    {
        return self::round($value, self::MONEY_SCALE);
    }

    public static function qty(mixed $value): string
    {
        return self::round($value, self::QTY_SCALE);
    }

    public static function pct(mixed $base, mixed $percent, int $scale = self::CALC_SCALE): string
    {
        return self::div(self::mul($base, $percent, $scale + 2), '100', $scale);
    }

    /**
     * Split an amount across weights so the parts sum back to the amount exactly.
     *
     * The rounding residue goes to the largest weight rather than being dropped,
     * which is what keeps an allocated landed cost or a document-level discount
     * from leaving a stray piastre unaccounted for.
     *
     * @param  array<int|string, mixed>  $weights
     * @return array<int|string, string>
     */
    public static function allocate(mixed $amount, array $weights, int $scale = self::MONEY_SCALE): array
    {
        if ($weights === []) {
            return [];
        }

        $total = BigDecimal::zero();
        foreach ($weights as $weight) {
            $total = $total->plus(self::dec($weight)->abs());
        }

        $keys = array_keys($weights);
        $out = [];
        $running = BigDecimal::zero();

        if ($total->isZero()) {
            // Nothing to weigh by: spread evenly and give the residue to the first key.
            $each = self::dec(self::div($amount, (string) count($weights), $scale));
            foreach ($keys as $key) {
                $out[$key] = (string) $each->toScale($scale, RoundingMode::HalfUp);
                $running = $running->plus($each);
            }
        } else {
            foreach ($weights as $key => $weight) {
                $share = self::dec($amount)
                    ->multipliedBy(self::dec($weight)->abs())
                    ->dividedBy($total, $scale, RoundingMode::HalfUp);
                $out[$key] = (string) $share;
                $running = $running->plus($share);
            }
        }

        $residue = self::dec($amount)->toScale($scale, RoundingMode::HalfUp)->minus($running);

        if (! $residue->isZero()) {
            $targetKey = $keys[0];
            $largest = self::dec($weights[$targetKey])->abs();

            foreach ($weights as $key => $weight) {
                if (self::dec($weight)->abs()->isGreaterThan($largest)) {
                    $largest = self::dec($weight)->abs();
                    $targetKey = $key;
                }
            }

            $out[$targetKey] = (string) self::dec($out[$targetKey])->plus($residue);
        }

        return $out;
    }
}
