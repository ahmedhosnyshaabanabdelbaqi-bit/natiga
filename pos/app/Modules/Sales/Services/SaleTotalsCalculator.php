<?php

declare(strict_types=1);

namespace App\Modules\Sales\Services;

use App\Modules\Sales\Data\CalculatedLine;
use App\Modules\Sales\Data\CalculatedTotals;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;

/**
 * The money engine. Pure: no database, no clock, no request.
 *
 * ORDER OF OPERATIONS (config: pos.sales.calculation_order) — fixed and tested:
 *   1. line discount   (amount or percent, applied to qty x unit_price)
 *   2. invoice discount (spread across lines IN PROPORTION to their post-line-
 *      discount value, so a later partial return refunds exactly what was
 *      charged for the returned items)
 *   3. tax             (exclusive: added on top; inclusive: extracted from the
 *      price the customer sees)
 *   4. cash rounding   (optional, to the configured step; recorded separately as
 *      rounding_adjustment so it never disappears into revenue)
 *
 * The distributed invoice discount is rounded per line and the residual piastre
 * is given to the largest line, so the sum of the lines always equals the
 * invoice exactly — no money is created or lost by rounding.
 *
 * The client runs the same rules for instant feedback, but the SERVER's result
 * is the only one that is persisted.
 */
class SaleTotalsCalculator
{
    /**
     * @param  list<array{qty: Quantity|string, unit_price: Money|string, discount_amount?: Money|string|null,
     *                    discount_percent?: string|null, tax_rate?: string|null, tax_inclusive?: bool}>  $lines
     * @param  array{type?: string|null, value?: Money|string|null}  $invoiceDiscount
     */
    public function calculate(
        array $lines,
        array $invoiceDiscount = [],
        ?string $cashRoundingStep = null,
    ): CalculatedTotals {
        if ($lines === []) {
            throw new InvalidOperationException('لا توجد بنود في الفاتورة.', 'empty_cart');
        }

        // --- step 1: line level -------------------------------------------------
        $prepared = [];
        $afterLineTotal = Money::zero();
        $grossTotal = Money::zero();
        $lineDiscountTotal = Money::zero();

        foreach ($lines as $i => $line) {
            $qty = Quantity::of($line['qty']);
            $unitPrice = Money::of($line['unit_price']);

            if (! $qty->isPositive()) {
                throw new InvalidOperationException('كمية البند يجب أن تكون أكبر من صفر.', 'invalid_line_qty', 422, ['line' => $i]);
            }
            if ($unitPrice->isNegative()) {
                throw new InvalidOperationException('سعر البند لا يمكن أن يكون سالبًا.', 'invalid_line_price', 422, ['line' => $i]);
            }

            $gross = $unitPrice->multipliedBy($qty)->quantize();

            $discount = Money::zero();
            if (! empty($line['discount_percent']) && (string) $line['discount_percent'] !== '0') {
                $discount = $gross->percentage((string) $line['discount_percent'])->quantize();
            } elseif (isset($line['discount_amount']) && $line['discount_amount'] !== null) {
                $discount = Money::of($line['discount_amount'])->quantize();
            }

            if ($discount->isNegative() || $discount->isGreaterThan($gross)) {
                throw new InvalidOperationException(
                    'خصم البند يتجاوز قيمته.',
                    'line_discount_exceeds_value',
                    422,
                    ['line' => $i, 'gross' => $gross->toString(), 'discount' => $discount->toString()],
                );
            }

            $afterLine = $gross->minus($discount);

            $prepared[] = [
                'index' => $i,
                'qty' => $qty,
                'unit_price' => $unitPrice,
                'gross' => $gross,
                'line_discount' => $discount,
                'after_line' => $afterLine,
                'tax_rate' => (string) ($line['tax_rate'] ?? '0'),
                'tax_inclusive' => (bool) ($line['tax_inclusive'] ?? false),
            ];

            $grossTotal = $grossTotal->plus($gross);
            $lineDiscountTotal = $lineDiscountTotal->plus($discount);
            $afterLineTotal = $afterLineTotal->plus($afterLine);
        }

        // --- step 2: invoice discount, distributed proportionally ---------------
        $invoiceDiscountAmount = $this->resolveInvoiceDiscount($invoiceDiscount, $afterLineTotal);
        $shares = $this->distribute($invoiceDiscountAmount, array_map(fn ($p) => $p['after_line'], $prepared));

        // --- step 3: tax --------------------------------------------------------
        $calculated = [];
        $netTotal = Money::zero();
        $taxTotal = Money::zero();
        $lineTotalSum = Money::zero();

        foreach ($prepared as $k => $p) {
            $share = $shares[$k];
            $charged = $p['after_line']->minus($share);
            $rate = $p['tax_rate'];

            if ($p['tax_inclusive'] && $rate !== '0') {
                // The displayed price already contains the tax: pull it back out.
                $total = $charged->quantize();
                $divisor = BigDecimal::of('1')->plus(BigDecimal::of($rate)->dividedBy(100, 8, RoundingMode::HalfUp));
                $net = $total->dividedBy($divisor)->quantize();
                $tax = $total->minus($net);
            } else {
                $net = $charged->quantize();
                $tax = $rate === '0' ? Money::zero() : $net->percentage($rate)->quantize();
                $total = $net->plus($tax);
            }

            $calculated[] = new CalculatedLine(
                index: $p['index'],
                qty: $p['qty'],
                unitPrice: $p['unit_price'],
                gross: $p['gross'],
                lineDiscount: $p['line_discount'],
                invoiceDiscountShare: $share,
                net: $net,
                taxRate: $rate,
                tax: $tax,
                taxInclusive: $p['tax_inclusive'],
                total: $total,
            );

            $netTotal = $netTotal->plus($net);
            $taxTotal = $taxTotal->plus($tax);
            $lineTotalSum = $lineTotalSum->plus($total);
        }

        // --- step 4: cash rounding ---------------------------------------------
        $step = $cashRoundingStep ?? (string) config('pos.currency.cash_step', '0');
        $grandTotal = $lineTotalSum->quantize();
        $roundingAdjustment = Money::zero();

        if ($step !== '0' && $step !== '') {
            $rounded = $grandTotal->roundToStep($step)->quantize();
            $roundingAdjustment = $rounded->minus($grandTotal);
            $grandTotal = $rounded;
        }

        return new CalculatedTotals(
            lines: $calculated,
            subtotal: $grossTotal->quantize(),
            lineDiscountTotal: $lineDiscountTotal->quantize(),
            invoiceDiscountTotal: $invoiceDiscountAmount->quantize(),
            discountTotal: $lineDiscountTotal->plus($invoiceDiscountAmount)->quantize(),
            taxableAmount: $netTotal->quantize(),
            taxTotal: $taxTotal->quantize(),
            roundingAdjustment: $roundingAdjustment,
            grandTotal: $grandTotal,
        );
    }

