<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Modules\Sales\Services\SaleTotalsCalculator;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Tests\TestCase;

/**
 * The money engine, in isolation: order of operations, discount distribution
 * and the guarantee that the lines always add up to the invoice.
 */
class SaleTotalsCalculatorTest extends TestCase
{
    private SaleTotalsCalculator $calculator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calculator = new SaleTotalsCalculator;
    }

    public function test_line_discount_then_invoice_discount_then_tax(): void
    {
        $totals = $this->calculator->calculate(
            [
                ['qty' => '2', 'unit_price' => '100', 'discount_amount' => '20', 'tax_rate' => '14'],
                ['qty' => '1', 'unit_price' => '80', 'tax_rate' => '14'],
            ],
            ['type' => 'percent', 'value' => '10'],
            cashRoundingStep: '0',
        );

        // gross 280, line discount 20 -> 260, invoice discount 26 -> 234 net
        $this->assertSame('280.00', $totals->subtotal->toString());
        $this->assertSame('20.00', $totals->lineDiscountTotal->toString());
        $this->assertSame('26.00', $totals->invoiceDiscountTotal->toString());
        $this->assertSame('234.00', $totals->taxableAmount->toString());
        $this->assertSame('32.76', $totals->taxTotal->toString()); // 234 x 14%
        $this->assertSame('266.76', $totals->grandTotal->toString());
    }

    public function test_the_invoice_discount_is_spread_in_proportion_to_line_value(): void
    {
        $totals = $this->calculator->calculate(
            [
                ['qty' => '3', 'unit_price' => '100'], // 300
                ['qty' => '4', 'unit_price' => '50'],  // 200
            ],
            ['type' => 'amount', 'value' => '50'],
            cashRoundingStep: '0',
        );

        $this->assertSame('30.00', $totals->lines[0]->invoiceDiscountShare->toString()); // 300/500
        $this->assertSame('20.00', $totals->lines[1]->invoiceDiscountShare->toString()); // 200/500
    }

    public function test_a_rounding_residual_is_given_to_the_largest_line_so_nothing_is_lost(): void
    {
        // 10 split over 3 equal lines cannot divide evenly at 2 decimals.
        $totals = $this->calculator->calculate(
            [
                ['qty' => '1', 'unit_price' => '100'],
                ['qty' => '1', 'unit_price' => '100'],
                ['qty' => '1', 'unit_price' => '100'],
            ],
            ['type' => 'amount', 'value' => '10'],
            cashRoundingStep: '0',
        );

        $shares = array_map(fn ($l) => $l->invoiceDiscountShare->toString(), $totals->lines);

        // The parts must sum EXACTLY to the discount granted.
        $this->assertSame(
            '10.00',
            Money::sum(array_map(fn ($l) => $l->invoiceDiscountShare, $totals->lines))->toString(),
        );
        $this->assertContains('3.34', $shares, 'الكسر المتبقي يذهب لأكبر بند');

        // ... and the lines must sum exactly to the invoice.
        $this->assertSame(
            $totals->grandTotal->toString(),
            Money::sum(array_map(fn ($l) => $l->total, $totals->lines))->toString(),
        );
    }

    public function test_tax_inclusive_prices_are_decomposed_not_added_to(): void
    {
        $totals = $this->calculator->calculate(
            [['qty' => '1', 'unit_price' => '114', 'tax_rate' => '14', 'tax_inclusive' => true]],
            [],
            cashRoundingStep: '0',
        );

        // The customer still pays 114; 100 is revenue and 14 is the tax.
        $this->assertSame('114.00', $totals->grandTotal->toString());
        $this->assertSame('100.00', $totals->taxableAmount->toString());
        $this->assertSame('14.00', $totals->taxTotal->toString());
    }

    public function test_cash_rounding_is_recorded_separately_in_both_directions(): void
    {
        // 10.12 / 0.25 = 40.48 -> rounds DOWN to 10.00, the shop loses 0.12.
        $down = $this->calculator->calculate(
            [['qty' => '1', 'unit_price' => '10.12']],
            [],
            cashRoundingStep: '0.25',
        );
        $this->assertSame('10.00', $down->grandTotal->toString());
        $this->assertSame('-0.12', $down->roundingAdjustment->toString());

        // 10.13 / 0.25 = 40.52 -> rounds UP to 10.25, the shop gains 0.12.
        $up = $this->calculator->calculate(
            [['qty' => '1', 'unit_price' => '10.13']],
            [],
            cashRoundingStep: '0.25',
        );
        $this->assertSame('10.25', $up->grandTotal->toString());
        $this->assertSame('0.12', $up->roundingAdjustment->toString());

        // Either way the adjustment is visible, never folded into revenue.
        $this->assertFalse($down->roundingAdjustment->isZero());
    }

    public function test_a_discount_larger_than_the_invoice_is_refused(): void
    {
        $this->expectException(InvalidOperationException::class);
        $this->expectExceptionMessage('خصم الفاتورة يتجاوز قيمتها.');

        $this->calculator->calculate(
            [['qty' => '1', 'unit_price' => '100']],
            ['type' => 'amount', 'value' => '200'],
        );
    }

    public function test_a_line_discount_larger_than_the_line_is_refused(): void
    {
        $this->expectExceptionMessage('خصم البند يتجاوز قيمته.');

        $this->calculator->calculate([['qty' => '1', 'unit_price' => '100', 'discount_amount' => '150']]);
    }

    public function test_an_empty_cart_is_refused(): void
    {
        $this->expectExceptionMessage('لا توجد بنود في الفاتورة.');
        $this->calculator->calculate([]);
    }

    public function test_a_zero_quantity_line_is_refused(): void
    {
        $this->expectExceptionMessage('كمية البند يجب أن تكون أكبر من صفر.');
        $this->calculator->calculate([['qty' => '0', 'unit_price' => '100']]);
    }
}
