<?php

namespace Tests\Feature\Domain;

use App\Domain\Credit\CreditService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Inventory\StockQuery;
use App\Domain\Support\Num;
use App\Domain\Sync\SyncService;
use App\Models\Account;
use App\Models\CustodyAccount;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\OfflineGrant;
use App\Models\SalesInvoice;
use App\Models\SyncConflict;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The offline contract: operations in, receipts out, nothing duplicated, and
 * nothing about money decided by "last write wins".
 */
class OfflineSyncTest extends TestCase
{
    private SyncService $sync;

    private StockQuery $stock;

    private Device $device;

    private User $rep;

    private Customer $customer;

    private Item $item;

    private Warehouse $main;

    protected function setUp(): void
    {
        parent::setUp();

        $this->sync = app(SyncService::class);
        $this->stock = app(StockQuery::class);

        $this->item = Item::where('code', 'DET-001')->firstOrFail();
        $this->main = Warehouse::where('code', 'MAIN')->firstOrFail();
        $this->rep = $this->userWithRole('rep');

        $custody = Account::create([
            'company_id' => $this->company->id, 'code' => 'CUST-'.$this->rep->id,
            'name' => 'عهدة', 'type' => 'asset', 'subtype' => 'custody',
            'parent_id' => Account::where('code', '1130')->value('id'), 'is_postable' => true,
        ]);
        CustodyAccount::create([
            'company_id' => $this->company->id, 'user_id' => $this->rep->id,
            'kind' => 'cash', 'account_id' => $custody->id,
        ]);

        $this->device = Device::create([
            'company_id' => $this->company->id,
            'user_id' => $this->rep->id,
            'device_uid' => 'DEV-TEST-1',
            'status' => 'active',
        ]);

        OfflineGrant::create([
            'company_id' => $this->company->id,
            'device_id' => $this->device->id,
            'rep_id' => $this->rep->id,
            'valid_from' => now()->subDay(),
            'valid_to' => now()->addDay(),
            'max_doc_value' => '50000.00',
            'allow_credit_sales' => true,
            'status' => 'active',
        ]);

        $this->customer = Customer::create([
            'company_id' => $this->company->id, 'code' => 'C500', 'name' => 'عميل ميداني',
            'kind' => 'retail', 'credit_limit' => '10000', 'is_active' => true,
        ]);

        DB::transaction(fn () => app(InventoryService::class)->receive(
            $this->main->id, $this->item->id, '500', '30', 'opening_balance', 1
        ));

        $this->actingAs($this->rep);
    }

    private function baseUnitId(): int
    {
        return ItemUnit::where('item_id', $this->item->id)->where('is_base', true)->value('id');
    }

    private function invoiceOperation(string $key, string $qty = '10', array $overrides = []): array
    {
        return array_merge([
            'id' => (string) Str::uuid(),
            'idempotency_key' => $key,
            'client_seq' => 1,
            'op_type' => 'sales_invoice.create',
            'client_created_at' => now()->toIso8601String(),
            'payload' => [
                'header' => [
                    'customer_id' => $this->customer->id,
                    'warehouse_id' => $this->main->id,
                    'rep_id' => $this->rep->id,
                    'payment_type' => 'cash',
                    'field_no' => 'F-001',
                ],
                'lines' => [[
                    'item_id' => $this->item->id,
                    'item_unit_id' => $this->baseUnitId(),
                    'qty' => $qty,
                ]],
            ],
        ], $overrides);
    }

    #[Test]
    public function an_operation_creates_the_document_and_returns_a_receipt(): void
    {
        $receipts = $this->sync->push($this->device, [$this->invoiceOperation('inv-1')]);

        $this->assertSame('applied', $receipts[0]['status']);
        $this->assertSame('sales_invoice', $receipts[0]['doc_type']);
        $this->assertNotNull($receipts[0]['doc_code']);
        $this->assertSame('490.0000', $this->stock->onHand($this->main->id, $this->item->id));
    }

    #[Test]
    public function replaying_the_same_operation_does_not_create_a_second_document(): void
    {
        // The core offline guarantee: a lost response must be safe to retry.
        $first = $this->sync->push($this->device, [$this->invoiceOperation('inv-1')]);
        $second = $this->sync->push($this->device, [$this->invoiceOperation('inv-1')]);
        $third = $this->sync->push($this->device, [$this->invoiceOperation('inv-1')]);

        $this->assertSame($first[0]['doc_id'], $second[0]['doc_id']);
        $this->assertSame($first[0]['doc_id'], $third[0]['doc_id']);
        $this->assertSame(1, SalesInvoice::count(), 'One operation, one invoice');
        $this->assertSame('490.0000', $this->stock->onHand($this->main->id, $this->item->id),
            'Stock is deducted once, not three times');
        $this->assertSame(1, DB::table('journal_entries')
            ->where('source_type', 'sales_invoice')->count());
    }

