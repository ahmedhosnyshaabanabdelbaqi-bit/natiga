<?php

declare(strict_types=1);

namespace App\Support;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use InvalidArgumentException;
use JsonSerializable;
use Stringable;

/**
 * Immutable monetary value backed by arbitrary-precision decimals.
 *
 * Money is NEVER represented as a float anywhere in this system. Intermediate
 * arithmetic keeps INTERNAL_SCALE digits so that chained operations (line
 * discount -> proportional invoice discount -> tax) do not accumulate error;
 * only the values that are persisted or shown are rounded to the currency
 * scale via `quantize()`.
 */
final class Money implements JsonSerializable, Stringable
{
    /** Working precision for intermediate arithmetic. */
    public const INTERNAL_SCALE = 6;

    private function __construct(private readonly BigDecimal $amount) {}

    public static function of(BigDecimal|Money|string|int $value): self
    {
        if ($value instanceof self) {
            return $value;
        }

        if ($value instanceof BigDecimal) {
            return new self($value->toScale(self::INTERNAL_SCALE, RoundingMode::HalfUp));
        }

        if (is_float($value)) { // @phpstan-ignore-line defensive: floats are never accepted
            throw new InvalidArgumentException('Money must not be constructed from a float.');
        }

        return new self(BigDecimal::of((string) $value)->toScale(self::INTERNAL_SCALE, RoundingMode::HalfUp));
    }

    public static function zero(): self
    {
        return self::of('0');
    }

    public function plus(Money|string|int $other): self
    {
        return new self($this->amount->plus(self::of($other)->amount));
    }

    public function minus(Money|string|int $other): self
    {
        return new self($this->amount->minus(self::of($other)->amount));
    }

    public function multipliedBy(Quantity|BigDecimal|string|int $factor): self
    {
        $f = $factor instanceof Quantity ? $factor->toBigDecimal()
            : ($factor instanceof BigDecimal ? $factor : BigDecimal::of((string) $factor));

        return new self($this->amount->multipliedBy($f)->toScale(self::INTERNAL_SCALE, RoundingMode::HalfUp));
    }

    public function dividedBy(Quantity|BigDecimal|string|int $divisor): self
    {
        $d = $divisor instanceof Quantity ? $divisor->toBigDecimal()
            : ($divisor instanceof BigDecimal ? $divisor : BigDecimal::of((string) $divisor));

        if ($d->isZero()) {
            throw new InvalidArgumentException('Division by zero in Money::dividedBy().');
        }

        return new self($this->amount->dividedBy($d, self::INTERNAL_SCALE, RoundingMode::HalfUp));
    }

    /** Percentage of this amount, e.g. `percentage('14')` for 14%. */
    public function percentage(BigDecimal|string|int $percent): self
    {
        $p = $percent instanceof BigDecimal ? $percent : BigDecimal::of((string) $percent);

        return new self(
            $this->amount->multipliedBy($p)->dividedBy(BigDecimal::of('100'), self::INTERNAL_SCALE, RoundingMode::HalfUp)
        );
    }

    public function negated(): self
    {
        return new self($this->amount->negated());
    }

    public function abs(): self
    {
        return new self($this->amount->abs());
    }

    /** Round to the currency scale using the configured rounding mode. */
    public function quantize(?int $scale = null, ?string $mode = null): self
    {
        $scale ??= (int) config('pos.currency.scale', 2);

        return new self($this->amount->toScale($scale, self::roundingMode($mode)));
    }

    /** Round to the nearest cash step (e.g. "0.25" for a 25-piastre till). */
    public function roundToStep(string $step, ?string $mode = null): self
    {
        $s = BigDecimal::of($step);
        if ($s->isZero()) {
            return $this;
        }

        $units = $this->amount->dividedBy($s, 0, self::roundingMode($mode));

        return new self($units->multipliedBy($s)->toScale(self::INTERNAL_SCALE, RoundingMode::HalfUp));
    }

    private static function roundingMode(?string $mode = null): RoundingMode
    {
        return match ($mode ?? config('pos.currency.rounding', 'half_up')) {
            'half_even' => RoundingMode::HalfEven,
            'up' => RoundingMode::Up,
            'down' => RoundingMode::Down,
            'ceiling' => RoundingMode::Ceiling,
            'floor' => RoundingMode::Floor,
            default => RoundingMode::HalfUp,
        };
    }

    public function compareTo(Money|string|int $other): int
    {
        return $this->amount->compareTo(self::of($other)->amount);
    }

    public function isZero(): bool
    {
        return $this->amount->isZero();
    }

    public function isNegative(): bool
    {
        return $this->amount->isNegative();
    }

    public function isPositive(): bool
    {
        return $this->amount->isPositive();
    }

    public function isGreaterThan(Money|string|int $other): bool
    {
        return $this->compareTo($other) > 0;
    }

    public function isLessThan(Money|string|int $other): bool
    {
        return $this->compareTo($other) < 0;
    }

    public function equals(Money|string|int $other): bool
    {
        return $this->compareTo($other) === 0;
    }

    public function toBigDecimal(): BigDecimal
    {
        return $this->amount;
    }

    /** Database/API representation: fixed-scale decimal string, never a float. */
    public function toString(?int $scale = null): string
    {
        return (string) $this->quantize($scale)->amount;
    }

    public function __toString(): string
    {
        return $this->toString();
    }

    public function jsonSerialize(): string
    {
        return $this->toString();
    }

    /** @param iterable<Money> $items */
    public static function sum(iterable $items): self
    {
        $total = self::zero();
        foreach ($items as $item) {
            $total = $total->plus($item);
        }

        return $total;
    }
}
