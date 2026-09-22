<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Modules\Catalog\Models\PriceList;
use App\Modules\Catalog\Models\Unit;
use App\Modules\Core\Models\Branch;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Models\Warehouse;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Builds a load-test dataset: 10k items and 50k historical invoices by default.
 *
 * HONESTY NOTE: the historical invoices are written as bulk rows, NOT through
 * SaleService — generating 50k invoices through the full transactional path
 * would take hours and is not what this dataset is for. It exists to make
 * SEARCH, SCAN and REPORT queries face realistic table sizes. Opening balances
 * are seeded high so that benchmark checkouts (which DO go through the real
 * service) have stock to sell.
 */
class SeedPerformanceCommand extends Command
{
    protected $signature = 'pos:seed-performance
        {--products=10000 : number of products}
        {--sales=50000 : number of historical invoices}
        {--lines=3 : average lines per invoice}';

    protected $description = 'Seeds a realistic-size dataset for performance measurement.';

    public function handle(): int
    {
        $productCount = (int) $this->option('products');
        $saleCount = (int) $this->option('sales');
        $linesPer = max(1, (int) $this->option('lines'));

        $branch = Branch::query()->firstOrFail();
        $warehouse = Warehouse::query()->where('is_default', true)->firstOrFail();
        $terminal = Terminal::query()->firstOrFail();
        $user = User::query()->firstOrFail();
        $priceList = PriceList::query()->where('is_default', true)->firstOrFail();
        $pieceUnitId = (int) Unit::query()->where('code', 'piece')->value('id');

        $this->info("توليد $productCount صنف...");
        $this->seedProducts($productCount, $pieceUnitId, $priceList->id, $warehouse->id);

        $this->info("توليد $saleCount فاتورة...");
        $this->seedSales($saleCount, $linesPer, $branch->id, $warehouse->id, $terminal->id, $user->id, $priceList->id);

        $this->info('تحليل الجداول...');
        DB::statement('ANALYZE');

        $this->newLine();
        $this->table(['الجدول', 'عدد السجلات'], [
            ['products', DB::table('products')->count()],
            ['product_variants', DB::table('product_variants')->count()],
            ['barcodes', DB::table('barcodes')->count()],
            ['prices', DB::table('prices')->count()],
            ['stock_balances', DB::table('stock_balances')->count()],
            ['sales', DB::table('sales')->count()],
            ['sale_lines', DB::table('sale_lines')->count()],
            ['sale_payments', DB::table('sale_payments')->count()],
        ]);

        return self::SUCCESS;
    }

