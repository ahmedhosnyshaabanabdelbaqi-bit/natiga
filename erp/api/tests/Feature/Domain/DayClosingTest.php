<?php

namespace Tests\Feature\Domain;

use App\Domain\Accounting\LedgerService;
use App\Domain\Field\DayClosingService;
use App\Domain\Field\VanLoadService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Inventory\StockQuery;
use App\Domain\Sales\InvoiceService;
use App\Domain\Support\Num;
use App\Domain\Treasury\CashTransferService;
use App\Domain\Treasury\CollectionService;
use App\Exceptions\DomainException;
use App\Models\Account;
use App\Models\CashBox;
use App\Models\CustodyAccount;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\SyncOperation;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Van loading and the end-of-day reconciliation: the two equations from the
 * operating spec, plus the rules around closing.
 */
class DayClosingTest extends TestCase
{
    private VanLoadService $vanLoads;

    private DayClosingService $closings;

    private InvoiceService $invoices;

    private CollectionService $collections;

    private StockQuery $stock;

    private User $rep;

    private Vehicle $vehicle;

    private Item $item;

    private Warehouse $main;

    private Warehouse $van;

    private Customer $customer;

    private Account $custodyAccount;

    protected function setUp(): void
    {
        parent::setUp();

        $this->vanLoads = app(VanLoadService::class);
        $this->closings = app(DayClosingService::class);
        $this->invoices = app(InvoiceService::class);
        $this->collections = app(CollectionService::class);
        $this->stock = app(StockQuery::class);

        $this->item = Item::where('code', 'DET-001')->firstOrFail();
        $this->main = Warehouse::where('code', 'MAIN')->firstOrFail();
        $this->vehicle = Vehicle::where('code', 'V1')->firstOrFail();
        $this->rep = $this->userWithRole('rep');

        $this->custodyAccount = Account::create([
            'company_id' => $this->company->id,
            'code' => 'CUST-'.$this->rep->id,
            'name' => 'عهدة '.$this->rep->name,
            'type' => 'asset', 'subtype' => 'custody',
            'parent_id' => Account::where('code', '1130')->value('id'),
            'is_postable' => true,
        ]);

        CustodyAccount::create([
            'company_id' => $this->company->id,
            'user_id' => $this->rep->id,
            'kind' => 'cash',
            'account_id' => $this->custodyAccount->id,
        ]);

        $this->customer = Customer::create([
            'company_id' => $this->company->id, 'code' => 'C100', 'name' => 'عميل ميداني',
            'kind' => 'retail', 'credit_limit' => '100000', 'is_active' => true,
        ]);

        DB::transaction(fn () => app(InventoryService::class)->receive(
            $this->main->id, $this->item->id, '1000', '30', 'opening_balance', 1
        ));

        $this->van = $this->vanLoads->vanWarehouseFor($this->vehicle);
        $this->actingAs($this->superAdmin());
    }

    private function baseUnitId(): int
    {
        return ItemUnit::where('item_id', $this->item->id)->where('is_base', true)->value('id');
    }

    private function loadVan(string $qty): void
    {
        $load = $this->vanLoads->create([
            'vehicle_id' => $this->vehicle->id,
            'rep_id' => $this->rep->id,
            'from_warehouse_id' => $this->main->id,
        ], [[
            'item_id' => $this->item->id,
            'item_unit_id' => $this->baseUnitId(),
            'qty' => $qty,
        ]]);

        $this->vanLoads->receive($this->vanLoads->issue($load));
    }

    #[Test]
    public function loading_a_van_is_a_transfer_not_a_sale(): void
    {
        $this->loadVan('200');

        $this->assertSame('800.0000', $this->stock->onHand($this->main->id, $this->item->id));
        $this->assertSame('200.0000', $this->stock->onHand($this->van->id, $this->item->id));

        // No revenue, no customer, no profit — the goods are still the company's.
        $this->assertSame(0, DB::table('sales_invoices')->count());
        $this->assertSame(0, Num::cmp(Account::where('code', '4100')->first()->balance(), '0'));
    }

    #[Test]
    public function van_stock_is_held_apart_from_warehouse_availability(): void
    {
        $this->loadVan('200');

        $position = $this->stock->position($this->item->id);

        $this->assertSame('1000.0000', $position['on_hand'], 'The company still owns it all');
        $this->assertSame('200.0000', $position['in_vans']);
        $this->assertSame('800.0000', $this->stock->available($this->main->id, $this->item->id),
            'The warehouse can only promise what is still in it');
    }