    /** @param array{type?: string|null, value?: Money|string|null} $discount */
    private function resolveInvoiceDiscount(array $discount, Money $base): Money
    {
        $type = $discount['type'] ?? null;
        $value = $discount['value'] ?? null;

        if ($type === null || $value === null || (string) $value === '' || (string) $value === '0') {
            return Money::zero();
        }

        $amount = $type === 'percent'
            ? $base->percentage((string) $value)->quantize()
            : Money::of($value)->quantize();

        if ($amount->isNegative()) {
            throw new InvalidOperationException('خصم الفاتورة لا يمكن أن يكون سالبًا.', 'invalid_invoice_discount');
        }
        if ($amount->isGreaterThan($base)) {
            throw new InvalidOperationException(
                'خصم الفاتورة يتجاوز قيمتها.',
                'invoice_discount_exceeds_value',
                422,
                ['discount' => $amount->toString(), 'value' => $base->toString()],
            );
        }

        return $amount;
    }

    /**
     * Split `$amount` across `$weights` proportionally, giving the rounding
     * residual to the heaviest line so the parts sum to the whole exactly.
     *
     * @param  list<Money>  $weights
     * @return list<Money>
     */
    private function distribute(Money $amount, array $weights): array
    {
        $count = count($weights);
        $zeros = array_fill(0, $count, Money::zero());

        if ($amount->isZero() || $count === 0) {
            return $zeros;
        }

        $total = Money::sum($weights);
        if ($total->isZero()) {
            return $zeros;
        }

        $shares = [];
        $assigned = Money::zero();
        $heaviestIndex = 0;
        $heaviest = $weights[0];

        foreach ($weights as $i => $weight) {
            $share = $amount->multipliedBy($weight->toBigDecimal())->dividedBy($total->toBigDecimal())->quantize();
            $shares[$i] = $share;
            $assigned = $assigned->plus($share);

            if ($weight->isGreaterThan($heaviest)) {
                $heaviest = $weight;
                $heaviestIndex = $i;
            }
        }

        $residual = $amount->minus($assigned);
        if (! $residual->isZero()) {
            $shares[$heaviestIndex] = $shares[$heaviestIndex]->plus($residual);
        }

        return $shares;
    }
}
