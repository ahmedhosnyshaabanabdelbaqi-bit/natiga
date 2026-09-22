<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Services;

use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Inventory\Services\InventoryService;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;

/**
 * POS-side product search.
 *
 * Optimised for the till: a scan hits an indexed exact barcode match, typing
 * hits a trigram index over Arabic and English names plus prefix matches on
 * SKU/barcode. Results are always paginated.
 */
class ProductLookupService
{
    public function __construct(
        private readonly BarcodeService $barcodes,
        private readonly PricingService $pricing,
        private readonly InventoryService $inventory,
    ) {}

    /**
     * Resolve a scan into a ready-to-add cart line.
     *
     * @return array<string,mixed>|null
     */
    public function scan(string $code, int $warehouseId, ?int $priceListId = null): ?array
    {
        $hit = $this->barcodes->resolve($code);
        if (! $hit) {
            return null;
        }

        $barcode = $hit['barcode'];
        $product = $barcode->product;
        $variant = $barcode->variant ?? $product->defaultVariant();
        $productUnit = $barcode->productUnit ?? $product->defaultSaleUnit();

        if (! $product->is_active || ! $variant || ! $productUnit) {
            return null;
        }

        $list = $this->pricing->listFor($priceListId);
        $qty = $hit['qty'] ?? Quantity::of('1');

        // A price-embedded barcode carries the money; a weight-embedded one
        // carries the quantity. Both are shop-configured layouts.
        $unitPrice = $hit['price'] ?? $this->pricing->priceFor($variant, $productUnit, $list, $qty);
        if ($hit['price'] !== null && $qty->isPositive()) {
            $unitPrice = $hit['price']->dividedBy($qty)->quantize();
        }

        return [
            'variant_id' => $variant->id,
            'product_id' => $product->id,
            'product_unit_id' => $productUnit->id,
            'name' => $product->name,
            'variant_name' => $variant->name,
            'sku' => $variant->sku,
            'barcode' => $barcode->code,
            'unit_name' => $productUnit->unit->name,
            'unit_factor' => (string) $productUnit->factor,
            'qty' => $qty->toString(),
            'unit_price' => $unitPrice->toString(),
            'tracking' => $product->tracking,
            'type' => $product->type,
            'allow_fractional' => (bool) $product->allow_fractional_qty,
            'available' => $this->inventory->available($warehouseId, (int) $variant->id)->toString(),
            // A weight/price barcode identifies one scanned package, so merging
            // it with an earlier scan of the same item would lose information.
            'mergeable' => $hit['qty'] === null && $hit['price'] === null,
        ];
    }

    /**
     * Free-text search over Arabic name, English name, SKU, barcode and serial.
     *
     * @return array{data: list<array<string,mixed>>, total: int, page: int, per_page: int}
     */
    public function search(
        string $term,
        int $warehouseId,
        ?int $priceListId = null,
        ?int $categoryId = null,
        bool $favoritesOnly = false,
        int $page = 1,
        int $perPage = 50,
    ): array {
        $perPage = min($perPage, (int) config('pos.performance.max_page_size', 200));
        $term = trim($term);

        $query = ProductVariant::query()
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->where('products.is_active', true)
            ->where('product_variants.is_active', true)
            ->whereNull('products.deleted_at');

        if ($categoryId) {
            $query->where('products.category_id', $categoryId);
        }
        if ($favoritesOnly) {
            $query->where('products.is_favorite', true);
        }

        if ($term !== '') {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $term).'%';
            $prefix = str_replace(['%', '_'], ['\%', '\_'], $term).'%';

            $query->where(function ($q) use ($like, $prefix, $term) {
                $q->where('products.name', 'ILIKE', $like)
                    ->orWhere('products.name_en', 'ILIKE', $like)
                    ->orWhere('product_variants.sku', 'ILIKE', $prefix)
                    ->orWhere('products.sku', 'ILIKE', $prefix)
                    ->orWhereExists(fn ($sub) => $sub->select(DB::raw(1))->from('barcodes')
                        ->whereColumn('barcodes.variant_id', 'product_variants.id')
                        ->where('barcodes.code', 'LIKE', $prefix))
                    ->orWhereExists(fn ($sub) => $sub->select(DB::raw(1))->from('serials')
                        ->whereColumn('serials.variant_id', 'product_variants.id')
                        ->where('serials.serial', $term));
            });
        }

        $total = (clone $query)->count();

        $rows = $query
            ->orderByDesc('products.is_favorite')
            ->orderBy('products.name')
            ->forPage($page, $perPage)
            ->get([
                'product_variants.id as variant_id',
                'product_variants.sku as variant_sku',
                'product_variants.name as variant_name',
                'product_variants.attributes as variant_attributes',
                'products.id as product_id',
                'products.name',
                'products.name_en',
                'products.type',
                'products.tracking',
                'products.image_path',
                'products.allow_fractional_qty',
                'products.category_id',
            ]);

        $variantIds = $rows->pluck('variant_id')->all();
        $balances = DB::table('stock_balances')
            ->where('warehouse_id', $warehouseId)
            ->whereIn('variant_id', $variantIds)
            ->selectRaw('variant_id, (qty_on_hand - qty_reserved) AS available')
            ->pluck('available', 'variant_id');

        $list = $this->pricing->listFor($priceListId);

        // Batch-load the variants with their default selling unit in ONE query.
        // Resolving them one at a time inside the loop made a 50-row page cost
        // ~340ms on a 10k-item catalogue; the benchmark caught it.
        $variants = ProductVariant::query()
            ->with(['product.units.unit'])
            ->whereIn('id', $variantIds)
            ->get()
            ->keyBy('id');

        $priceRows = DB::table('prices')
            ->where('price_list_id', $list->id)
            ->whereIn('variant_id', $variantIds)
            ->where('min_qty', 0)
            ->selectRaw('variant_id, product_unit_id, price')
            ->get()
            ->keyBy(fn ($r) => $r->variant_id.':'.$r->product_unit_id);

        $data = [];

        foreach ($rows as $row) {
            $variant = $variants->get($row->variant_id);
            if (! $variant) {
                continue;
            }

            $productUnit = $variant->product->defaultSaleUnit();
            if (! $productUnit) {
                continue;
            }

            $priceRow = $priceRows->get($row->variant_id.':'.$productUnit->id);

            $data[] = [
                'variant_id' => (int) $row->variant_id,
                'product_id' => (int) $row->product_id,
                'product_unit_id' => (int) $productUnit->id,
                'name' => $row->name,
                'name_en' => $row->name_en,
                'variant_name' => $row->variant_name,
                'sku' => $row->variant_sku,
                'unit_name' => $productUnit->unit->name,
                'unit_factor' => (string) $productUnit->factor,
                'image_path' => $row->image_path,
                'type' => $row->type,
                'tracking' => $row->tracking,
                'allow_fractional' => (bool) $row->allow_fractional_qty,
                'category_id' => $row->category_id,
                // Quantized to the currency scale so this field matches what
                // /pos/scan returns; the two must not disagree on format.
                // A missing price is shown as "no price set" rather than
                // blocking the whole search.
                'unit_price' => $priceRow ? Money::of((string) $priceRow->price)->toString() : null,
                'available' => (string) ($balances[$row->variant_id] ?? '0'),
            ];
        }

        return ['data' => $data, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
    }
}