    private function seedProducts(int $count, int $pieceUnitId, int $priceListId, int $warehouseId): void
    {
        $categories = $this->seedCategories();
        $names = ['شامبو', 'صابون', 'معجون أسنان', 'مناديل', 'أرز', 'سكر', 'زيت', 'شاي', 'قهوة', 'بسكويت',
            'مصباح LED', 'كابل كهرباء', 'مفتاح إنجليزي', 'قلم جاف', 'كشكول', 'جوارب', 'قميص', 'حذاء',
            'شاحن هاتف', 'سماعة', 'عطر', 'كريم مرطب', 'خرطوم مياه', 'صنبور', 'فلتر زيت'];

        $startId = (int) (DB::table('products')->max('id') ?? 0);
        $bar = $this->output->createProgressBar($count);

        foreach (array_chunk(range(1, $count), 500) as $chunk) {
            $products = [];
            $variants = [];
            $units = [];
            $barcodes = [];
            $prices = [];
            $balances = [];
            $now = now();

            foreach ($chunk as $i) {
                $id = $startId + $i;
                $sku = 'PERF-'.str_pad((string) $i, 7, '0', STR_PAD_LEFT);

                $products[] = [
                    'id' => $id,
                    'sku' => $sku,
                    'name' => $names[$i % count($names)].' '.$i,
                    'name_en' => 'Item '.$i,
                    'category_id' => $categories[$i % count($categories)],
                    'base_unit_id' => $pieceUnitId,
                    'type' => 'standard',
                    'tracking' => 'none',
                    'has_variants' => false,
                    'track_stock' => true,
                    'allow_fractional_qty' => false,
                    'allow_negative_stock' => false,
                    'price_change_allowed' => true,
                    'min_stock' => '5',
                    'reorder_qty' => '0',
                    'is_favorite' => $i % 97 === 0,
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];

                $variants[] = [
                    'id' => $id, 'product_id' => $id, 'sku' => $sku,
                    'is_default' => true, 'is_active' => true,
                    'created_at' => $now, 'updated_at' => $now,
                ];

                $units[] = [
                    'id' => $id, 'product_id' => $id, 'unit_id' => $pieceUnitId, 'factor' => '1',
                    'is_base' => true, 'is_default_sale' => true, 'is_default_purchase' => true,
                    'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
                ];

                // Barcodes kept as TEXT, with leading zeros, as real EAN-13.
                $barcodes[] = [
                    'code' => '0'.str_pad((string) (6000000000 + $i), 12, '0', STR_PAD_LEFT),
                    'product_id' => $id, 'variant_id' => $id, 'product_unit_id' => $id,
                    'type' => 'standard', 'is_primary' => true,
                    'created_at' => $now, 'updated_at' => $now,
                ];

                $price = number_format(5 + ($i % 500) + (($i % 4) * 0.25), 4, '.', '');
                $prices[] = [
                    'price_list_id' => $priceListId, 'variant_id' => $id, 'product_unit_id' => $id,
                    'price' => $price, 'min_qty' => '0',
                    'created_at' => $now, 'updated_at' => $now,
                ];

                $balances[] = [
                    'warehouse_id' => $warehouseId, 'variant_id' => $id, 'product_id' => $id,
                    'qty_on_hand' => '100000.0000', 'qty_reserved' => '0',
                    'avg_cost' => number_format(((float) $price) * 0.65, 6, '.', ''),
                    'last_movement_at' => $now, 'created_at' => $now, 'updated_at' => $now,
                ];
            }

            DB::table('products')->insert($products);
            DB::table('product_variants')->insert($variants);
            DB::table('product_units')->insert($units);
            DB::table('barcodes')->insert($barcodes);
            DB::table('prices')->insert($prices);
            DB::table('stock_balances')->insert($balances);

            $bar->advance(count($chunk));
        }

        // Keep the sequences ahead of the manually assigned ids.
        foreach (['products', 'product_variants', 'product_units'] as $table) {
            DB::statement("SELECT setval(pg_get_serial_sequence('$table','id'), (SELECT MAX(id) FROM $table))");
        }

        $bar->finish();
        $this->newLine();
    }

