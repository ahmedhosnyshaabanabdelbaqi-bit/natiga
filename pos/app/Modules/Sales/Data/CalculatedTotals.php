<?php

declare(strict_types=1);

namespace App\Modules\Sales\Data;

use App\Support\Money;

final readonly class CalculatedTotals
{
    /** @param list<CalculatedLine> $lines */
    public function __construct(
        public array $lines,
        public Money $subtotal,
        public Money $lineDiscountTotal,
        public Money $invoiceDiscountTotal,
        public Money $discountTotal,
        public Money $taxableAmount,
        public Money $taxTotal,
        public Money $roundingAdjustment,
        public Money $grandTotal,
    ) {}

    /** @return array<string,mixed> */
    public function toArray(): array
    {
        return [
            'subtotal' => $this->subtotal->toString(),
            'line_discount_total' => $this->lineDiscountTotal->toString(),
            'invoice_discount_total' => $this->invoiceDiscountTotal->toString(),
            'discount_total' => $this->discountTotal->toString(),
            'taxable_amount' => $this->taxableAmount->toString(),
            'tax_total' => $this->taxTotal->toString(),
            'rounding_adjustment' => $this->roundingAdjustment->toString(),
            'grand_total' => $this->grandTotal->toString(),
            'lines' => array_map(fn (CalculatedLine $l) => $l->toArray(), $this->lines),
        ];
    }
}
