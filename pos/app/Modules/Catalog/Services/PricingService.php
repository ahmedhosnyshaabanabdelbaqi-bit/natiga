<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Services;

use App\Modules\Catalog\Models\Price;
use App\Modules\Catalog\Models\PriceList;
use App\Modules\Catalog\Models\ProductUnit;
use App\Modules\Catalog\Models\ProductVariant;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\Cache;

/**
 * Resolves the price actually charged.
 *
 * Which list applied is always explicit on the sale (`price_list_id`) and on
 * every quoted line, so a price never changes "silently" mid-sale: the POS
 * receives the resolved price and the server re-resolves it independently at
 * checkout using the SAME list, and rejects a mismatch it did not authorise.
 */
class PricingService
{
    /** Cached per request; the CACHE holds an id, never a serialised model. */
    private ?PriceList $defaultList = null;

    public function defaultList(): PriceList
    {
        if ($this->defaultList) {
            return $this->defaultList;
        }

        $id = Cache::remember('pos.price_list.default_id', 300, fn () => PriceList::query()
            ->where('is_default', true)->where('is_active', true)->value('id'));

        $list = $id ? PriceList::query()->find($id) : null;

        if (! $list) {
            throw new InvalidOperationException('لا توجد قائمة أسعار افتراضية.', 'no_default_price_list', 500);
        }

        return $this->defaultList = $list;
    }

    public function listFor(?int $priceListId): PriceList
    {
        if ($priceListId === null) {
            return $this->defaultList();
        }

        $list = PriceList::query()->where('is_active', true)->find($priceListId);

        return $list ?? $this->defaultList();
    }

    /**
     * Unit price for a variant in a given selling unit.
     *
     * Falls back, in order: exact (list, variant, unit) tier matching the
     * quantity -> the default list -> the base-unit price scaled by the unit
     * factor. The fallback is what lets a shop define one price per piece and
     * still sell cartons on day one.
     */
    public function priceFor(
        ProductVariant $variant,
        ProductUnit $productUnit,
        ?PriceList $list = null,
        ?Quantity $qty = null,
    ): Money {
        $list ??= $this->defaultList();
        $qty ??= Quantity::of('1');

        $direct = $this->tierPrice($list->id, $variant->id, $productUnit->id, $qty);
        if ($direct !== null) {
            return $direct;
        }

        if (! $list->is_default) {
            $fallbackList = $this->defaultList();
            $direct = $this->tierPrice($fallbackList->id, $variant->id, $productUnit->id, $qty);
            if ($direct !== null) {
                return $direct;
            }
            $list = $fallbackList;
        }

        // Derive from the base unit: carton price = piece price * factor.
        $baseUnit = ProductUnit::query()
            ->where('product_id', $productUnit->product_id)
            ->where('is_base', true)
            ->first();

        if ($baseUnit && $baseUnit->id !== $productUnit->id) {
            $basePrice = $this->tierPrice($list->id, $variant->id, $baseUnit->id, Quantity::of('1'));
            if ($basePrice !== null) {
                return $basePrice->multipliedBy((string) $productUnit->factor)->quantize();
            }
        }

        throw new InvalidOperationException(
            'لا يوجد سعر محدد لهذا الصنف بالوحدة المطلوبة.',
            'price_not_found',
            422,
            ['variant_id' => $variant->id, 'product_unit_id' => $productUnit->id, 'price_list_id' => $list->id],
        );
    }

    private function tierPrice(int $priceListId, int $variantId, int $productUnitId, Quantity $qty): ?Money
    {
        $row = Price::query()
            ->where('price_list_id', $priceListId)
            ->where('variant_id', $variantId)
            ->where('product_unit_id', $productUnitId)
            ->where('min_qty', '<=', $qty->toString())
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->orderByDesc('min_qty')
            ->first();

        return $row ? Money::of($row->price) : null;
    }

    public function flush(): void
    {
        $this->defaultList = null;
        Cache::forget('pos.price_list.default_id');
    }
}
