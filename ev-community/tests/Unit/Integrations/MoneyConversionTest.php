<?php

namespace Tests\Unit\Integrations;

use App\Support\Money\Money;
use PHPUnit\Framework\TestCase;

class MoneyConversionTest extends TestCase
{
    public function test_250_usd_at_48_is_12000_egp(): void
    {
        $this->assertSame('12000.00', Money::convert('250', 'USD', 'EGP', '48.00'));
        $this->assertSame('12000.00', Money::convert('250.00', 'USD', 'EGP', '48.00000000'));
    }

    public function test_conversion_rounds_half_up_to_currency_minor_units(): void
    {
        $this->assertSame('485.05', Money::convert('10.00', 'USD', 'EGP', '48.505'));   // 485.05
        $this->assertSame('48.51', Money::convert('1.00', 'USD', 'EGP', '48.505'));     // 48.505 → 48.51
    }
}
