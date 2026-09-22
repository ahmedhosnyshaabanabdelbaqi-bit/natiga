<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\User;
use App\Modules\Catalog\Models\Category;
use App\Modules\Catalog\Services\ProductService;
use App\Modules\Core\Models\Branch;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Core\Services\PosContext;
use App\Modules\Customers\Models\Customer;
use App\Modules\Purchasing\Models\Supplier;
use App\Modules\Purchasing\Services\PurchaseService;
use Illuminate\Database\Seeder;

/**
 * DEMO DATA ONLY. Never runs automatically — `DatabaseSeeder` does not call it.
 *
 *     php artisan db:seed --class=DemoDataSeeder
 *
 * It creates a small, believable catalogue across several activity profiles so
 * the POS can be explored, and receives real stock so costs and balances are
 * genuine rather than invented numbers.
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $branch = Branch::query()->firstOrFail();
        $warehouse = Warehouse::query()->where('is_default', true)->firstOrFail();
        $owner = User::query()->firstOrFail();

        app(PosContext::class)->set($owner, null, (int) $branch->id);

        $categories = [];
        foreach (['بقالة', 'منظفات', 'عناية شخصية', 'كهربائيات', 'ملابس', 'موبايلات'] as $sort => $name) {
            $categories[$name] = Category::query()->firstOrCreate(
                ['name' => $name],
                ['sort_order' => $sort, 'is_active' => true],
            )->id;
        }

        $supplier = Supplier::query()->firstOrCreate(
            ['code' => 'SUP-DEMO'],
            ['name' => 'شركة التوزيع المتحدة', 'phone' => '0100000000', 'payment_terms_days' => 30, 'is_active' => true],
        );

        $products = app(ProductService::class);
        $receiptLines = [];

        /*
         * [sku, name, category, base unit, retail, wholesale, cost, qty,
         *  barcode, extra]
         */
        $catalogue = [
            ['GRC-001', 'شاي العروسة 100 فتلة', 'بقالة', 'piece', '38.00', '35.00', '28.00', '120', '6221031492016', ['carton' => '12', 'favorite' => true]],
            ['GRC-002', 'سكر أبيض 1 كجم', 'بقالة', 'kg', '34.00', '32.00', '27.50', '300', '6221031492023', []],
            ['GRC-003', 'زيت عافية 1 لتر', 'بقالة', 'piece', '72.00', '68.00', '58.00', '90', '6221031492030', ['carton' => '12', 'favorite' => true]],
            ['GRC-004', 'أرز مصري 1 كجم', 'بقالة', 'kg', '30.00', '28.00', '24.00', '250', '6221031492047', []],
            ['GRC-005', 'لحم مفروم طازج', 'بقالة', 'kg', '420.00', '400.00', '340.00', '25', '6221031492054', ['weighted' => true]],

            ['CLN-001', 'برسيل مسحوق 2.5 كجم', 'منظفات', 'piece', '215.00', '205.00', '178.00', '40', '6221031492061', ['carton' => '6']],
            ['CLN-002', 'ديتول معقم 500 مل', 'منظفات', 'piece', '95.00', '90.00', '72.00', '60', '6221031492078', []],

            ['PRS-001', 'شامبو هيد آند شولدرز', 'عناية شخصية', 'piece', '145.00', '138.00', '112.00', '55', '6221031492085', ['favorite' => true]],
            ['PRS-002', 'معجون أسنان سيجنال', 'عناية شخصية', 'piece', '42.00', '39.00', '31.00', '80', '6221031492092', ['carton' => '24']],

            ['ELC-001', 'لمبة LED 12 وات', 'كهربائيات', 'piece', '55.00', '50.00', '38.00', '150', '6221031492108', ['carton' => '25']],
            ['ELC-002', 'كابل كهرباء 2.5 مم', 'كهربائيات', 'metre', '28.00', '26.00', '21.00', '500', '6221031492115', []],

            ['CLO-001', 'تيشيرت قطن رجالي', 'ملابس', 'piece', '350.00', '320.00', '210.00', '40', '6221031492122', ['variants' => true]],

            ['MOB-001', 'هاتف ذكي 128 جيجا', 'موبايلات', 'piece', '15500.00', '15000.00', '12800.00', '0', '6221031492139', ['serial' => true]],
            ['MOB-002', 'شاحن سريع 33 وات', 'موبايلات', 'piece', '280.00', '260.00', '190.00', '35', '6221031492146', []],
        ];

        foreach ($catalogue as [$sku, $name, $category, $unit, $retail, $wholesale, $cost, $qty, $barcode, $extra]) {
            $definition = [
                'sku' => $sku,
                'name' => $name,
                'category_id' => $categories[$category],
                'base_unit' => $unit,
                'min_stock' => '10',
                'is_favorite' => (bool) ($extra['favorite'] ?? false),
                'barcodes' => [['code' => $barcode]],
                'prices' => [
                    ['price_list' => 'RETAIL', 'price' => $retail],
                    ['price_list' => 'WHOLESALE', 'price' => $wholesale],
                ],
                'units' => [],
            ];

            if (isset($extra['carton'])) {
                $definition['units'][] = ['unit' => 'carton', 'factor' => $extra['carton']];
            }
            if ($extra['weighted'] ?? false) {
                $definition['type'] = 'weighted';
                $definition['allow_fractional_qty'] = true;
            }
            if ($extra['serial'] ?? false) {
                $definition['tracking'] = 'serial';
                $definition['warranty_months'] = 12;
            }
            if ($extra['variants'] ?? false) {
                $definition['variants'] = [
                    ['sku' => $sku.'-S-AZ', 'name' => 'أزرق / S', 'attributes' => ['color' => 'أزرق', 'size' => 'S']],
                    ['sku' => $sku.'-M-AZ', 'name' => 'أزرق / M', 'attributes' => ['color' => 'أزرق', 'size' => 'M']],
                    ['sku' => $sku.'-L-AS', 'name' => 'أسود / L', 'attributes' => ['color' => 'أسود', 'size' => 'L']],
                ];
                // The barcode belongs to the first variant; the others get their own.
                $definition['barcodes'] = [['code' => $barcode, 'variant_sku' => $sku.'-S-AZ']];
            }

            $product = $products->create($definition);

            if ($qty !== '0') {
                $receiptLines[] = [
                    'variant_id' => $product->variants->first()->id,
                    'product_unit_id' => $product->units->firstWhere('is_base', true)->id,
                    'qty' => $qty,
                    'unit_cost' => $cost,
                ];
            }

            // The demo phone arrives with real serial numbers.
            if ($extra['serial'] ?? false) {
                $receiptLines[] = [
                    'variant_id' => $product->variants->first()->id,
                    'product_unit_id' => $product->units->firstWhere('is_base', true)->id,
                    'qty' => '3',
                    'unit_cost' => $cost,
                    'serials' => ['IMEI-356938035643809', 'IMEI-356938035643810', 'IMEI-356938035643811'],
                ];
            }
        }

        // Stock enters through a real goods receipt, so the movement ledger
        // explains every unit and the average cost is genuine.
        app(PurchaseService::class)->receive([
            'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id,
            'branch_id' => $branch->id,
            'supplier_reference' => 'DEMO-OPENING',
            'lines' => $receiptLines,
        ]);

        foreach ([
            ['C-DEMO-1', 'أحمد محمود', '01000000001', true, '5000'],
            ['C-DEMO-2', 'سوبر ماركت النور', '01000000002', true, '20000'],
            ['C-DEMO-3', 'فاطمة السيد', '01000000003', false, '0'],
        ] as [$code, $name, $phone, $credit, $limit]) {
            Customer::query()->firstOrCreate(['code' => $code], [
                'name' => $name,
                'phone' => $phone,
                'allow_credit' => $credit,
                'credit_limit' => $limit,
                'payment_terms_days' => $credit ? 30 : 0,
                'type' => str_contains($name, 'سوبر') ? 'wholesale' : 'retail',
                'is_active' => true,
            ]);
        }

        $this->command?->info('بيانات تجريبية: '.count($catalogue).' صنفًا مع مخزون حقيقي و3 عملاء.');
    }
}
