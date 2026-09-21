<?php

namespace App\Domain\Pricing;

use App\Domain\Support\Num;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\PriceList;
use App\Models\Promotion;
use App\Support\CompanyContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Price resolution.
 *
 * Priority, highest first — documented here because it is the question every
 * sales dispute starts with:
 *
 *   1. A contract price agreed with this customer for this item (and unit),
 *      valid on the document date, with the highest qualifying min_qty.
 *   2. A quantity tier in the customer's price list.
 *   3. The plain price-list price.
 *   4. The item-unit's own list price.
 *   5. The item's default sale price × the unit factor.
 *
 * Whatever wins is copied onto the document line. Nothing re-reads these tables
 * once a document is approved.
 */
class PricingService
{
    public function resolve(
        Customer $customer,
        Item $item,
        ItemUnit $itemUnit,
        string $qtyInput,
        ?string $onDate = null,
        ?int $priceListIdOverride = null,
    ): PriceResult {
        $onDate = $onDate ?: now()->toDateString();
        $qtyInput = Num::qty($qtyInput);

        if ($contract = $this->contractPrice($customer, $item, $itemUnit, $qtyInput, $onDate)) {
            return $contract;
        }

        $priceListId = $priceListIdOverride
            ?? $customer->price_list_id
            ?? PriceList::query()->where('is_default', true)->where('is_active', true)->value('id');

        if ($priceListId && $fromList = $this->priceListPrice($priceListId, $item, $itemUnit, $qtyInput, $onDate)) {
            return $fromList;
        }

        if ($itemUnit->sale_price !== null && Num::isPositive($itemUnit->sale_price)) {
            return new PriceResult(
                unitPrice: Num::round($itemUnit->sale_price, 4),
                discountPct: Num::of($customer->discount_pct ?: '0'),
                source: 'item_unit',
            );
        }

        // Last resort: the item's base-unit price scaled by the conversion factor.
        return new PriceResult(
            unitPrice: Num::round(Num::mul($item->default_sale_price, $itemUnit->factor), 4),
            discountPct: Num::of($customer->discount_pct ?: '0'),
            source: 'item_default',
        );
    }

