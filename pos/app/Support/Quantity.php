<?php

declare(strict_types=1);

namespace App\Support;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use InvalidArgumentException;
use JsonSerializable;
use Stringable;

/**
 * Immutable product quantity. Scale 4 covers grams sold in kilograms (0.0010)
 * and metres sold in centimetres, which is the finest granularity the retail
 * profiles in this system need.
 */
final class Quantity implements JsonSerializable, Stringable
{
    public const SCALE = 4;

    private function __construct(private readonly BigDecimal $value) {}

    public static function of(Quantity|BigDecimal|string|int $value): self
    {
        if ($value instanceof self) {
            return $value;
        }

        if ($value instanceof BigDecimal) {
            return new self($value->toScale(self::SCALE, RoundingMode::HalfUp));
        }

        return new self(BigDecimal::of((string) $value)->toScale(self::SCALE, RoundingMode::HalfUp));
    }

    public static function zero(): self
    {
        return self::of('0');
    }

    public function plus(Quantity|string|int $other): self
    {
        return new self($this->value->plus(self::of($other)->value));
    }

    public function minus(Quantity|string|int $other): self
    {
        return new self($this->value->minus(self::of($other)->value));
    }

    public function multipliedBy(Quantity|BigDecimal|string|int $factor): self
    {
        $f = $factor instanceof self ? $factor->value
            : ($factor instanceof BigDecimal ? $factor : BigDecimal::of((string) $factor));

        return new self($this->value->multipliedBy($f)->toScale(self::SCALE, RoundingMode::HalfUp));
    }

    public function dividedBy(Quantity|BigDecimal|string|int $divisor): self
    {
        $d = $divisor instanceof self ? $divisor->value
            : ($divisor instanceof BigDecimal ? $divisor : BigDecimal::of((string) $divisor));

        if ($d->isZero()) {
            throw new InvalidArgumentException('Division by zero in Quantity::dividedBy().');
        }

        return new self($this->value->dividedBy($d, self::SCALE, RoundingMode::HalfUp));
    }

    public function negated(): self
    {
        return new self($this->value->negated());
    }

    public function abs(): self
    {
        return new self($this->value->abs());
    }

    public function isWholeNumber(): bool
    {
        return $this->value->toScale(0, RoundingMode::Down)->compareTo($this->value) === 0;
    }

    public function isZero(): bool
    {
        return $this->value->isZero();
    }

    public function isPositive(): bool
    {
        return $this->value->isPositive();
    }

    public function isNegative(): bool
    {
        return $this->value->isNegative();
    }

    public function compareTo(Quantity|string|int $other): int
    {
        return $this->value->compareTo(self::of($other)->value);
    }

    public function isGreaterThan(Quantity|string|int $other): bool
    {
        return $this->compareTo($other) > 0;
    }

    public function isLessThan(Quantity|string|int $other): bool
    {
        return $this->compareTo($other) < 0;
    }

    public function toBigDecimal(): BigDecimal
    {
        return $this->value;
    }

    public function toString(): string
    {
        return (string) $this->value;
    }

    public function __toString(): string
    {
        return $this->toString();
    }

    public function jsonSerialize(): string
    {
        return $this->toString();
    }

    /** @param iterable<Quantity> $items */
    public static function sum(iterable $items): self
    {
        $total = self::zero();
        foreach ($items as $item) {
            $total = $total->plus($item);
        }

        return $total;
    }
}
