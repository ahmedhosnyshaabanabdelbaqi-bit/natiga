<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Services;

use App\Modules\Access\Services\AuditService;
use App\Modules\Catalog\Models\Barcode;
use App\Modules\Catalog\Models\Price;
use App\Modules\Catalog\Models\PriceList;
use App\Modules\Catalog\Models\Product;
use App\Modules\Catalog\Models\ProductUnit;
use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Catalog\Models\Unit;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Product authoring.
 *
 * Invariants kept here:
 *  - every product has exactly one BASE unit with factor 1, and every other
 *    selling unit declares its factor to that base;
 *  - every product has at least one variant, so sale lines, stock and prices
 *    always point at a variant;
 *  - barcodes are text and unique establishment-wide;
 *  - a product with history is never deleted, only deactivated.
 */
class ProductService
{
    public function __construct(
        private readonly PricingService $pricing,
        private readonly AuditService $audit,
    ) {}

    /**
     * @param array{
     *   sku:string, name:string, name_en?:string|null, type?:string, tracking?:string,
     *   category_id?:int|null, brand_id?:int|null, tax_group_id?:int|null,
     *   base_unit:string, track_stock?:bool, allow_fractional_qty?:bool,
     *   min_stock?:string, warranty_months?:int|null, is_favorite?:bool, image_path?:string|null,
     *   units?:list<array{unit:string, factor:string, is_default_sale?:bool, is_default_purchase?:bool}>,
     *   variants?:list<array{sku?:string, name?:string|null, attributes?:array<string,string>}>,
     *   barcodes?:list<array{code:string, variant_sku?:string|null, unit?:string|null, type?:string}>,
     *   prices?:list<array{price_list?:string, variant_sku?:string|null, unit?:string|null, price:string, min_qty?:string}>
     * } $data
     */
    public function create(array $data): Product
    {
        return DB::transaction(function () use ($data): Product {
            $baseUnit = Unit::query()->where('code', $data['base_unit'])->firstOr(
                fn () => throw new InvalidOperationException('وحدة القياس الأساسية غير معروفة.', 'unit_unknown', 422, ['unit' => $data['base_unit']])
            );

            $product = Product::query()->create([
                'sku' => $data['sku'],
                'name' => $data['name'],
                'name_en' => $data['name_en'] ?? null,
                'description' => $data['description'] ?? null,
                'category_id' => $data['category_id'] ?? null,
                'brand_id' => $data['brand_id'] ?? null,
                'tax_group_id' => $data['tax_group_id'] ?? null,
                'base_unit_id' => $baseUnit->id,
                'type' => $data['type'] ?? Product::TYPE_STANDARD,
                'tracking' => $data['tracking'] ?? Product::TRACKING_NONE,
                'has_variants' => count($data['variants'] ?? []) > 1,
                'track_stock' => $data['track_stock'] ?? (($data['type'] ?? 'standard') !== Product::TYPE_SERVICE),
                'allow_fractional_qty' => $data['allow_fractional_qty'] ?? (($data['type'] ?? '') === Product::TYPE_WEIGHTED),
                'warranty_months' => $data['warranty_months'] ?? null,
                'min_stock' => $data['min_stock'] ?? '0',
                'reorder_qty' => $data['reorder_qty'] ?? '0',
                'image_path' => $data['image_path'] ?? null,
                'is_favorite' => $data['is_favorite'] ?? false,
                'is_active' => $data['is_active'] ?? true,
                'attributes' => $data['attributes'] ?? null,
            ]);

            // ---- units --------------------------------------------------------
            $unitsByCode = [];
            $base = ProductUnit::query()->create([
                'product_id' => $product->id,
                'unit_id' => $baseUnit->id,
                'factor' => '1',
                'is_base' => true,
                'is_default_sale' => true,
                'is_default_purchase' => true,
            ]);
            $unitsByCode[$baseUnit->code] = $base;

            foreach ($data['units'] ?? [] as $unitData) {
                if ($unitData['unit'] === $baseUnit->code) {
                    continue;
                }
                $unit = Unit::query()->where('code', $unitData['unit'])->firstOr(
                    fn () => throw new InvalidOperationException('وحدة القياس غير معروفة.', 'unit_unknown', 422, ['unit' => $unitData['unit']])
                );

                $productUnit = ProductUnit::query()->create([
                    'product_id' => $product->id,
                    'unit_id' => $unit->id,
                    'factor' => $unitData['factor'],
                    'is_base' => false,
                    'is_default_sale' => $unitData['is_default_sale'] ?? false,
                    'is_default_purchase' => $unitData['is_default_purchase'] ?? false,
                ]);
                $unitsByCode[$unit->code] = $productUnit;

                if ($unitData['is_default_sale'] ?? false) {
                    $base->forceFill(['is_default_sale' => false])->save();
                }
            }

            // ---- variants -----------------------------------------------------
            $variantsBySku = [];
            $variantDefs = $data['variants'] ?? [];
            if ($variantDefs === []) {
                $variantDefs = [['sku' => $product->sku, 'name' => null, 'attributes' => null]];
            }

            foreach ($variantDefs as $i => $variantData) {
                $variant = ProductVariant::query()->create([
                    'product_id' => $product->id,
                    'sku' => $variantData['sku'] ?? ($product->sku.'-'.($i + 1)),
                    'name' => $variantData['name'] ?? null,
                    'attributes' => $variantData['attributes'] ?? null,
                    'is_default' => $i === 0,
                    'is_active' => true,
                ]);
                $variantsBySku[$variant->sku] = $variant;
            }

            $defaultVariant = reset($variantsBySku);

            // ---- barcodes -----------------------------------------------------
            foreach ($data['barcodes'] ?? [] as $barcodeData) {
                $this->addBarcode(
                    $product,
                    (string) $barcodeData['code'],
                    isset($barcodeData['variant_sku']) ? ($variantsBySku[$barcodeData['variant_sku']] ?? $defaultVariant) : $defaultVariant,
                    isset($barcodeData['unit']) ? ($unitsByCode[$barcodeData['unit']] ?? null) : null,
                    $barcodeData['type'] ?? 'standard',
                );
            }

            // ---- prices -------------------------------------------------------
            foreach ($data['prices'] ?? [] as $priceData) {
                $list = PriceList::query()->where('code', $priceData['price_list'] ?? 'RETAIL')->firstOrFail();
                $variant = isset($priceData['variant_sku']) ? ($variantsBySku[$priceData['variant_sku']] ?? $defaultVariant) : null;
                $productUnit = isset($priceData['unit']) ? ($unitsByCode[$priceData['unit']] ?? $base) : $base;

                $targets = $variant ? [$variant] : array_values($variantsBySku);
                foreach ($targets as $target) {
                    Price::query()->updateOrCreate(
                        [
                            'price_list_id' => $list->id,
                            'variant_id' => $target->id,
                            'product_unit_id' => $productUnit->id,
                            'min_qty' => $priceData['min_qty'] ?? '0',
                        ],
                        ['price' => Money::of($priceData['price'])->toString(4)],
                    );
                }
            }

            $this->audit->log('product.created', $product, null, ['sku' => $product->sku, 'name' => $product->name]);

            return $product->load(['variants', 'units.unit', 'barcodes']);
        });
    }

