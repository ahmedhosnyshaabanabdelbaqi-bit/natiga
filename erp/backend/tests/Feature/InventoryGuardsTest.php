<?php

namespace Tests\Feature;

use App\Domain\Inventory\CostEngine;
use App\Domain\Inventory\ReservationService;
use App\Domain\Inventory\StockLedger;
use App\Domain\Inventory\StockPoster;
use App\Domain\Inventory\StockTransferService;
use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Sales\SalesInvoiceService;
use App\Domain\Sales\SalesReturnService;
use App\Domain\Shared\DomainException;
use App\Models\Item;
use App\Models\ItemUom;
use App\Models\StockBatch;
use App\Support\Dec;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * ضمانات المخزون الإلزامية (البند ٢٢):
 *  - بيع متزامن لآخر كمية
 *  - منع المخزون السالب
 *  - رفض مرتجع يتجاوز المباع
 *  - تحويل مخزني جزئي
 *  - منع بيع رصيد تحت الفحص
 *  - منع بيع صنف منتهي الصلاحية
 *  - ثبات التكلفة التاريخية بعد تغيير سعر الشراء
 */
class InventoryGuardsTest extends TestCase
{
    use RefreshDatabase;

    private ScenarioBuilder $env;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = (new ScenarioBuilder)->build();
    }

    private function stockIn(string $qtyCartons, string $cartonPrice = '600'): void
    {
        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'receipt_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->cartonUom->id,
                'qty_uom' => $qtyCartons,
                'unit_price' => $cartonPrice,
            ]],
        ]);
    }

    private function sell(string $qtyPieces, ?int $warehouseId = null): mixed
    {
        return app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $warehouseId ?? $this->env->mainWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => 'credit',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => $qtyPieces,
                'unit_price' => '80',
            ]],
        ]);
    }

    public function test_negative_stock_is_blocked_by_the_database_not_the_ui(): void
    {
        $this->stockIn('1'); // 12 قطعة

        $this->expectException(DomainException::class);
        $this->sell('13');
    }

    public function test_return_exceeding_sold_quantity_is_rejected(): void
    {
        $this->stockIn('1');
        $invoice = $this->sell('5');

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/تتجاوز المتبقي القابل للإرجاع/u');

        app(SalesReturnService::class)->createReceiveAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'sales_invoice_id' => $invoice->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'return_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'sales_invoice_line_id' => $invoice->lines->first()->id,
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '6',
                'condition' => 'saleable',
            ]],
        ]);
    }

    public function test_cumulative_returns_cannot_exceed_sold_quantity(): void
    {
        $this->stockIn('1');
        $invoice = $this->sell('5');

        $makeReturn = fn (string $qty) => app(SalesReturnService::class)->createReceiveAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'sales_invoice_id' => $invoice->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'return_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'sales_invoice_line_id' => $invoice->lines->first()->id,
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => $qty,
                'condition' => 'saleable',
            ]],
        ]);

        $makeReturn('3');
        $makeReturn('2');

        $this->expectException(DomainException::class);
        $makeReturn('1'); // الإجمالي 6 > 5
    }

    public function test_partial_transfer_leaves_remainder_in_transit_and_not_in_both_warehouses(): void
    {
        $this->stockIn('2'); // 24 قطعة

        $service = app(StockTransferService::class);

        $transfer = DB::transaction(function () use ($service) {
            $t = $service->create([
                'company_id' => $this->env->company->id,
                'transfer_date' => now()->toDateString(),
                'from_warehouse_id' => $this->env->mainWarehouse->id,
                'to_warehouse_id' => $this->env->vanWarehouse->id,
                'user_id' => $this->env->user->id,
                'lines' => [[
                    'item_id' => $this->env->item->id,
                    'uom_id' => $this->env->cartonUom->id,
                    'qty_uom' => '2',
                ]],
            ]);

            $t = $service->send($t, $this->env->user->id);

            // استلام جزئي: كرتونة واحدة فقط
            return $service->receive($t, [['line_id' => $t->lines->first()->id, 'received_qty_uom' => '1']], $this->env->user->id);
        });

        $this->assertSame('partially_received', $transfer->status);
        $this->assertSame('0.000000', $this->qty($this->env->mainWarehouse->id), 'الكمية خرجت من المصدر بالكامل');
        $this->assertSame('12.000000', $this->qty($this->env->vanWarehouse->id), 'وصل 12 قطعة فقط');

        $transitId = $service->transitWarehouseId((int) $this->env->company->id);
        $inTransit = DB::table('stock_balances')
            ->where('warehouse_id', $transitId)
            ->where('status_bucket', StockLedger::BUCKET_IN_TRANSIT)
            ->sum('qty_base');

        $this->assertSame('12.000000', Dec::qty($inTransit), 'الباقي 12 قطعة ما زال بالطريق');
    }

    public function test_stock_under_inspection_cannot_be_sold(): void
    {
        // استلام إلى حالة «تحت الفحص»
        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'receipt_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->cartonUom->id,
                'qty_uom' => '1',
                'unit_price' => '600',
                'status_bucket' => StockLedger::BUCKET_INSPECTION,
            ]],
        ]);

        $this->assertSame('0.000000', $this->qty($this->env->mainWarehouse->id), 'تحت الفحص لا يُحتسب ضمن المتاح للبيع');
        $this->assertSame(
            '12.000000',
            Dec::qty(DB::table('stock_balances')->where('status_bucket', StockLedger::BUCKET_INSPECTION)->sum('qty_base')),
        );

        $this->expectException(DomainException::class);
        $this->sell('1');
    }

    public function test_expired_batch_cannot_be_sold(): void
    {
        $item = Item::create([
            'company_id' => $this->env->company->id,
            'code' => 'ITM-EXP',
            'name_ar' => 'منتج بصلاحية',
            'base_uom_id' => $this->env->pieceUom->id,
            'track_batches' => true,
            'track_expiry' => true,
            'block_sale_days_before_expiry' => 0,
        ]);

        ItemUom::create(['item_id' => $item->id, 'uom_id' => $this->env->pieceUom->id, 'factor' => '1', 'is_base' => true]);

        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'receipt_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '10',
                'unit_price' => '20',
                'batch_no' => 'B-EXPIRED',
                'expiry_date' => now()->subDay()->toDateString(),
            ]],
        ]);

        $batch = StockBatch::where('batch_no', 'B-EXPIRED')->firstOrFail();

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/البيع منها موقوف/u');

        app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => 'cash',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '1',
                'unit_price' => '40',
                'batch_id' => $batch->id,
            ]],
        ]);
    }

    public function test_historical_cost_is_frozen_and_not_recomputed_by_later_purchases(): void
    {
        $this->stockIn('1', '600');          // 12 قطعة بتكلفة 50
        $invoice = $this->sell('4');          // تكلفة 4 × 50 = 200

        $this->assertSame('200.0000', $invoice->total_cost);
        $this->assertSame('50.000000', $invoice->lines->first()->unit_cost);

        // شراء لاحق بسعر أعلى يغيّر المتوسط للمستقبل فقط
        $this->stockIn('1', '960');           // 12 قطعة بتكلفة 80
        $newAverage = app(CostEngine::class)->currentAverage((int) $this->env->company->id, (int) $this->env->item->id);

        // بعد بيع 4 قطع يتبقى 8 بقيمة 400، ثم يدخل 12 بقيمة 960
        // المتوسط الجديد = (400 + 960) / 20 = 68
        $this->assertSame('68.000000', $newAverage, 'المتوسط المتحرك يُحدَّث للمستقبل فقط');

        // الفاتورة القديمة لم تتغيّر
        $invoice->refresh();
        $this->assertSame('200.0000', $invoice->total_cost, 'تكلفة الفاتورة القديمة لا يُعاد حسابها بآخر سعر شراء');
        $this->assertSame('50.000000', $invoice->lines()->first()->unit_cost);
    }

    public function test_reservation_reduces_available_but_not_on_hand(): void
    {
        $this->stockIn('1'); // 12

        DB::transaction(function () {
            app(ReservationService::class)->reserve(
                companyId: (int) $this->env->company->id,
                itemId: (int) $this->env->item->id,
                warehouseId: (int) $this->env->mainWarehouse->id,
                qtyBase: '10',
                docType: 'sales_order',
                docId: 999,
            );
        });

        $state = app(\App\Domain\Inventory\AvailabilityService::class)
            ->forItem((int) $this->env->company->id, (int) $this->env->item->id, (int) $this->env->mainWarehouse->id);

        $this->assertSame('12.000000', $state['on_hand']);
        $this->assertSame('10.000000', $state['reserved']);
        $this->assertSame('2.000000', $state['available']);

        // حجز ثانٍ يتجاوز المتاح يُرفض
        $this->expectException(DomainException::class);
        DB::transaction(function () {
            app(ReservationService::class)->reserve(
                companyId: (int) $this->env->company->id,
                itemId: (int) $this->env->item->id,
                warehouseId: (int) $this->env->mainWarehouse->id,
                qtyBase: '3',
                docType: 'sales_order',
                docId: 1000,
            );
        });
    }

    private function qty(int $warehouseId): string
    {
        return Dec::qty(
            DB::table('stock_balances')
                ->where('company_id', $this->env->company->id)
                ->where('item_id', $this->env->item->id)
                ->where('warehouse_id', $warehouseId)
                ->where('status_bucket', StockLedger::BUCKET_AVAILABLE)
                ->sum('qty_base')
        );
    }
}