    /** @return list<int> */
    private function seedCategories(): array
    {
        $names = ['بقالة', 'منظفات', 'عناية شخصية', 'كهربائيات', 'أدوات منزلية', 'مكتبية', 'ملابس', 'عطور'];
        $ids = [];

        foreach ($names as $sort => $name) {
            $ids[] = (int) DB::table('categories')->insertGetId([
                'name' => $name, 'sort_order' => $sort, 'is_active' => true,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $ids;
    }

    private function seedSales(int $count, int $linesPer, int $branchId, int $warehouseId, int $terminalId, int $userId, int $priceListId): void
    {
        $variantIds = DB::table('product_variants')->orderBy('id')->pluck('id')->all();
        $variantCount = count($variantIds);
        if ($variantCount === 0) {
            return;
        }

        $cashMethod = DB::table('payment_methods')->where('code', 'cash')->first();
        $cardMethod = DB::table('payment_methods')->where('code', 'card')->first();
        $startNumber = (int) DB::table('sales')->count() + 1;
        $saleId = (int) (DB::table('sales')->max('id') ?? 0);
        $lineId = (int) (DB::table('sale_lines')->max('id') ?? 0);

        $bar = $this->output->createProgressBar($count);

        foreach (array_chunk(range(1, $count), 1000) as $chunk) {
            $sales = [];
            $lines = [];
            $payments = [];

            foreach ($chunk as $n) {
                $saleId++;
                // Spread the history over the last 12 months.
                $soldAt = now()->subMinutes(random_int(0, 525_600));
                $businessDate = $soldAt->toDateString();

                $subtotal = 0.0;
                $cost = 0.0;
                $saleLines = [];

                for ($l = 0; $l < $linesPer; $l++) {
                    $variantId = $variantIds[($n * 7 + $l * 13) % $variantCount];
                    $qty = random_int(1, 4);
                    $unitPrice = 5 + (($variantId % 500));
                    $lineTotal = $qty * $unitPrice;
                    $lineCost = $lineTotal * 0.65;

                    $lineId++;
                    $saleLines[] = [
                        'id' => $lineId,
                        'sale_id' => $saleId,
                        'line_no' => $l + 1,
                        'product_id' => $variantId,
                        'variant_id' => $variantId,
                        'product_unit_id' => $variantId,
                        'product_name' => 'صنف '.$variantId,
                        'sku' => 'PERF-'.$variantId,
                        'unit_name' => 'قطعة',
                        'unit_factor' => '1',
                        'qty' => number_format($qty, 4, '.', ''),
                        'qty_base' => number_format($qty, 4, '.', ''),
                        'unit_price' => number_format($unitPrice, 4, '.', ''),
                        'gross_amount' => number_format($lineTotal, 4, '.', ''),
                        'line_discount_amount' => '0',
                        'line_discount_percent' => '0',
                        'invoice_discount_share' => '0',
                        'net_amount' => number_format($lineTotal, 4, '.', ''),
                        'tax_rate' => '0',
                        'tax_amount' => '0',
                        'tax_inclusive' => false,
                        'total_amount' => number_format($lineTotal, 4, '.', ''),
                        'unit_cost' => number_format($unitPrice * 0.65, 6, '.', ''),
                        'cost_amount' => number_format($lineCost, 4, '.', ''),
                        'returned_qty_base' => '0',
                        'price_overridden' => false,
                        'is_bundle_component' => false,
                        'created_at' => $soldAt,
                        'updated_at' => $soldAt,
                    ];

                    $subtotal += $lineTotal;
                    $cost += $lineCost;
                }

                $lines = array_merge($lines, $saleLines);
                $useCard = $n % 3 === 0;

                $sales[] = [
                    'id' => $saleId,
                    'uuid' => (string) Str::uuid7(),
                    'number' => 'INV-PERF-'.str_pad((string) ($startNumber + $n), 8, '0', STR_PAD_LEFT),
                    'branch_id' => $branchId,
                    'warehouse_id' => $warehouseId,
                    'terminal_id' => $terminalId,
                    'shift_id' => null,
                    'user_id' => $userId,
                    'price_list_id' => $priceListId,
                    'status' => 'completed',
                    'sold_at' => $soldAt,
                    'business_date' => $businessDate,
                    'subtotal' => number_format($subtotal, 4, '.', ''),
                    'line_discount_total' => '0',
                    'invoice_discount_total' => '0',
                    'discount_total' => '0',
                    'taxable_amount' => number_format($subtotal, 4, '.', ''),
                    'tax_total' => '0',
                    'rounding_adjustment' => '0',
                    'grand_total' => number_format($subtotal, 4, '.', ''),
                    'paid_total' => number_format($subtotal, 4, '.', ''),
                    'change_total' => '0',
                    'due_total' => '0',
                    'refunded_total' => '0',
                    'cost_total' => number_format($cost, 4, '.', ''),
                    'profit_total' => number_format($subtotal - $cost, 4, '.', ''),
                    'invoice_discount_value' => '0',
                    'is_credit' => false,
                    'tax_inclusive' => false,
                    'origin' => 'online',
                    'print_count' => 0,
                    'version' => 1,
                    'created_at' => $soldAt,
                    'updated_at' => $soldAt,
                ];

                $payments[] = [
                    'sale_id' => $saleId,
                    'payment_method_id' => $useCard ? $cardMethod->id : $cashMethod->id,
                    'method_code' => $useCard ? 'card' : 'cash',
                    'method_type' => $useCard ? 'card' : 'cash',
                    'amount' => number_format($subtotal, 4, '.', ''),
                    'tendered_amount' => $useCard ? '0' : number_format($subtotal, 4, '.', ''),
                    'change_amount' => '0',
                    'capture_mode' => 'manual',
                    'created_at' => $soldAt,
                    'updated_at' => $soldAt,
                ];
            }

            DB::table('sales')->insert($sales);
            foreach (array_chunk($lines, 2000) as $lineChunk) {
                DB::table('sale_lines')->insert($lineChunk);
            }
            DB::table('sale_payments')->insert($payments);

            $bar->advance(count($chunk));
        }

        foreach (['sales', 'sale_lines'] as $table) {
            DB::statement("SELECT setval(pg_get_serial_sequence('$table','id'), (SELECT MAX(id) FROM $table))");
        }

        $bar->finish();
        $this->newLine();
    }
}
