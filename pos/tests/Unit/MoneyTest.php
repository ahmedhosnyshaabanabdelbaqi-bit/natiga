<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Money;
use App\Support\Quantity;
use Tests\TestCase;

/** Money must never behave like a float. */
class MoneyTest extends TestCase
{
    public function test_addition_that_a_float_would_get_wrong(): void
    {
        // 0.1 + 0.2 === 0.30000000000000004 in binary floating point.
        $result = Money::of('0.1')->plus(Money::of('0.2'));

        $this->assertSame('0.30', $result->toString(2));
        $this->assertTrue($result->equals(Money::of('0.3')));
    }

    public function test_repeated_addition_does_not_drift(): void
    {
        $total = Money::zero();
        for ($i = 0; $i < 1000; $i++) {
            $total = $total->plus(Money::of('0.01'));
        }

        $this->assertSame('10.00', $total->toString(2));
    }

    public function test_percentages_are_exact(): void
    {
        $this->assertSame('14.00', Money::of('100')->percentage('14')->toString(2));
        $this->assertSame('4.62', Money::of('33')->percentage('14')->toString(2));
    }

    public function test_intermediate_precision_is_kept_before_rounding(): void
    {
        // 3 items at 33.333... each: rounding only at the end.
        $unit = Money::of('100')->dividedBy(Quantity::of('3'));
        $line = $unit->multipliedBy(Quantity::of('3'));

        $this->assertSame('100.00', $line->toString(2));
    }

    public function test_rounding_to_a_cash_step(): void
    {
        $this->assertSame('10.25', Money::of('10.24')->roundToStep('0.25')->toString(2));
        $this->assertSame('10.00', Money::of('10.10')->roundToStep('0.25')->toString(2));
        $this->assertSame('11.00', Money::of('10.60')->roundToStep('1')->toString(2));
    }

    public function test_comparisons_use_exact_values(): void
    {
        $this->assertTrue(Money::of('0.3')->equals(Money::of('0.1')->plus('0.2')));
        $this->assertTrue(Money::of('10')->isGreaterThan('9.999'));
        $this->assertFalse(Money::of('10')->isGreaterThan('10'));
        $this->assertTrue(Money::of('-1')->isNegative());
    }

    public function test_quantity_whole_number_detection(): void
    {
        $this->assertTrue(Quantity::of('3')->isWholeNumber());
        $this->assertTrue(Quantity::of('3.0000')->isWholeNumber());
        $this->assertFalse(Quantity::of('3.5')->isWholeNumber());
        $this->assertFalse(Quantity::of('0.001')->isWholeNumber());
    }

    public function test_quantity_supports_gram_precision(): void
    {
        $this->assertSame('0.7500', Quantity::of('0.75')->toString());
        $this->assertSame('1.2340', Quantity::of('1.234')->toString());
    }
}