    protected function contractPrice(
        Customer $customer, Item $item, ItemUnit $itemUnit, string $qty, string $onDate,
    ): ?PriceResult {
        $row = DB::table('customer_price_agreements')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('customer_id', $customer->id)
            ->where('item_id', $item->id)
            ->where(fn ($q) => $q->whereNull('item_unit_id')->orWhere('item_unit_id', $itemUnit->id))
            ->where('min_qty', '<=', $qty)
            ->where(fn ($q) => $q->whereNull('valid_from')->orWhere('valid_from', '<=', $onDate))
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $onDate))
            // Unit-specific beats unit-agnostic; bigger qualifying tier beats smaller.
            ->orderByRaw('CASE WHEN item_unit_id IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('min_qty')
            ->first();

        if (! $row || ($row->price === null && Num::isZero($row->discount_pct))) {
            return null;
        }

        $price = $row->price !== null
            ? Num::round($row->price, 4)
            : Num::round(Num::mul($item->default_sale_price, $itemUnit->factor), 4);

        return new PriceResult(
            unitPrice: $price,
            discountPct: Num::of($row->discount_pct),
            source: 'contract',
            ruleId: (int) $row->id,
        );
    }

    protected function priceListPrice(
        int $priceListId, Item $item, ItemUnit $itemUnit, string $qty, string $onDate,
    ): ?PriceResult {
        $list = PriceList::query()->find($priceListId);

        if (! $list || ! $list->is_active) {
            return null;
        }
        if ($list->valid_from && $list->valid_from->gt(Carbon::parse($onDate))) {
            return null;
        }
        if ($list->valid_to && $list->valid_to->lt(Carbon::parse($onDate))) {
            return null;
        }

        $row = DB::table('price_list_lines')
            ->where('price_list_id', $priceListId)
            ->where('item_id', $item->id)
            ->where(fn ($q) => $q->whereNull('item_unit_id')->orWhere('item_unit_id', $itemUnit->id))
            ->where('min_qty', '<=', $qty)
            ->where(fn ($q) => $q->whereNull('valid_from')->orWhere('valid_from', '<=', $onDate))
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $onDate))
            ->orderByRaw('CASE WHEN item_unit_id IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('min_qty')
            ->first();

        if (! $row) {
            return null;
        }

        $isTier = Num::isPositive($row->min_qty, Num::QTY_SCALE);

        return new PriceResult(
            unitPrice: Num::round($row->price, 4),
            discountPct: Num::of($row->discount_pct),
            source: $isTier ? 'price_list_tier' : 'price_list',
            priceListId: $priceListId,
            ruleId: (int) $row->id,
            priceIncludesTax: (bool) $list->prices_include_tax,
        );
    }

    /**
     * Free goods earned by a set of order lines.
     *
     * Bonus quantities are returned as real lines to be added to the order at a
     * zero price. They still leave the warehouse and still carry cost, which is
     * why they are never handled as a pure discount.
     *
     * @param  Collection<int, array{item_id: int, qty_base: string, category_id: int|null, line_total: string}>  $lines
     * @return array<int, array{item_id: int, item_unit_id: int|null, qty_base: string, promotion_id: int}>
     */
    public function bonusLines(Customer $customer, Collection $lines, ?string $onDate = null): array
    {
        $onDate = $onDate ?: now()->toDateString();

        $promotions = Promotion::query()
            ->with('lines')
            ->where('is_active', true)
            ->where('valid_from', '<=', $onDate)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $onDate))
            ->where('kind', 'bxgy')
            ->orderBy('priority')
            ->get()
            ->filter(fn (Promotion $p) => $this->appliesToCustomer($p, $customer));

        $bonuses = [];
        $itemsAlreadyBoosted = [];

        foreach ($promotions as $promotion) {
            foreach ($promotion->lines as $rule) {
                $qty = $this->matchedQty($lines, $rule);

                if (! Num::isPositive($qty, Num::QTY_SCALE) || ! Num::isPositive($rule->min_qty, Num::QTY_SCALE)) {
                    continue;
                }

                // Non-stackable promotions may not pile onto an item that a
                // higher-priority promotion already rewarded.
                $key = $rule->item_id ?? 'cat:'.$rule->category_id;
                if (! $promotion->stackable && isset($itemsAlreadyBoosted[$key])) {
                    continue;
                }

                $times = Num::intDiv($qty, $rule->min_qty);
                $freeQty = Num::qty(Num::mul($times, $rule->free_qty, Num::QTY_SCALE));

                if ($rule->max_free_qty !== null) {
                    $freeQty = Num::min($freeQty, Num::qty($rule->max_free_qty));
                }

                if (! Num::isPositive($freeQty, Num::QTY_SCALE)) {
                    continue;
                }

                $bonuses[] = [
                    'item_id' => $rule->free_item_id ?? $rule->item_id,
                    'item_unit_id' => $rule->free_item_unit_id,
                    'qty_base' => $freeQty,
                    'promotion_id' => $promotion->id,
                ];
                $itemsAlreadyBoosted[$key] = true;
            }
        }

        return $bonuses;
    }

    protected function matchedQty(Collection $lines, $rule): string
    {
        return $lines
            ->filter(function ($l) use ($rule) {
                if ($rule->item_id) {
                    return (int) $l['item_id'] === (int) $rule->item_id;
                }
                if ($rule->category_id) {
                    return (int) ($l['category_id'] ?? 0) === (int) $rule->category_id;
                }

                return false;
            })
            ->reduce(fn ($carry, $l) => Num::add($carry, $l['qty_base'], Num::QTY_SCALE), '0');
    }

    protected function appliesToCustomer(Promotion $promotion, Customer $customer): bool
    {
        $conditions = $promotion->conditions ?? [];

        if (! empty($conditions['customer_kinds'])
            && ! in_array($customer->kind, (array) $conditions['customer_kinds'], true)) {
            return false;
        }
        if (! empty($conditions['region_ids'])
            && ! in_array($customer->region_id, (array) $conditions['region_ids'], true)) {
            return false;
        }
        if (! empty($conditions['price_list_ids'])
            && ! in_array($customer->price_list_id, (array) $conditions['price_list_ids'], true)) {
            return false;
        }
        if (! empty($conditions['customer_ids'])
            && ! in_array($customer->id, (array) $conditions['customer_ids'], true)) {
            return false;
        }

        return true;
    }

    /**
     * Line arithmetic, done once so orders, invoices and returns agree.
     *
     * Tax is computed on the discounted amount. When the source price includes
     * tax, the line is unwound to a net figure first rather than taxed twice.
     *
     * @return array{gross: string, discount_amount: string, net: string, tax_amount: string, total: string}
     */
    public function computeLine(
        string $qtyInput,
        string $unitPrice,
        string $discountPct = '0',
        string $discountAmount = '0',
        string $taxRate = '0',
        bool $priceIncludesTax = false,
    ): array {
        $gross = Num::mul($qtyInput, $unitPrice);

        if ($priceIncludesTax && Num::isPositive($taxRate)) {
            $divisor = Num::add('1', Num::div($taxRate, '100'));
            $gross = Num::div($gross, $divisor);
        }

        $pctDiscount = Num::pct($gross, $discountPct);
        $totalDiscount = Num::add($pctDiscount, $discountAmount);
        $totalDiscount = Num::min($totalDiscount, $gross);

        $net = Num::sub($gross, $totalDiscount);
        $tax = Num::pct($net, $taxRate);

        return [
            'gross' => Num::money($gross),
            'discount_amount' => Num::money($totalDiscount),
            'net' => Num::money($net),
            'tax_amount' => Num::money($tax),
            'total' => Num::money(Num::add($net, $tax)),
        ];
    }
}