    #[Test]
    public function a_replay_with_a_different_key_is_a_different_document(): void
    {
        $this->sync->push($this->device, [$this->invoiceOperation('inv-1')]);
        $this->sync->push($this->device, [$this->invoiceOperation('inv-2')]);

        $this->assertSame(2, SalesInvoice::count());
        $this->assertSame('480.0000', $this->stock->onHand($this->main->id, $this->item->id));
    }

    #[Test]
    public function the_field_reference_is_kept_distinct_from_the_server_document_number(): void
    {
        $receipts = $this->sync->push($this->device, [$this->invoiceOperation('inv-1')]);
        $invoice = SalesInvoice::find($receipts[0]['doc_id']);

        $this->assertSame('F-001', $invoice->field_no);
        $this->assertNotSame('F-001', $invoice->code,
            'The device reference is not the company document number');
        $this->assertSame('not_submitted', $invoice->e_invoice_status,
            'and it is certainly not an accepted tax document');
    }

    #[Test]
    public function operations_are_applied_in_the_devices_own_sequence(): void
    {
        // Delivered out of order by an unreliable network.
        $receipts = $this->sync->push($this->device, [
            $this->invoiceOperation('inv-b', '5', ['client_seq' => 2]),
            $this->invoiceOperation('inv-a', '5', ['client_seq' => 1]),
        ]);

        $this->assertSame('applied', $receipts[0]['status']);
        $this->assertSame('applied', $receipts[1]['status']);

        $order = DB::table('sync_operations')->orderBy('processed_at')->pluck('idempotency_key');
        $this->assertSame('inv-a', $order->first(), 'Client sequence wins over arrival order');
    }

    #[Test]
    public function an_operation_waiting_on_a_prerequisite_is_deferred_not_rejected(): void
    {
        $missing = (string) Str::uuid();

        $receipts = $this->sync->push($this->device, [
            $this->invoiceOperation('inv-dep', '5', ['depends_on' => $missing]),
        ]);

        $this->assertSame('pending', $receipts[0]['status']);
        $this->assertSame('sync.waiting_dependency', $receipts[0]['error_code']);
        $this->assertSame(0, SalesInvoice::count());
    }

    #[Test]
    public function a_stock_shortage_becomes_a_conflict_for_review_not_a_silent_drop(): void
    {
        $receipts = $this->sync->push($this->device, [
            $this->invoiceOperation('inv-big', '9999'),
        ]);

        $this->assertSame('conflict', $receipts[0]['status']);
        $this->assertSame('stock.insufficient', $receipts[0]['error_code']);

        $conflict = SyncConflict::first();
        $this->assertNotNull($conflict, 'A human must be given something to look at');
        $this->assertSame('open', $conflict->status);
        $this->assertArrayHasKey('payload', $conflict->details,
            'The original field operation is preserved, not discarded');
    }

    #[Test]
    public function a_device_without_a_live_grant_cannot_create_documents(): void
    {
        OfflineGrant::query()->update(['status' => 'revoked']);

        $receipts = $this->sync->push($this->device, [$this->invoiceOperation('inv-1')]);

        $this->assertSame('rejected', $receipts[0]['status']);
        $this->assertSame('sync.no_offline_grant', $receipts[0]['error_code']);
        $this->assertSame(0, SalesInvoice::count());
    }

    #[Test]
    public function a_blocked_device_is_refused_on_its_next_connection(): void
    {
        $this->device->update(['status' => 'blocked']);

        $receipts = $this->sync->push($this->device, [$this->invoiceOperation('inv-1')]);

        $this->assertSame('rejected', $receipts[0]['status']);
        $this->assertSame('sync.device_blocked', $receipts[0]['error_code']);
    }

