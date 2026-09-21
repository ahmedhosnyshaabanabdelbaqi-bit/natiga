<?php

namespace Tests\Feature\Domain;

use App\Domain\Credit\CreditService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Inventory\StockQuery;
use App\Domain\Sales\DeliveryService;
use App\Domain\Sales\InvoiceService;
use App\Domain\Sales\SalesOrderService;
use App\Domain\Sales\SalesReturnService;
use App\Domain\Support\Num;
use App\Domain\Treasury\CollectionService;
use App\Exceptions\DomainException;
use App\Models\Account;
use App\Models\CustodyAccount;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\JournalEntry;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The full order → deliver → invoice → collect → return cycle, asserting the
 * properties that make the numbers trustworthy rather than just the happy path.
 */
class SalesCycleTest extends TestCase
{
    private InventoryService $inventory;

    private StockQuery $stock;

    private SalesOrderService $orders;

    private DeliveryService $deliveries;

    private InvoiceService $invoices;

    private Customer $customer;

    private Item $item;

    private Warehouse $main;

    private User $rep;

    protected function setUp(): void
    {
        parent::setUp();

        $this->inventory = app(InventoryService::class);
        $this->stock = app(StockQuery::class);
        $this->orders = app(SalesOrderService::class);
        $this->deliveries = app(DeliveryService::class);
        $this->invoices = app(InvoiceService::class);

        $this->item = Item::where('code', 'DET-001')->firstOrFail();
        $this->main = Warehouse::where('code', 'MAIN')->firstOrFail();
        $this->rep = $this->userWithRole('rep');

        $this->customer = Customer::create([
            'company_id' => $this->company->id,
            'code' => 'C001',
            'name' => 'بقالة الاختبار',
            'kind' => 'wholesale',
            'credit_limit' => '100000.00',
            'payment_terms_days' => 30,
            'is_active' => true,
        ]);

        // Opening stock: 1000 units at 30.
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '1000', '30', 'opening_balance', 1
        ));

        $this->actingAs($this->rep);
    }

    private function orderFor(string $qty, array $header = []): \App\Models\SalesOrder
    {
        return $this->orders->create(array_merge([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], $header), [
            ['item_id' => $this->item->id, 'qty' => $qty],
        ]);
    }

    #[Test]
    public function a_draft_order_moves_no_stock_and_reserves_nothing(): void
    {
        $this->orderFor('100');

        $this->assertSame('1000.0000', $this->stock->onHand($this->main->id, $this->item->id));
        $this->assertSame('1000.0000', $this->stock->available($this->main->id, $this->item->id));
        $this->assertDatabaseCount('journal_entries', 0);
    }

    #[Test]
    public function approving_an_order_reserves_stock_without_moving_it(): void
    {
        $order = $this->orders->approve($this->orderFor('100'));

        $this->assertSame('approved', $order->status);
        $this->assertSame('1000.0000', $this->stock->onHand($this->main->id, $this->item->id),
            'Approval is a promise, not a movement');
        $this->assertSame('900.0000', $this->stock->available($this->main->id, $this->item->id));
    }

    #[Test]
    public function stock_leaves_once_on_delivery_and_the_invoice_does_not_move_it_again(): void
    {
        // This is the double-deduction guarantee, asserted directly.
        $order = $this->orders->approve($this->orderFor('100'));
        $note = $this->deliveries->createFromOrder($order);

        $note = $this->deliveries->confirmDelivery($note, $note->lines->map(fn ($l) => [
            'line_id' => $l->id,
            'qty_delivered_base' => (string) $l->qty_base,
        ])->all());

        $this->assertSame('900.0000', $this->stock->onHand($this->main->id, $this->item->id));

        $invoice = $this->invoices->post($this->invoices->createFromDelivery($note));

        $this->assertFalse($invoice->moves_stock);
        $this->assertSame('900.0000', $this->stock->onHand($this->main->id, $this->item->id),
            'Invoicing a delivered note must not deduct the stock a second time');

        $movements = DB::table('stock_movements')
            ->where('item_id', $this->item->id)
            ->where('direction', 'out')
            ->count();
        $this->assertSame(1, $movements, 'Exactly one outbound movement for one shipment');
    }

    #[Test]
    public function a_direct_van_sale_moves_stock_exactly_once(): void
    {
        $invoice = $this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '50']]);

        $this->assertTrue($invoice->moves_stock, 'A direct sale owns the shipping event');
        $this->assertSame('1000.0000', $this->stock->onHand($this->main->id, $this->item->id),
            'A draft invoice has not shipped anything');

        $this->invoices->post($invoice);

        $this->assertSame('950.0000', $this->stock->onHand($this->main->id, $this->item->id));
        $this->assertSame(1, DB::table('stock_movements')
            ->where('doc_type', 'sales_invoice')->where('direction', 'out')->count());
    }

    #[Test]
    public function reposting_an_invoice_is_a_no_op(): void
    {
        $invoice = $this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '50']]);

        $first = $this->invoices->post($invoice);
        $second = $this->invoices->post($invoice->fresh());

        $this->assertSame($first->journal_entry_id, $second->journal_entry_id);
        $this->assertSame('950.0000', $this->stock->onHand($this->main->id, $this->item->id));
        $this->assertSame(1, JournalEntry::where('source_type', 'sales_invoice')
            ->where('source_id', $invoice->id)->count());
    }

    #[Test]
    public function the_invoice_posts_a_balanced_entry_with_both_revenue_and_cost(): void
    {
        $invoice = $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '100']]));

        $entry = JournalEntry::with('lines')->find($invoice->journal_entry_id);

        $this->assertTrue($entry->isBalanced());

        $byCode = fn (string $code) => $entry->lines
            ->firstWhere('account_id', Account::where('code', $code)->value('id'));

        // 100 @ 45 = 4500 net, +14% VAT = 5130 owed by the customer.
        $this->assertSame(0, Num::cmp($byCode('1200')->debit, '5130.00'), 'Customer debited gross');
        $this->assertSame(0, Num::cmp($byCode('4100')->credit, '4500.00'), 'Revenue net of tax');
        $this->assertSame(0, Num::cmp($byCode('2200')->credit, '630.00'), 'Output VAT separated');
        // Cost at the moving average of 30.
        $this->assertSame(0, Num::cmp($byCode('5100')->debit, '3000.00'), 'COGS at historical cost');
        $this->assertSame(0, Num::cmp($byCode('1310')->credit, '3000.00'), 'Inventory relieved');
    }

    #[Test]
    public function an_invoices_margin_does_not_move_when_a_later_purchase_is_dearer(): void
    {
        $invoice = $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '100']]));

        $profitBefore = $invoice->grossProfit();

        // A much more expensive restock arrives afterwards.
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '1000', '90', 'goods_receipt', 2
        ));

        $this->assertSame($profitBefore, $invoice->fresh()->grossProfit(),
            'Yesterday\'s margin must not be rewritten by today\'s purchase price');
    }

    #[Test]
    public function partial_delivery_leaves_the_rest_outstanding_and_releases_its_hold(): void
    {
        $order = $this->orders->approve($this->orderFor('100'));
        $note = $this->deliveries->createFromOrder($order);

        $this->deliveries->confirmDelivery($note, $note->lines->map(fn ($l) => [
            'line_id' => $l->id,
            'qty_delivered_base' => '60',
            'qty_refused_base' => '40',
        ])->all());

        $order = $order->fresh(['lines']);

        $this->assertSame('partial', $order->delivery_status);
        $this->assertSame('940.0000', $this->stock->onHand($this->main->id, $this->item->id));
        // The refused 40 were never shipped, so they are available again.
        $this->assertSame('940.0000', $this->stock->available($this->main->id, $this->item->id));
        $this->assertSame('60.0000', $order->lines->first()->qty_delivered_base);
    }

    #[Test]
    public function order_delivery_invoicing_and_payment_are_tracked_independently(): void
    {
        $order = $this->orders->approve($this->orderFor('100'));
        $note = $this->deliveries->createFromOrder($order);

        $this->deliveries->confirmDelivery($note, $note->lines->map(fn ($l) => [
            'line_id' => $l->id, 'qty_delivered_base' => '60', 'qty_refused_base' => '40',
        ])->all());

        $invoice = $this->invoices->post($this->invoices->createFromDelivery($note->fresh()));
        $order = $order->fresh();

        // Delivered in part, invoiced for what was delivered, not yet paid —
        // three different answers that a single status field would collapse.
        $this->assertSame('partial', $order->delivery_status);
        $this->assertSame('partial', $order->invoice_status);
        $this->assertSame('unpaid', $invoice->payment_status);
    }

    #[Test]
    public function a_credit_sale_beyond_the_limit_is_blocked_and_raises_an_approval(): void
    {
        $this->customer->update(['credit_limit' => '1000.00']);

        try {
            $this->orders->approve($this->orderFor('100'));   // ~5130 gross
            $this->fail('Expected the credit limit to block approval');
        } catch (DomainException $e) {
            $this->assertSame('credit.limit_exceeded', $e->errorCode);
        }

        $this->assertDatabaseHas('approvals', [
            'doc_type' => 'sales_order',
            'status' => 'pending',
            'reason_code' => 'credit.limit_exceeded',
        ]);
    }

    #[Test]
    public function credit_exposure_counts_approved_orders_not_only_invoices(): void
    {
        $credit = app(CreditService::class);

        $this->orders->approve($this->orderFor('100'));

        $exposure = $credit->exposure($this->customer->fresh());

        $this->assertSame(0, Num::cmp($exposure['outstanding'], '0'),
            'Nothing is invoiced yet');
        $this->assertTrue(Num::isPositive($exposure['undelivered_orders'], 2),
            'An approved order is goods promised, and counts against the limit');
        $this->assertSame(0, Num::cmp($exposure['exposure'], $exposure['undelivered_orders']));
    }

    #[Test]
    public function a_return_cannot_exceed_what_was_sold(): void
    {
        $returns = app(SalesReturnService::class);

        $invoice = $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '10']]));

        $line = $invoice->lines->first();

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/تتجاوز المتبقي/');

        $returns->create([
            'customer_id' => $this->customer->id,
            'sales_invoice_id' => $invoice->id,
            'receipt_warehouse_id' => $this->main->id,
        ], [['sales_invoice_line_id' => $line->id, 'qty' => '11']]);
    }

    #[Test]
    public function a_return_is_valued_at_the_cost_it_was_sold_at(): void
    {
        $returns = app(SalesReturnService::class);

        $invoice = $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '10']]));

        // Cost triples before the goods come back.
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '1000', '90', 'goods_receipt', 9
        ));

        $return = $returns->create([
            'customer_id' => $this->customer->id,
            'sales_invoice_id' => $invoice->id,
            'receipt_warehouse_id' => $this->main->id,
        ], [[
            'sales_invoice_line_id' => $invoice->lines->first()->id,
            'qty' => '10',
            'disposition' => 'sellable',
        ]]);

        $return = $returns->post($returns->receive($return));

        $this->assertSame(0, Num::cmp($return->cogs_amount, '300.00'),
            'Returning at 10 x 30 (sold cost), not 10 x the new average');
    }

    #[Test]
    public function a_return_defaults_to_inspection_rather_than_straight_back_on_sale(): void
    {
        $returns = app(SalesReturnService::class);
        $inspection = Warehouse::where('code', 'INSPECT')->firstOrFail();

        $invoice = $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '10']]));

        $return = $returns->create([
            'customer_id' => $this->customer->id,
            'sales_invoice_id' => $invoice->id,
            'receipt_warehouse_id' => $this->main->id,
        ], [['sales_invoice_line_id' => $invoice->lines->first()->id, 'qty' => '10']]);

        $returns->receive($return);

        $this->assertSame('10.0000', $this->stock->onHand($inspection->id, $this->item->id),
            'Returned goods land under inspection by default');
        $this->assertSame('990.0000', $this->stock->onHand($this->main->id, $this->item->id),
            'They are NOT added back to saleable stock automatically');
    }

    #[Test]
    public function collected_cash_sits_in_the_reps_custody_not_the_company_safe(): void
    {
        $collections = app(CollectionService::class);

        $custodyAccount = Account::create([
            'company_id' => $this->company->id,
            'code' => 'CUST-'.$this->rep->id,
            'name' => 'عهدة '.$this->rep->name,
            'type' => 'asset',
            'subtype' => 'custody',
            'parent_id' => Account::where('code', '1130')->value('id'),
            'is_postable' => true,
        ]);

        CustodyAccount::create([
            'company_id' => $this->company->id,
            'user_id' => $this->rep->id,
            'kind' => 'cash',
            'account_id' => $custodyAccount->id,
        ]);

        $invoice = $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '10']]));

        $receipt = $collections->post($collections->create([
            'customer_id' => $this->customer->id,
            'rep_id' => $this->rep->id,
            'amount' => '513.00',
            'method' => 'cash',
            'destination' => 'custody',
        ], [['sales_invoice_id' => $invoice->id, 'amount' => '513.00']]));

        $this->assertSame(0, Num::cmp($custodyAccount->balance(), '513.00'),
            'The money is with the rep');
        $this->assertSame(0, Num::cmp(Account::where('code', '1110')->first()->balance(), '0'),
            'and NOT in the company cash box until an approved deposit moves it');

        $this->invoices->refreshPaymentStatus($invoice->fresh());
        $this->assertSame('paid', $invoice->fresh()->payment_status);
    }

    #[Test]
    public function a_collection_cannot_be_allocated_beyond_an_invoices_balance(): void
    {
        $collections = app(CollectionService::class);

        $invoice = $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'qty' => '10']]));

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/يتجاوز المتبقي عليها/');

        $collections->create([
            'customer_id' => $this->customer->id,
            'amount' => '10000.00',
            'method' => 'cash',
            'destination' => 'cash_box',
            'cash_box_id' => \App\Models\CashBox::where('code', 'MAIN')->value('id'),
        ], [['sales_invoice_id' => $invoice->id, 'amount' => '10000.00']]);
    }

    #[Test]
    public function a_documents_unit_factor_is_frozen_against_later_redefinition(): void
    {
        $cartonUnit = ItemUnit::where('item_id', $this->item->id)
            ->whereRelation('unit', 'code', 'CTN')->firstOrFail();

        $order = $this->orders->create([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->main->id,
            'rep_id' => $this->rep->id,
        ], [[
            'item_id' => $this->item->id,
            'item_unit_id' => $cartonUnit->id,
            'qty' => '5',
        ]]);

        $line = $order->lines->first();
        $this->assertSame('60.0000', $line->qty_base, '5 cartons of 12 = 60 pieces');

        // The carton is later redefined as 24 pieces.
        $cartonUnit->update(['factor' => 24]);

        $this->assertSame('60.0000', $line->fresh()->qty_base,
            'An existing document keeps the factor it was written with');
        $this->assertSame(0, Num::cmp($line->fresh()->unit_factor, '12'));
    }
}
