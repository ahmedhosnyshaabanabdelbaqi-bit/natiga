<?php

namespace Database\Seeders;

use App\Domain\Support\Num;
use App\Models\Barcode;
use App\Models\Brand;
use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\ItemUnit;
use App\Models\PriceList;
use App\Models\PriceListLine;
use App\Models\TaxRate;
use App\Models\Unit;
use App\Support\CompanyContext;
use Illuminate\Database\Seeder;

/**
 * Units, tax rates, price lists and a representative item catalogue.
 *
 * The items span the activities the system targets — detergents, food,
 * cosmetics, electrical goods — including a batch-and-expiry item and a
 * sold-by-the-metre reel, so the optional per-item features are exercised
 * rather than merely available.
 */
class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $companyId = CompanyContext::idOrFail();

        $units = collect([
            ['PC', 'قطعة', 'count', 0],
            ['BOX', 'علبة', 'count', 0],
            ['DOZ', 'دستة', 'count', 0],
            ['CTN', 'كرتونة', 'count', 0],
            ['PACK', 'عبوة', 'count', 0],
            ['KG', 'كيلوجرام', 'weight', 3],
            ['M', 'متر', 'length', 2],
            ['ROLL', 'بكرة', 'length', 0],
        ])->mapWithKeys(fn ($u) => [$u[0] => Unit::updateOrCreate(
            ['company_id' => $companyId, 'code' => $u[0]],
            ['name' => $u[1], 'kind' => $u[2], 'decimals' => $u[3], 'is_active' => true]
        )]);

        // A dated tax rate — the rate is configuration reviewed by the
        // accountant, never a constant baked into the code.
        $vat = TaxRate::updateOrCreate(
            ['company_id' => $companyId, 'code' => 'VAT14', 'valid_from' => '2024-01-01'],
            ['name' => 'ضريبة قيمة مضافة 14%', 'rate' => '14.0000', 'kind' => 'vat', 'is_active' => true]
        );

        $zero = TaxRate::updateOrCreate(
            ['company_id' => $companyId, 'code' => 'VAT0', 'valid_from' => '2024-01-01'],
            ['name' => 'معفى', 'rate' => '0.0000', 'kind' => 'vat', 'is_active' => true]
        );

        $categories = collect([
            ['DET', 'منظفات'],
            ['FOOD', 'مواد غذائية'],
            ['COSM', 'مستحضرات تجميل'],
            ['ELEC', 'أدوات كهربائية'],
        ])->mapWithKeys(fn ($c) => [$c[0] => ItemCategory::updateOrCreate(
            ['company_id' => $companyId, 'code' => $c[0]],
            ['name' => $c[1], 'is_active' => true]
        )]);

        $brands = collect([['BR1', 'العلامة الأولى'], ['BR2', 'العلامة الثانية']])
            ->mapWithKeys(fn ($b) => [$b[0] => Brand::updateOrCreate(
                ['company_id' => $companyId, 'code' => $b[0]],
                ['name' => $b[1], 'is_active' => true]
            )]);

        $priceLists = [
            'WHOLESALE' => PriceList::updateOrCreate(
                ['company_id' => $companyId, 'code' => 'WHOLESALE'],
                ['name' => 'أسعار الجملة', 'kind' => 'wholesale', 'is_default' => true,
                    'priority' => 10, 'is_active' => true]
            ),
            'RETAIL' => PriceList::updateOrCreate(
                ['company_id' => $companyId, 'code' => 'RETAIL'],
                ['name' => 'أسعار القطاعي', 'kind' => 'retail', 'priority' => 20, 'is_active' => true]
            ),
            'DIST' => PriceList::updateOrCreate(
                ['company_id' => $companyId, 'code' => 'DIST'],
                ['name' => 'أسعار الموزعين', 'kind' => 'distributor', 'priority' => 5, 'is_active' => true]
            ),
        ];

        $items = [
            [
                'code' => 'DET-001', 'name' => 'مسحوق غسيل 1 كجم', 'category' => 'DET', 'brand' => 'BR1',
                'base' => 'PC', 'tax' => $vat, 'price' => '45.0000',
                'units' => [['PC', 1, '45.0000', '6221000000011'], ['CTN', 12, '520.0000', '6221000000028']],
                'reorder' => 240, 'reorder_qty' => 600,
            ],
            [
                'code' => 'DET-002', 'name' => 'سائل تنظيف أطباق 750 مل', 'category' => 'DET', 'brand' => 'BR1',
                'base' => 'PC', 'tax' => $vat, 'price' => '28.5000',
                'units' => [['PC', 1, '28.5000', '6221000000035'], ['CTN', 24, '655.0000', null]],
                'reorder' => 300, 'reorder_qty' => 720,
            ],
            [
                // Batch- and expiry-tracked: FEFO picking and expiry blocking apply.
                'code' => 'FOOD-001', 'name' => 'زيت طعام 1 لتر', 'category' => 'FOOD', 'brand' => 'BR2',
                'base' => 'PC', 'tax' => $zero, 'price' => '72.0000',
                'units' => [['PC', 1, '72.0000', '6221000000042'], ['CTN', 12, '850.0000', null]],
                'batches' => true, 'expiry' => true, 'shelf_life' => 365, 'min_shelf_life' => 30,
                'reorder' => 360, 'reorder_qty' => 720,
            ],
            [
                'code' => 'FOOD-002', 'name' => 'أرز مصري — سائب', 'category' => 'FOOD', 'brand' => 'BR2',
                'base' => 'KG', 'tax' => $zero, 'price' => '32.0000',
                'units' => [['KG', 1, '32.0000', null]],
                'weighted' => true, 'partial' => true, 'batches' => true, 'expiry' => true,
                'shelf_life' => 180, 'min_shelf_life' => 15,
                'reorder' => 500, 'reorder_qty' => 1000,
            ],
            [
                'code' => 'COSM-001', 'name' => 'شامبو 400 مل', 'category' => 'COSM', 'brand' => 'BR1',
                'base' => 'PC', 'tax' => $vat, 'price' => '95.0000',
                'units' => [['PC', 1, '95.0000', '6221000000059'], ['DOZ', 12, '1090.0000', null]],
                'batches' => true, 'expiry' => true, 'shelf_life' => 730, 'min_shelf_life' => 90,
                'reorder' => 120, 'reorder_qty' => 240,
            ],
            [
                // Sold by the metre from a reel — the electrical-goods case.
                'code' => 'ELEC-001', 'name' => 'كابل كهرباء 2×1.5 مم', 'category' => 'ELEC', 'brand' => 'BR2',
                'base' => 'M', 'tax' => $vat, 'price' => '18.0000',
                'units' => [['M', 1, '18.0000', null], ['ROLL', 100, '1700.0000', '6221000000066']],
                'weighted' => true, 'partial' => true,
                'reorder' => 500, 'reorder_qty' => 2000,
            ],
            [
                'code' => 'ELEC-002', 'name' => 'مفتاح كهربائي مفرد', 'category' => 'ELEC', 'brand' => 'BR2',
                'base' => 'PC', 'tax' => $vat, 'price' => '22.0000',
                'units' => [['PC', 1, '22.0000', '6221000000073'], ['BOX', 20, '420.0000', null]],
                'reorder' => 200, 'reorder_qty' => 500,
            ],
        ];

        foreach ($items as $spec) {
            $item = Item::updateOrCreate(
                ['company_id' => $companyId, 'code' => $spec['code']],
                [
                    'name' => $spec['name'],
                    'category_id' => $categories[$spec['category']]->id,
                    'brand_id' => $brands[$spec['brand']]->id,
                    'base_unit_id' => $units[$spec['base']]->id,
                    'tax_rate_id' => $spec['tax']->id,
                    'is_taxable' => $spec['tax']->rate > 0,
                    'track_batches' => $spec['batches'] ?? false,
                    'track_expiry' => $spec['expiry'] ?? false,
                    'is_weighted' => $spec['weighted'] ?? false,
                    'allow_partial_unit' => $spec['partial'] ?? false,
                    'shelf_life_days' => $spec['shelf_life'] ?? null,
                    'min_shelf_life_sale_days' => $spec['min_shelf_life'] ?? 0,
                    'reorder_point' => $spec['reorder'],
                    'reorder_qty' => $spec['reorder_qty'],
                    'lead_time_days' => 7,
                    'default_sale_price' => $spec['price'],
                    'status' => 'active',
                ]
            );

            foreach ($spec['units'] as $index => [$unitCode, $factor, $price, $barcode]) {
                $itemUnit = ItemUnit::updateOrCreate(
                    ['item_id' => $item->id, 'unit_id' => $units[$unitCode]->id],
                    [
                        'factor' => $factor,
                        'is_base' => $factor == 1,
                        'is_sales_default' => $index === 0,
                        'is_purchase_default' => $index === count($spec['units']) - 1,
                        'sale_price' => $price,
                        'is_active' => true,
                    ]
                );

                if ($barcode) {
                    Barcode::updateOrCreate(
                        ['company_id' => $companyId, 'barcode' => $barcode],
                        ['item_id' => $item->id, 'item_unit_id' => $itemUnit->id, 'is_primary' => $index === 0]
                    );
                }

                // Wholesale at list, retail +12%, distributor −6% with a
                // quantity tier — enough shape to exercise the resolver.
                PriceListLine::updateOrCreate(
                    ['price_list_id' => $priceLists['WHOLESALE']->id, 'item_id' => $item->id,
                        'item_unit_id' => $itemUnit->id, 'min_qty' => 0],
                    ['price' => $price, 'discount_pct' => 0]
                );

                PriceListLine::updateOrCreate(
                    ['price_list_id' => $priceLists['RETAIL']->id, 'item_id' => $item->id,
                        'item_unit_id' => $itemUnit->id, 'min_qty' => 0],
                    ['price' => Num::mul($price, '1.12', 4), 'discount_pct' => 0]
                );

                PriceListLine::updateOrCreate(
                    ['price_list_id' => $priceLists['DIST']->id, 'item_id' => $item->id,
                        'item_unit_id' => $itemUnit->id, 'min_qty' => 0],
                    ['price' => Num::mul($price, '0.94', 4), 'discount_pct' => 0]
                );

                PriceListLine::updateOrCreate(
                    ['price_list_id' => $priceLists['DIST']->id, 'item_id' => $item->id,
                        'item_unit_id' => $itemUnit->id, 'min_qty' => 50],
                    ['price' => Num::mul($price, '0.90', 4), 'discount_pct' => 0]
                );
            }
        }
    }
}