    #[Test]
    public function a_field_collection_that_cannot_be_allocated_is_still_kept(): void
    {
        // The rep took real money from a real customer. It must not evaporate
        // because the invoice was settled centrally in the meantime.
        $receipts = $this->sync->push($this->device, [[
            'id' => (string) Str::uuid(),
            'idempotency_key' => 'rcpt-1',
            'client_seq' => 1,
            'op_type' => 'receipt.create',
            'client_created_at' => now()->toIso8601String(),
            'payload' => [
                'header' => [
                    'customer_id' => $this->customer->id,
                    'rep_id' => $this->rep->id,
                    'amount' => '750.00',
                    'method' => 'cash',
                    'destination' => 'custody',
                    'field_no' => 'R-009',
                ],
                'allocations' => [
                    ['sales_invoice_id' => 999999, 'amount' => '750.00'],
                ],
            ],
        ]]);

        $this->assertSame('applied', $receipts[0]['status'],
            'receipt failed: '.json_encode($receipts[0]));

        $receipt = \App\Models\Receipt::find($receipts[0]['doc_id']);
        $this->assertSame('posted', $receipt->status);
        $this->assertSame(0, Num::cmp($receipt->amount, '750.00'), 'The money is recorded');
        $this->assertSame(0, Num::cmp($receipt->allocated_amount, '0'),
            'and held unallocated rather than forced onto a wrong invoice');
    }

    #[Test]
    public function an_offline_credit_sale_spends_a_reserved_slice_of_the_limit(): void
    {
        $credit = app(CreditService::class);

        $this->customer->update(['credit_limit' => '400.00']);

        // The office carves out headroom for this device before the rep goes out.
        $credit->reserveForDevice($this->customer, $this->device->id, $this->rep->id,
            '400.00', now()->addDay());

        // That slice is now invisible to everyone else.
        $exposure = $credit->exposure($this->customer->fresh());
        $this->assertSame(0, Num::cmp($exposure['offline_reserved'], '400.00'));
        $this->assertSame(0, Num::cmp($exposure['headroom'], '0'),
            'No other channel can spend the same headroom');

        $receipts = $this->sync->push($this->device, [
            $this->invoiceOperation('inv-credit', '7', [
                'payload' => [
                    'header' => [
                        'customer_id' => $this->customer->id,
                        'warehouse_id' => $this->main->id,
                        'rep_id' => $this->rep->id,
                        'payment_type' => 'credit',
                    ],
                    'lines' => [[
                        'item_id' => $this->item->id,
                        'item_unit_id' => $this->baseUnitId(),
                        'qty' => '7',
                    ]],
                ],
            ]),
        ]);

        // 7 x 45 = 315 + 14% VAT = 359.10, within the 400 slice.
        $this->assertSame('applied', $receipts[0]['status']);

        $reservation = \App\Models\CreditReservation::first();
        $this->assertTrue(Num::isPositive($reservation->consumed_amount, 2),
            'The slice is drawn down by the sale it backed');
    }

    #[Test]
    public function an_offline_credit_sale_beyond_the_reserved_slice_becomes_a_conflict(): void
    {
        $this->customer->update(['credit_limit' => '100.00']);

        $receipts = $this->sync->push($this->device, [
            $this->invoiceOperation('inv-over', '50', [
                'payload' => [
                    'header' => [
                        'customer_id' => $this->customer->id,
                        'warehouse_id' => $this->main->id,
                        'rep_id' => $this->rep->id,
                        'payment_type' => 'credit',
                    ],
                    'lines' => [[
                        'item_id' => $this->item->id,
                        'item_unit_id' => $this->baseUnitId(),
                        'qty' => '50',
                    ]],
                ],
            ]),
        ]);

        $this->assertSame('conflict', $receipts[0]['status']);
        $this->assertSame('credit.limit_exceeded', $receipts[0]['error_code']);
        $this->assertSame(1, SyncConflict::where('status', 'open')->count());
    }

    #[Test]
    public function one_failing_operation_does_not_roll_back_the_ones_that_succeeded(): void
    {
        $receipts = $this->sync->push($this->device, [
            $this->invoiceOperation('ok-1', '5', ['client_seq' => 1]),
            $this->invoiceOperation('too-big', '99999', ['client_seq' => 2]),
            $this->invoiceOperation('ok-2', '5', ['client_seq' => 3]),
        ]);

        $this->assertSame('applied', $receipts[0]['status']);
        $this->assertSame('conflict', $receipts[1]['status']);
        $this->assertSame('applied', $receipts[2]['status']);

        $this->assertSame(2, SalesInvoice::count(),
            'A rep with twenty good sales and one problem keeps the twenty');
        $this->assertSame('490.0000', $this->stock->onHand($this->main->id, $this->item->id));
    }
}