    #[Test]
    public function the_goods_equation_reconciles_loads_sales_and_bonus(): void
    {
        $this->loadVan('200');

        // Sell 50 and give 10 away as a bonus, from the van.
        $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->van->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'cash',
        ], [
            ['item_id' => $this->item->id, 'item_unit_id' => $this->baseUnitId(), 'qty' => '50'],
            ['item_id' => $this->item->id, 'item_unit_id' => $this->baseUnitId(), 'qty' => '10', 'is_bonus' => true],
        ]));

        $closing = $this->closings->compute(
            $this->closings->open($this->rep->id, now()->toDateString(), $this->vehicle->id)
        );

        $line = $closing->stockLines->firstWhere('item_id', $this->item->id);

        $this->assertSame('0.0000', $line->opening_qty);
        $this->assertSame('200.0000', $line->loaded_qty);
        $this->assertSame('50.0000', $line->sold_qty);
        $this->assertSame('10.0000', $line->bonus_qty, 'Free goods leave stock and are counted');
        // 0 + 200 - 50 - 10 = 140
        $this->assertSame('140.0000', $line->expected_qty);
        $this->assertSame('140.0000', $this->stock->onHand($this->van->id, $this->item->id),
            'The equation agrees with the actual balance');
    }

    #[Test]
    public function the_cash_equation_excludes_cheques_and_bank_transfers(): void
    {
        $this->loadVan('200');

        $invoice = $this->invoices->post($this->invoices->createDirect([
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->van->id,
            'rep_id' => $this->rep->id,
            'payment_type' => 'credit',
        ], [['item_id' => $this->item->id, 'item_unit_id' => $this->baseUnitId(), 'qty' => '50']]));

        // Three collections, three different instruments.
        $this->collections->post($this->collections->create([
            'customer_id' => $this->customer->id, 'rep_id' => $this->rep->id,
            'amount' => '500.00', 'method' => 'cash', 'destination' => 'custody',
        ]));

        $this->collections->post($this->collections->create([
            'customer_id' => $this->customer->id, 'rep_id' => $this->rep->id,
            'amount' => '300.00', 'method' => 'cheque', 'destination' => 'custody',
            'cheque_no' => 'CHQ-1', 'cheque_due_date' => now()->addMonth()->toDateString(),
            'custody_user_id' => $this->rep->id,
        ]));

        $this->collections->post($this->collections->create([
            'customer_id' => $this->customer->id, 'rep_id' => $this->rep->id,
            'amount' => '200.00', 'method' => 'bank', 'destination' => 'bank',
            'bank_id' => \App\Models\Bank::create([
                'company_id' => $this->company->id, 'code' => 'B1', 'name' => 'بنك',
                'account_id' => Account::where('code', '1121')->value('id'),
            ])->id,
        ]));

        $closing = $this->closings->compute(
            $this->closings->open($this->rep->id, now()->toDateString(), $this->vehicle->id)
        );

        $this->assertSame('500.00', $closing->cash_receipts, 'Only physical cash counts as cash');
        $this->assertSame('300.00', $closing->cheque_collections, 'Cheques are tracked separately');
        $this->assertSame('200.00', $closing->bank_collections, 'Bank transfers likewise');
        $this->assertSame('500.00', $closing->expected_cash,
            'A cheque in the rep\'s pocket is not money in the box');
    }

    #[Test]
    public function an_approved_deposit_reduces_the_cash_the_rep_must_hold(): void
    {
        $transfers = app(CashTransferService::class);

        $this->collections->post($this->collections->create([
            'customer_id' => $this->customer->id, 'rep_id' => $this->rep->id,
            'amount' => '1000.00', 'method' => 'cash', 'destination' => 'custody',
        ]));

        $transfers->post($transfers->create([
            'from_kind' => 'custody', 'from_id' => $this->rep->id,
            'to_kind' => 'cash_box', 'to_id' => CashBox::where('code', 'MAIN')->value('id'),
            'amount' => '600.00',
        ]));

        $closing = $this->closings->compute(
            $this->closings->open($this->rep->id, now()->toDateString(), $this->vehicle->id)
        );

        $this->assertSame('1000.00', $closing->cash_receipts);
        $this->assertSame('600.00', $closing->cash_deposits);
        $this->assertSame('400.00', $closing->expected_cash);

        // The deposit moved an asset; it did not create revenue a second time.
        $this->assertSame(0, Num::cmp($this->custodyAccount->balance(), '400.00'));
        $this->assertSame(0, Num::cmp(
            Account::where('code', '1110')->first()->balance(), '600.00'
        ));
    }

    #[Test]
    public function a_rep_cannot_deposit_more_cash_than_the_books_say_they_hold(): void
    {
        $transfers = app(CashTransferService::class);

        $this->collections->post($this->collections->create([
            'customer_id' => $this->customer->id, 'rep_id' => $this->rep->id,
            'amount' => '100.00', 'method' => 'cash', 'destination' => 'custody',
        ]));

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/يتجاوز رصيد العهدة/');

        $transfers->post($transfers->create([
            'from_kind' => 'custody', 'from_id' => $this->rep->id,
            'to_kind' => 'cash_box', 'to_id' => CashBox::where('code', 'MAIN')->value('id'),
            'amount' => '500.00',
        ]));
    }

    #[Test]
    public function closing_is_blocked_while_operations_are_unsynced(): void
    {
        $this->loadVan('100');

        $device = \App\Models\Device::create([
            'company_id' => $this->company->id,
            'user_id' => $this->rep->id,
            'device_uid' => 'DEV-1',
        ]);

        SyncOperation::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'company_id' => $this->company->id,
            'device_id' => $device->id,
            'user_id' => $this->rep->id,
            'idempotency_key' => 'k1',
            'client_seq' => 1,
            'op_type' => 'sales_invoice.create',
            'payload' => [],
            'status' => 'pending',
            'client_created_at' => now(),
        ]);

        $closing = $this->closings->submit(
            $this->closings->open($this->rep->id, now()->toDateString(), $this->vehicle->id),
            '0.00'
        );

        try {
            $this->closings->approve($closing);
            $this->fail('Expected the unsynced operation to block final approval');
        } catch (DomainException $e) {
            $this->assertSame('field.sync_incomplete', $e->errorCode);
        }

        // An authorised override with a written reason is the documented exception.
        $approved = $this->closings->approve($closing->fresh(), [
            'sync_override_reason' => 'انقطاع شبكة مؤكد من المشرف',
        ]);

        $this->assertSame('approved', $approved->status);
        $this->assertNotNull($approved->sync_override_by);
        $this->assertNotNull($approved->sync_override_reason);
    }

    #[Test]
    public function a_stock_variance_becomes_an_adjustment_awaiting_its_own_approval(): void
    {
        $this->loadVan('100');

        $closing = $this->closings->open($this->rep->id, now()->toDateString(), $this->vehicle->id);
        $closing = $this->closings->compute($closing);

        $line = $closing->stockLines->firstWhere('item_id', $this->item->id);

        // The rep counts 95 where 100 was expected.
        $closing = $this->closings->submit($closing, '0.00', [
            ['line_id' => $line->id, 'counted_qty' => '95'],
        ]);

        $this->assertSame('-5.0000', $closing->stockLines->first()->variance_qty);
        $this->assertSame('-150.00', $closing->stock_variance_value, '5 units at cost 30');

        $approved = $this->closings->approve($closing);

        $this->assertNotNull($approved->variance_adjustment_id);

        $adjustment = \App\Models\StockAdjustment::find($approved->variance_adjustment_id);

        $this->assertSame('pending_approval', $adjustment->status,
            'A shortage needs its own written decision, not an automatic write-off');
        $this->assertSame('count_variance', $adjustment->reason);
        $this->assertSame('100.0000', $this->stock->onHand($this->van->id, $this->item->id),
            'The balance is untouched until the adjustment is itself approved');
    }

    #[Test]
    public function reopening_a_closed_day_demands_a_reason(): void
    {
        $closing = $this->closings->submit(
            $this->closings->open($this->rep->id, now()->toDateString(), $this->vehicle->id),
            '0.00'
        );
        $closing = $this->closings->approve($closing);

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/سبب إعادة فتح/');

        $this->closings->reopen($closing, '   ');
    }

    #[Test]
    public function reopening_records_who_did_it_and_why(): void
    {
        $closing = $this->closings->approve($this->closings->submit(
            $this->closings->open($this->rep->id, now()->toDateString(), $this->vehicle->id),
            '0.00'
        ));

        $reopened = $this->closings->reopen($closing, 'ورد تحصيل متأخر من المندوب');

        $this->assertSame('reopened', $reopened->status);
        $this->assertNotNull($reopened->reopened_by);
        $this->assertNotNull($reopened->reopened_at);
        $this->assertSame('ورد تحصيل متأخر من المندوب', $reopened->reopen_reason);
    }

    #[Test]
    public function a_cash_expense_paid_from_custody_reduces_the_expected_cash(): void
    {
        $expenses = app(\App\Domain\Treasury\ExpenseService::class);

        $this->collections->post($this->collections->create([
            'customer_id' => $this->customer->id, 'rep_id' => $this->rep->id,
            'amount' => '1000.00', 'method' => 'cash', 'destination' => 'custody',
        ]));

        $expenses->post($expenses->create([
            'account_id' => Account::where('code', '5310')->value('id'),
            'amount' => '150.00',
            'paid_from_kind' => 'custody',
            'paid_from_id' => $this->rep->id,
            'description' => 'بنزين',
        ]));

        $closing = $this->closings->compute(
            $this->closings->open($this->rep->id, now()->toDateString(), $this->vehicle->id)
        );

        $this->assertSame('150.00', $closing->cash_expenses);
        $this->assertSame('850.00', $closing->expected_cash);
        $this->assertSame(0, Num::cmp($this->custodyAccount->balance(), '850.00'),
            'The ledger and the day-close equation agree');
    }
}
