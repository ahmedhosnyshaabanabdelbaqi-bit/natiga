<?php

namespace App\Support;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;

/**
 * حساب عشري دقيق للأموال والكميات.
 * لا يُستخدم float في أي نتيجة مالية — كل القيم تُمرَّر وتُخزَّن كنصوص عشرية.
 *
 * SCALE_CALC  : الدقة الداخلية أثناء الحساب (تُحفظ القيم الدقيقة ثم تُقرَّب عند النقطة المقررة).
 * SCALE_MONEY : دقة عرض وترحيل المبالغ.
 * SCALE_QTY   : دقة الكميات المخزنية.
 * SCALE_COST  : دقة تكلفة الوحدة (أعلى من المال لتقليل الانحراف التراكمي).
 */
final class Dec
{
    public const SCALE_CALC = 10;
    public const SCALE_MONEY = 4;
    public const SCALE_QTY = 6;
    public const SCALE_COST = 6;

    public static function of(mixed $v): BigDecimal
    {
        if ($v === null || $v === '') {
            return BigDecimal::zero();
        }
        if ($v instanceof BigDecimal) {
            return $v;
        }
        if (is_float($v)) {
            // مصدر float غير مرغوب، لكن نحوّله عبر نص لتفادي تمثيل ثنائي مضلل
            return BigDecimal::of(sprintf('%.'.self::SCALE_CALC.'F', $v));
        }

        return BigDecimal::of((string) $v);
    }

    public static function add(mixed $a, mixed $b): BigDecimal
    {
        return self::of($a)->plus(self::of($b));
    }

    public static function sub(mixed $a, mixed $b): BigDecimal
    {
        return self::of($a)->minus(self::of($b));
    }

    public static function mul(mixed $a, mixed $b): BigDecimal
    {
        return self::of($a)->multipliedBy(self::of($b));
    }

    public static function div(mixed $a, mixed $b, int $scale = self::SCALE_CALC): BigDecimal
    {
        $divisor = self::of($b);
        if ($divisor->isZero()) {
            return BigDecimal::zero();
        }

        return self::of($a)->dividedBy($divisor, $scale, RoundingMode::HalfUp);
    }

    /** تقريب نصف لأعلى — سياسة التقريب المعتمدة للنظام. */
    public static function round(mixed $v, int $scale = self::SCALE_MONEY): BigDecimal
    {
        return self::of($v)->toScale($scale, RoundingMode::HalfUp);
    }

    public static function money(mixed $v): string
    {
        return (string) self::round($v, self::SCALE_MONEY);
    }

    public static function qty(mixed $v): string
    {
        return (string) self::round($v, self::SCALE_QTY);
    }

    public static function cost(mixed $v): string
    {
        return (string) self::round($v, self::SCALE_COST);
    }

    public static function cmp(mixed $a, mixed $b): int
    {
        return self::of($a)->compareTo(self::of($b));
    }

    public static function isZero(mixed $v): bool
    {
        return self::of($v)->isZero();
    }

    public static function isNegative(mixed $v): bool
    {
        return self::of($v)->isNegative();
    }

    public static function isPositive(mixed $v): bool
    {
        return self::of($v)->isPositive();
    }

    public static function gt(mixed $a, mixed $b): bool
    {
        return self::cmp($a, $b) > 0;
    }

    public static function gte(mixed $a, mixed $b): bool
    {
        return self::cmp($a, $b) >= 0;
    }

    public static function lt(mixed $a, mixed $b): bool
    {
        return self::cmp($a, $b) < 0;
    }

    public static function lte(mixed $a, mixed $b): bool
    {
        return self::cmp($a, $b) <= 0;
    }

    public static function eq(mixed $a, mixed $b): bool
    {
        return self::cmp($a, $b) === 0;
    }

    public static function abs(mixed $v): BigDecimal
    {
        return self::of($v)->abs();
    }

    public static function neg(mixed $v): BigDecimal
    {
        return self::of($v)->negated();
    }

    public static function max(mixed $a, mixed $b): BigDecimal
    {
        return self::gt($a, $b) ? self::of($a) : self::of($b);
    }

    public static function min(mixed $a, mixed $b): BigDecimal
    {
        return self::lt($a, $b) ? self::of($a) : self::of($b);
    }

    /** @param iterable<mixed> $values */
    public static function sum(iterable $values): BigDecimal
    {
        $total = BigDecimal::zero();
        foreach ($values as $v) {
            $total = $total->plus(self::of($v));
        }

        return $total;
    }

    /**
     * توزيع مبلغ على أوزان مع ضمان أن مجموع الأنصبة = المبلغ بالضبط.
     * فرق الكسور يُضاف إلى أكبر نصيب (سياسة موثقة وثابتة).
     *
     * @param  array<int|string, mixed>  $weights
     * @return array<int|string, string>
     */
    public static function allocate(mixed $amount, array $weights, int $scale = self::SCALE_MONEY): array
    {
        $amount = self::of($amount);
        $totalWeight = self::sum($weights);

        if ($totalWeight->isZero() || $amount->isZero()) {
            return array_map(fn () => (string) BigDecimal::zero()->toScale($scale), $weights);
        }

        $shares = [];
        $allocated = BigDecimal::zero();
        foreach ($weights as $key => $weight) {
            $share = self::round(self::div(self::mul($amount, $weight), $totalWeight), $scale);
            $shares[$key] = $share;
            $allocated = $allocated->plus($share);
        }

        $diff = $amount->toScale($scale, RoundingMode::HalfUp)->minus($allocated);
        if (! $diff->isZero()) {
            $targetKey = null;
            $maxWeight = null;
            foreach ($weights as $key => $weight) {
                $w = self::of($weight)->abs();
                if ($maxWeight === null || $w->isGreaterThan($maxWeight)) {
                    $maxWeight = $w;
                    $targetKey = $key;
                }
            }
            if ($targetKey !== null) {
                $shares[$targetKey] = $shares[$targetKey]->plus($diff);
            }
        }

        return array_map(fn (BigDecimal $s) => (string) $s, $shares);
    }
}
