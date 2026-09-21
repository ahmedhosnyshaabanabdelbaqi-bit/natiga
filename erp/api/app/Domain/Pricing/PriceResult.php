<?php

namespace App\Domain\Pricing;

/**
 * The outcome of price resolution, including which rule won.
 *
 * `source` is stored on the document line so anyone reviewing an old invoice
 * can see why that price applied, without re-running today's rules against it.
 */
final class PriceResult
{
    public function __construct(
        public readonly string $unitPrice,
        public readonly string $discountPct,
        public readonly string $source,      // contract|price_list_tier|price_list|item_unit|item_default
        public readonly ?int $priceListId = null,
        public readonly ?int $ruleId = null,
        public readonly bool $priceIncludesTax = false,
    ) {}

    public function toArray(): array
    {
        return [
            'unit_price' => $this->unitPrice,
            'discount_pct' => $this->discountPct,
            'price_source' => $this->source,
            'price_list_id' => $this->priceListId,
            'rule_id' => $this->ruleId,
            'price_includes_tax' => $this->priceIncludesTax,
        ];
    }
}
