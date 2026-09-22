<?php

declare(strict_types=1);

namespace App\Modules\Sales\Data;

use App\Support\Money;
use App\Support\Quantity;

/** One fully priced sale line, as produced by SaleTotalsCalculator. */
final readonly class CalculatedLine
{
    public function __construct(
        public int $index,
        public Quantity $qty,
        public Money $unitPrice,
        public Money $gross,
        public Money $lineDiscount,
        public Money $invoiceDiscountShare,
        public Money $net,
        public string $taxRate,
        public Money $tax,
        public bool $taxInclusive,
        public Money $total,
    ) {}

    /** @return array<string,string> */
    public function toArray(): array
    {
        return [
            'index' => (string) $this->index,
            'qty' => $this->qty->toString(),
            'unit_price' => $this->unitPrice->toString(),
            'gross_amount' => $this->gross->toString(),
            'line_discount_amount' => $this->lineDiscount->toString(),
            'invoice_discount_share' => $this->invoiceDiscountShare->toString(),
            'net_amount' => $this->net->toString(),
            'tax_rate' => $this->taxRate,
            'tax_amount' => $this->tax->toString(),
            'total_amount' => $this->total->toString(),
        ];
    }
}