    public function addBarcode(Product $product, string $code, ?ProductVariant $variant = null, ?ProductUnit $productUnit = null, string $type = 'standard'): Barcode
    {
        $code = trim($code);
        if ($code === '') {
            throw new InvalidOperationException('الباركود لا يمكن أن يكون فارغًا.', 'barcode_empty');
        }

        // Checked before inserting rather than by catching the unique violation:
        // in PostgreSQL a failed statement aborts the surrounding transaction,
        // and this runs inside product creation. The UNIQUE index stays as the
        // backstop against a genuine race.
        $owner = Barcode::query()->where('code', $code)->first();
        if ($owner) {
            throw new InvalidOperationException(
                'الباركود مستخدم بالفعل لصنف آخر.',
                'barcode_duplicate',
                422,
                ['code' => $code, 'product_id' => $owner->product_id],
            );
        }

        return Barcode::query()->create([
            'code' => $code, // TEXT: leading zeros preserved
            'product_id' => $product->id,
            'variant_id' => $variant?->id,
            'product_unit_id' => $productUnit?->id,
            'type' => $type,
            'is_primary' => ! Barcode::query()->where('product_id', $product->id)->exists(),
        ]);
    }

    /**
     * Products are deactivated, never deleted, once they have any history —
     * deleting one would orphan old invoices and stock movements.
     */
    public function deactivate(Product $product, ?string $reason = null): Product
    {
        $product->forceFill(['is_active' => false])->save();
        $product->variants()->update(['is_active' => false]);

        $this->audit->log('product.deactivated', $product, ['is_active' => true], ['is_active' => false], $reason);

        return $product;
    }

    public function hasHistory(Product $product): bool
    {
        return DB::table('sale_lines')->where('product_id', $product->id)->exists()
            || DB::table('stock_movements')->where('product_id', $product->id)->exists();
    }

    public function delete(Product $product): void
    {
        if ($this->hasHistory($product)) {
            throw new InvalidOperationException(
                'لا يمكن حذف صنف له معاملات سابقة. استخدم التعطيل للحفاظ على التاريخ.',
                'product_has_history',
                422,
            );
        }

        $this->audit->log('product.deleted', $product, ['sku' => $product->sku], null);
        $product->delete();
    }

    public function generateSku(string $prefix = 'P'): string
    {
        return $prefix.'-'.strtoupper(Str::random(8));
    }
}
