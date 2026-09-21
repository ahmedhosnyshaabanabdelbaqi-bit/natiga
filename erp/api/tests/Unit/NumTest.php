<?php

namespace Tests\Unit;

use App\Domain\Support\Num;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class NumTest extends TestCase
{
    #[Test]
    public function it_adds_without_binary_floating_point_error(): void
    {
        // The canonical float failure: 0.1 + 0.2 !== 0.3
        $this->assertSame('0.30', Num::add('0.1', '0.2', 2));
        $this->assertSame(0, Num::cmp(Num::add('0.1', '0.2'), '0.3'));
    }

    #[Test]
    public function it_rounds_half_away_from_zero(): void
    {
        $this->assertSame('2.01', Num::money('2.005'));
        $this->assertSame('-2.01', Num::money('-2.005'));
        $this->assertSame('2.00', Num::money('2.0049'));
    }

    #[Test]
    public function division_by_zero_yields_zero_rather_than_throwing(): void
    {
        $this->assertTrue(Num::isZero(Num::div('5', '0')));
    }

    #[Test]
    public function allocation_parts_always_sum_back_to_the_original_amount(): void
    {
        // A freight charge split three ways cannot lose a piastre.
        foreach ([['100.00', [1, 1, 1]], ['0.01', [5, 3, 2]], ['999.99', [7, 11, 13, 17]]] as [$amount, $weights]) {
            $parts = Num::allocate($amount, $weights);
            $sum = array_reduce($parts, fn ($c, $p) => Num::add($c, $p, 2), '0');

            $this->assertSame(0, Num::cmp($sum, $amount, 2),
                "allocation of {$amount} summed to {$sum}");
        }
    }

    #[Test]
    public function allocation_with_zero_weights_still_reconciles(): void
    {
        $parts = Num::allocate('10.00', ['a' => 0, 'b' => 0]);
        $sum = array_reduce($parts, fn ($c, $p) => Num::add($c, $p, 2), '0');

        $this->assertSame(0, Num::cmp($sum, '10.00', 2));
    }

    #[Test]
    public function percentage_uses_full_precision_before_rounding(): void
    {
        // 14% of 33.33 is 4.6662; rounding only happens at the money boundary.
        $this->assertSame('4.67', Num::money(Num::pct('33.33', '14')));
    }

    #[Test]
    public function integer_division_truncates_toward_zero(): void
    {
        $this->assertSame('3', Num::intDiv('17', '5'));
        $this->assertSame('0', Num::intDiv('4', '5'));
        $this->assertSame('0', Num::intDiv('5', '0'));
    }
}
