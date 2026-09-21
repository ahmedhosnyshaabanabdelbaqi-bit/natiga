<?php

namespace Tests\Feature\Domain;

use App\Domain\Inventory\InventoryService;
use App\Domain\Inventory\StockQuery;
use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Purchasing\LandedCostService;
use App\Domain\Purchasing\SupplierInvoiceService;
use App\Domain\Sales\InvoiceService;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Account;
use App\Models\Customer;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\Supplier;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PurchasingTest extends TestCase
{
    private GoodsReceiptService $receipts;

    private SupplierInvoiceService $supplierInvoices;

    private StockQuery $stock;

    private Supplier $supplier;

    private Item $item;

    private Warehouse $main;

    protected function setUp(): void
    {
        parent::setUp();

        $this->receipts = app(GoodsReceiptService::class);
        $this->supplierInvoices = app(SupplierInvoiceService::class);
        $this->stock = app(StockQuery::class);

        $this->item = Item::where('code', 'DET-001')->firstOrFail();
        $this->main = Warehouse::where('code', 'MAIN')->firstOrFail();

        $this->supplier = Supplier::create([
            'company_id' => $this->company->id,
            'code' => 'S001',
            'name' => 'مورد الاختبار',
            'payment_terms_days' => 30,
            'is_active' => true,
        ]);

        $this->actingAs($this->superAdmin());
    }

    /**
     * Receive in BASE units.
     *
     * Stated explicitly because the service otherwise defaults to the item's
     * purchase unit — a carton of 12 for DET-001 — and "100" would mean 1,200
     * pieces. That default is correct behaviour; these tests just want to
     * reason in single units.
     */
    private function receiveStock(string $qty, string $unitCost): \App\Models\GoodsReceipt
    {
        return $this->receipts->post($this->receipts->create([
            'supplier_id' => $this->supplier->id,
            'warehouse_id' => $this->main->id,
        ], [[
            'item_id' => $this->item->id,
            'item_unit_id' => $this->baseUnitId(),
            'qty' => $qty,
            'unit_cost' => $unitCost,
        ]]));
    }

    private function baseUnitId(): int
    {
        return \App\Models\ItemUnit::where('item_id', $this->item->id)
            ->where('is_base', true)->value('id');
    }

    #[Test]
    public function receiving_adds_stock_and_credits_goods_received_not_invoiced(): void
    {
        $receipt = $this->receiveStock('100', '30');

        $this->assertSame('100.0000', $this->stock->onHand($this->main->id, $this->item->id));

        $entry = JournalEntry::with('lines')->find($receipt->journal_entry_id);
        $byCode = fn ($c) => $entry->lines->firstWhere('account_id', Account::where('code', $c)->value('id'));

        $this->assertSame(0, Num::cmp($byCode('1310')->debit, '3000.00'), 'Inventory debited');
        $this->assertSame(0, Num::cmp($byCode('2110')->credit, '3000.00'), 'GRNI credited');
        $this->assertNull($byCode('2100'), 'The supplier is NOT credited until their invoice arrives');
    }

    #[Test]
    public function the_supplier_invoice_clears_grni_and_does_not_add_stock_again(): void
    {
        // The classic double-count: receive then invoice must not stock twice.
        $receipt = $this->receiveStock('100', '30');
        $receiptLine = $receipt->lines->first();

        $invoice = $this->supplierInvoices->post($this->supplierInvoices->create([
            'supplier_id' => $this->supplier->id,
        ], [[
            'goods_receipt_line_id' => $receiptLine->id,
            'qty_base' => '100',
            'unit_price' => '30',
            'tax_rate' => '14',
        ]]));

        $this->assertSame('100.0000', $this->stock->onHand($this->main->id, $this->item->id),
            'Invoicing received goods must not add them to stock a second time');

        $entry = JournalEntry::with('lines')->find($invoice->journal_entry_id);
        $byCode = fn ($c) => $entry->lines->firstWhere('account_id', Account::where('code', $c)->value('id'));

        $this->assertSame(0, Num::cmp($byCode('2110')->debit, '3000.00'), 'GRNI cleared');
        $this->assertSame(0, Num::cmp($byCode('1400')->debit, '420.00'), 'Input VAT recoverable');
        $this->assertSame(0, Num::cmp($byCode('2100')->credit, '3420.00'), 'Supplier now owed');
        $this->assertTrue($entry->isBalanced());
    }

    #[Test]
    public function received_but_unbilled_value_is_reportable(): void
    {
        $this->receiveStock('100', '30');

        $rows = $this->supplierInvoices->grniBalance($this->supplier->id);

        $this->assertCount(1, $rows);
        $this->assertSame(0, Num::cmp($rows->first()->uninvoiced_value, '3000'));
    }

    #[Test]
    public function invoicing_more_than_was_received_is_refused(): void
    {
        $receipt = $this->receiveStock('100', '30');

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/تتجاوز المستلم غير المفوتر/');

        $this->supplierInvoices->create(['supplier_id' => $this->supplier->id], [[
            'goods_receipt_line_id' => $receipt->lines->first()->id,
            'qty_base' => '150',
            'unit_price' => '30',
        ]]);
    }

    #[Test]
    public function a_higher_invoice_price_lifts_the_average_cost_of_stock_still_held(): void
    {
        $receipt = $this->receiveStock('100', '30');

        $this->supplierInvoices->post($this->supplierInvoices->create([
            'supplier_id' => $this->supplier->id,
        ], [[
            'goods_receipt_line_id' => $receipt->lines->first()->id,
            'qty_base' => '100',
            'unit_price' => '33',    // 3 more per unit than the receipt booked
        ]]));

        // All 100 are still on hand, so the whole 300 variance goes to inventory.
        $this->assertSame(0, Num::cmp(
            app(InventoryService::class)->currentAverageCost($this->item->id), '33'
        ));
    }

    #[Test]
    public function goods_received_for_inspection_are_not_available_to_sell(): void
    {
        $inspection = Warehouse::where('code', 'INSPECT')->firstOrFail();

        $this->receipts->post($this->receipts->create([
            'supplier_id' => $this->supplier->id,
            'warehouse_id' => $this->main->id,
        ], [[
            'item_id' => $this->item->id,
            'item_unit_id' => $this->baseUnitId(),
            'qty' => '100',
            'unit_cost' => '30',
            'disposition' => 'inspection',
        ]]));

        $position = $this->stock->position($this->item->id);

        $this->assertSame('100.0000', $position['on_hand'], 'The goods exist and are valued');
        $this->assertSame('0.0000', $position['sellable'], 'but they are not sellable');
        $this->assertSame('100.0000', $this->stock->onHand($inspection->id, $this->item->id));
    }

    #[Test]
    public function an_expiry_tracked_item_cannot_be_received_without_an_expiry_date(): void
    {
        $tracked = Item::where('code', 'FOOD-001')->firstOrFail();

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/يتطلب تاريخ صلاحية/');

        $this->receipts->create([
            'supplier_id' => $this->supplier->id,
            'warehouse_id' => $this->main->id,
        ], [[
            'item_id' => $tracked->id,
            'qty' => '10',
            'unit_cost' => '60',
            'batch_code' => 'NO-EXPIRY',
        ]]);
    }

    #[Test]
    public function a_late_freight_charge_splits_between_stock_on_hand_and_goods_already_sold(): void
    {
        $landed = app(LandedCostService::class);
        $invoices = app(InvoiceService::class);

        $receipt = $this->receiveStock('100', '30');

        $customer = Customer::create([
            'company_id' => $this->company->id, 'code' => 'C900', 'name' => 'عميل',
            'kind' => 'wholesale', 'credit_limit' => '1000000', 'is_active' => true,
        ]);

        // Sell 60 of the 100 before the freight invoice turns up.
        $invoices->post($invoices->createDirect([
            'customer_id' => $customer->id,
            'warehouse_id' => $this->main->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '60']]));

        $cost = $landed->post($landed->create([
            'kind' => 'freight',
            'amount' => '1000.00',
            'allocation_method' => 'value',
        ], [$receipt->id]));

        $this->assertSame(0, Num::cmp($cost->allocated_to_inventory, '400.00'),
            '40 of 100 units remain, so 40% lifts the stock value');
        $this->assertSame(0, Num::cmp($cost->allocated_to_cogs, '600.00'),
            '60% belongs to goods already sold and is expensed now');
        $this->assertSame(0, Num::cmp(
            Num::add($cost->allocated_to_inventory, $cost->allocated_to_cogs, 2), '1000.00'
        ), 'The whole charge is accounted for');

        $entry = JournalEntry::find($cost->journal_entry_id);
        $this->assertTrue($entry->isBalanced());
    }

    #[Test]
    public function receiving_more_than_a_purchase_order_allows_is_refused(): void
    {
        $order = \App\Models\PurchaseOrder::create([
            'company_id' => $this->company->id,
            'code' => 'PO-TEST-1',
            'supplier_id' => $this->supplier->id,
            'warehouse_id' => $this->main->id,
            'order_date' => now()->toDateString(),
            'status' => 'approved',
        ]);

        $line = \App\Models\PurchaseOrderLine::create([
            'purchase_order_id' => $order->id,
            'item_id' => $this->item->id,
            'unit_factor' => 1,
            'qty_input' => 100,
            'qty_base' => 100,
            'unit_price' => 30,
        ]);

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/تتجاوز المتبقي على أمر الشراء/');

        $this->receipts->create([
            'purchase_order_id' => $order->id,
            'warehouse_id' => $this->main->id,
        ], [[
            'purchase_order_line_id' => $line->id,
            'qty' => '120',
            'unit_cost' => '30',
        ]]);
    }
}
