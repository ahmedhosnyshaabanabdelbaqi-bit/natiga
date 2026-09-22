<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Access\Models\AuditLog;
use App\Modules\Cash\Models\CashAccount;
use App\Modules\Cash\Models\Shift;
use App\Modules\Cash\Services\CashService;
use App\Modules\Cash\Services\ShiftService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\SaleService;
use App\Modules\Sync\Models\OfflineOperation;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Acceptance 16: closing a shift with a cash variance, documented and approved.
 * Also covers the expected-cash formula and the refusal to close over unsynced
 * work without a manager.
 */
class ShiftCloseTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
    }

    public function test_expected_cash_follows_the_documented_formula(): void
    {
        $shift = $this->shop->openShift($this->shop->manager, '500');
        $product = $this->shop->product('SH-1', 'صنف', price: '100.00', cost: '60.00', stock: '20');

        // Cash sale of 100, tendered 200 -> +200 then -100 change = +100 net.
        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '100.00', 'tendered_amount' => '200.00']],
        ]));

        // Card sale of 300: the drawer must NOT move.
        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '3']],
            'payments' => [['payment_method_id' => $this->shop->method('card')->id, 'amount' => '300.00', 'reference' => 'APPR-1']],
        ]));

        $account = CashAccount::query()->findOrFail($shift->cash_account_id);

        // An expense of 50 out of the drawer.
        app(CashService::class)->record($account, $shift, CashService::TYPE_EXPENSE, Money::of('50')->negated(), null, 'شاي وقهوة');
        // A 200 withdrawal to the safe.
        app(CashService::class)->record($account, $shift, CashService::TYPE_WITHDRAWAL, Money::of('200')->negated(), null, 'توريد للخزنة');

        // 500 float + 100 net sale - 50 expense - 200 withdrawal = 350
        $this->assertSame('350.00', app(CashService::class)->expectedCash($shift->fresh())->toString());
    }

    public function test_closing_with_a_shortage_records_the_variance_and_the_report(): void
    {
        $shift = $this->shop->openShift($this->shop->manager, '500');
        $product = $this->shop->product('SH-2', 'صنف', price: '50.00', cost: '30.00', stock: '10');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '2']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '100.00', 'tendered_amount' => '100.00']],
        ]));

        // Expected 600; the cashier counts 585 -> a 15 shortage.
        $closed = app(ShiftService::class)->close(
            $shift,
            $this->shop->manager,
            Money::of('585.00'),
            denominations: ['200' => 2, '100' => 1, '50' => 1, '20' => 1, '10' => 1, '5' => 1],
            notes: 'عجز غير مبرر',
        );

        $this->assertSame('closed', $closed->status);
        $this->assertSame('600.0000', $closed->expected_cash);
        $this->assertSame('585.0000', $closed->counted_cash);
        $this->assertSame('-15.0000', $closed->variance);

        $report = $closed->totals;
        $this->assertSame(1, $report['sales_count']);
        $this->assertSame('100.00', $report['sales_total']);
        $this->assertSame('600.00', $report['expected_cash']);
        $this->assertSame('-15.00', $report['variance']);
        $this->assertSame('100.00', $report['payments_by_method']['cash']['total']);

        $this->assertDatabaseHas('audit_logs', ['action' => 'shift.closed']);

        // --- the correction is approved and logged, never silent -------------
        $reconciled = app(ShiftService::class)->reconcile(
            $closed,
            $this->shop->manager,
            Money::of('-15.00'),
            'اعتماد العجز على الكاشير',
        );

        $this->assertSame('reconciled', $reconciled->status);
        $this->assertSame($this->shop->manager->id, $reconciled->approved_by);

        $audit = AuditLog::query()->where('action', 'shift.reconciled')->firstOrFail();
        $this->assertSame('اعتماد العجز على الكاشير', $audit->reason);
        $this->assertSame($this->shop->manager->id, $audit->user_id);
    }

    public function test_a_closed_shift_cannot_be_edited_silently(): void
    {
        $shift = $this->shop->openShift($this->shop->manager, '100');
        app(ShiftService::class)->close($shift, $this->shop->manager, Money::of('100.00'));

        $this->expectExceptionMessage('الوردية مغلقة بالفعل.');
        app(ShiftService::class)->close($shift->fresh(), $this->shop->manager, Money::of('999.00'));
    }

    public function test_the_audit_log_refuses_to_be_rewritten(): void
    {
        $this->shop->openShift($this->shop->manager, '100');
        $log = AuditLog::query()->where('action', 'shift.opened')->firstOrFail();

        // The database itself blocks it, not just the application.
        $this->expectExceptionMessage('audit_logs is append-only');
        DB::statement('UPDATE audit_logs SET reason = ? WHERE id = ?', ['tampered', $log->id]);
    }

    public function test_closing_over_unsynced_operations_requires_the_manager_path(): void
    {
        $shift = $this->shop->openShift($this->shop->manager, '100');

        OfflineOperation::query()->create([
            'uuid' => (string) Str::uuid7(),
            'terminal_id' => $this->shop->terminal->id,
            'type' => 'sale',
            'payload' => ['lines' => []],
            'payload_hash' => str_repeat('a', 64),
            'status' => 'pending',
        ]);

        try {
            app(ShiftService::class)->close($shift, $this->shop->manager, Money::of('100.00'));
            $this->fail('كان يجب رفض الإغلاق مع وجود عمليات غير متزامنة');
        } catch (InvalidOperationException $e) {
            $this->assertSame('unsynced_operations_pending', $e->errorCode());
        }

        // The exception path is allowed, and it RECORDS how many were pending.
        $closed = app(ShiftService::class)->close(
            $shift->fresh(),
            $this->shop->manager,
            Money::of('100.00'),
            notes: 'إغلاق استثنائي باعتماد المدير',
            allowUnsynced: true,
        );

        $this->assertSame('closed', $closed->status);
        $this->assertSame(1, $closed->unsynced_operations_at_close);
    }

    public function test_two_shifts_cannot_be_open_on_the_same_till(): void
    {
        $this->shop->openShift($this->shop->cashier, '100');

        $this->expectExceptionMessage('توجد وردية مفتوحة بالفعل على هذا الكاشير.');
        app(ShiftService::class)->open($this->shop->terminal, $this->shop->manager, Money::of('100'));
    }
}
