<?php

namespace Tests\Unit\Support;

use App\Support\Money\Money;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MoneyTest extends TestCase
{
    public function test_decimal_arithmetic_has_no_floating_point_error(): void
    {
        $this->assertSame('0.30', Money::add('0.10', '0.20'));
        $this->assertSame('0.30', Money::toDecimal(Money::sum(['0.1', '0.2'])));
        $this->assertSame('5000.00', Money::sub('12000', '7000'));
        $this->assertSame('4000.00', Money::sub('5000', '1000'));
    }

    public function test_percentage_deposit_rounds_half_up(): void
    {
        $this->assertSame('3600.00', Money::percent('12000', 30));
        $this->assertSame('0.03', Money::percent('0.05', 50)); // 0.025 rounds half-up to 0.03
    }

    public function test_allocation_sums_exactly_to_the_original_amount(): void
    {
        $parts = Money::allocate('100.00', [1, 1, 1]);
        $this->assertSame(['33.34', '33.33', '33.33'], array_values($parts));
        $this->assertSame('100.00', Money::toDecimal(Money::sum($parts)));

        $weighted = Money::allocate('1000.00', ['a' => '2.5', 'b' => '1.25', 'c' => '0.25']);
        $this->assertSame(['a' => '625.00', 'b' => '312.50', 'c' => '62.50'], $weighted);

        $zeroWeights = Money::allocate('10.00', [0, 0, 0]);
        $this->assertSame('10.00', Money::toDecimal(Money::sum($zeroWeights)));
    }

    #[DataProvider('allocationCases')]
    public function test_allocation_never_loses_a_cent(string $amount, array $weights): void
    {
        $this->assertSame(Money::toDecimal($amount), Money::toDecimal(Money::sum(Money::allocate($amount, $weights))));
    }

    public static function allocationCases(): array
    {
        return [
            ['0.01', [1, 1, 1]],
            ['99.99', [3, 7, 11, 13]],
            ['12345.67', ['0.333', '0.333', '0.334']],
            ['1.00', [1, 2, 3, 4, 5, 6, 7]],
        ];
    }

    public function test_split_puts_remainder_on_first_parts(): void
    {
        $this->assertSame(['33.34', '33.33', '33.33'], Money::split('100', 3));
    }

    public function test_currency_conversion_uses_the_given_rate_snapshot(): void
    {
        $this->assertSame('12000.00', Money::convert('250', 'USD', 'EGP', '48.00'));
        $this->assertSame('4.89', Money::convert('0.10', 'USD', 'EGP', '48.855'));
    }

    public function test_comparisons_and_formatting(): void
    {
        $this->assertSame(1, Money::compare('10.01', '10'));
        $this->assertTrue(Money::isZero('0.00'));
        $this->assertTrue(Money::isNegative('-0.01'));
        $this->assertSame('12,000.50 ج.م', Money::format('12000.5', 'EGP', 'ar'));
        $this->assertSame('USD 1,234.00', Money::format('1234', 'USD', 'en'));
    }
}
