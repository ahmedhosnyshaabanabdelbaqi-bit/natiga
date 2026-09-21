<?php

namespace Tests\Feature;

use App\Domain\Credit\CreditService;
use App\Domain\Field\CashDepositService;
use App\Domain\Field\CommissionService;
use App\Domain\Field\DayClosureService;
use App\Domain\Field\ExpenseService;
use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Sales\CustomerReceiptService;
use App\Domain\Sales\SalesInvoiceService;
use App\Domain\Sales\SalesReturnService;
use App\Domain\Shared\DomainException;
use App\Models\Account;
use App\Models\CommissionRule;
use App\Models\CommissionRuleTier;
use App\Models\FiscalPeriod;
use App\Support\Dec;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * الائتمان، إقفال اليوم والعمولات وإقفال الفترات (البنود ٩ و١٣ و١٤ و١٥ و٢٢).
 */
class CreditAndClosureTest extends TestCase
{
    use RefreshDatabase;

    private ScenarioBuilder $env;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = (new ScenarioBuilder)->build();

        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'receipt_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '200',
                'unit_price' => '50',
            ]],
        ]);
    }

    private function sell(string $qty, string $paymentType = 'credit'): mixed
    {
        return app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => $paymentType,
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => $qty,
                'unit_price' => '80',
            ]],
        ]);
    }

    public function test_credit_limit_blocks_a_credit_sale_beyond_the_limit(): void
    {
        $this->env->customer->update(['credit_limit' => '1000']);

        $this->sell('10'); // 800 — ضمن الحد

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/تجاوز الحد الائتماني/u');

        $this->sell('10'); // مجموع 1600 > 1000
    }

    public function test_cash_sale_is_not_blocked_by_credit_limit(): void
    {
        $this->env->customer->update(['credit_limit' => '100']);

        $invoice = $this->sell('10', 'cash');

        $this->assertSame('posted', $invoice->status);
    }

    public function test_blocked_customer_cannot_be_sold_to_without_override(): void
    {
        $this->env->customer->update(['is_blocked' => true, 'block_reason' => 'تأخر سداد']);

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/موقوف/u');

        $this->sell('1');
    }

    public function test_exposure_excludes_invoiced_portion_of_orders_to_avoid_double_counting(): void
    {
        $this->env->customer->update(['credit_limit' => '100000']);
        $invoice = $this->sell('10'); // 800

        $exposure = app(CreditService::class)->exposure(
            (int) $this->env->company->id,
            (int) $this->env->customer->id,
        );

        $this->assertSame('800.0000', $exposure['outstanding_invoices']);
        $this->assertSame('0.0000', $exposure['approved_uninvoiced_orders'], 'لا عدّ مزدوج للفاتورة مع الطلب');
        $this->assertSame('800.0000', $exposure['total_exposure']);

        // بعد التحصيل يقل التعرض
        app(CustomerReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'receipt_date' => now()->toDateString(),
            'payment_method' => 'cash',
            'amount' => '300',
            'user_id' => $this->env->user->id,
            'allocations' => [['sales_invoice_id' => $invoice->id, 'amount' => '300']],
        ]);

        $after = app(CreditService::class)->exposure((int) $this->env->company->id, (int) $this->env->customer->id);
        $this->assertSame('500.0000', $after['total_exposure']);
    }

    public function test_day_closure_equations_and_sync_gate(): void
    {
        $date = now()->toDateString();
        $invoice = $this->sell('10'); // 800، تكلفة 500

        $receipt = app(CustomerReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'receipt_date' => $date,
            'payment_method' => 'cash',
            'amount' => '500',
            'user_id' => $this->env->user->id,
            'allocations' => [['sales_invoice_id' => $invoice->id, 'amount' => '500']],
        ]);

        // تحويل بنكي مباشر — لا يدخل نقدية المندوب
        app(CustomerReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'receipt_date' => $date,
            'payment_method' => 'bank_transfer',
            'bank_account_id' => null,
            'amount' => '100',
            'user_id' => $this->env->user->id,
        ]);

        app(CashDepositService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'deposit_date' => $date,
            'salesman_id' => $this->env->salesman->id,
            'from_cash_box_id' => $receipt->cash_box_id,
            'to_cash_box_id' => $this->env->companyCashBox->id,
            'amount' => '400',
            'user_id' => $this->env->user->id,
        ]);

        $expenseAccount = Account::where('company_id', $this->env->company->id)->where('code', '5201')->firstOrFail();

        app(ExpenseService::class)->createApproveAndPost([
            'company_id' => $this->env->company->id,
            'expense_date' => $date,
            'account_id' => $expenseAccount->id,
            'category' => 'fuel',
            'amount' => '60',
            'paid_from' => 'salesman_custody',
            'salesman_id' => $this->env->salesman->id,
            'user_id' => $this->env->user->id,
        ]);

        $service = app(DayClosureService::class);
        $closure = $service->openOrGet((int) $this->env->company->id, (int) $this->env->salesman->id, $date);
        $closure = $service->calculate($closure);

        // معادلة النقدية: 0 + 500 − 400 − 60 = 40
        $this->assertSame('500.0000', $closure->cash_collected);
        $this->assertSame('400.0000', $closure->cash_deposited);
        $this->assertSame('60.0000', $closure->cash_expenses);
        $this->assertSame('40.0000', $closure->cash_expected, 'النقدية المتوقعة مع المندوب 40');
        $this->assertSame('40.0000', $closure->cash_actual);
        $this->assertSame('0.0000', $closure->cash_variance);
        $this->assertSame('100.0000', $closure->bank_transfers_amount, 'التحويل البنكي لا يُضاف لنقدية المندوب');

        // معادلة البضاعة: 10000 (200×50) − 500 مباعة = 9500
        $this->assertSame('500.0000', $closure->goods_sold_value);
        $this->assertSame('9500.0000', $closure->goods_actual_value);

        $closure = $service->close($closure, (int) $this->env->user->id);
        $this->assertSame('closed', $closure->status);
        $this->assertTrue((bool) $closure->sync_complete);
    }

    public function test_closing_with_pending_sync_requires_a_documented_exception(): void
    {
        $date = now()->toDateString();

        $device = \App\Models\Device::create([
            'company_id' => $this->env->company->id,
            'salesman_id' => $this->env->salesman->id,
            'device_uid' => 'DEV-PENDING',
            'is_active' => true,
        ]);

        \App\Models\SyncOperation::create([
            'company_id' => $this->env->company->id,
            'device_id' => $device->id,
            'operation_uuid' => \Illuminate\Support\Str::uuid(),
            'idempotency_key' => 'PENDING-1',
            'device_seq' => 1,
            'op_type' => 'sales_invoice',
            'payload' => [],
            'status' => 'received',
        ]);

        $service = app(DayClosureService::class);
        $closure = $service->openOrGet((int) $this->env->company->id, (int) $this->env->salesman->id, $date);

        try {
            $service->close($closure, (int) $this->env->user->id);
            $this->fail('كان يجب رفض الإقفال قبل اكتمال المزامنة');
        } catch (DomainException $e) {
            $this->assertSame('closure.sync_incomplete', $e->errorCode);
        }

        // مع استثناء موثق ينجح الإقفال ويُسجَّل الاستثناء
        $closure = $service->close($closure->fresh(), (int) $this->env->user->id, [
            'sync_exception_by' => $this->env->user->id,
            'sync_exception_reason' => 'عطل في شبكة الجهاز، تمت مراجعة العمليات يدويًا',
        ]);

        $this->assertSame('closed', $closure->status);
        $this->assertTrue((bool) $closure->sync_exception_granted);
        $this->assertNotNull($closure->sync_exception_reason);
    }

    public function test_cash_variance_creates_a_pending_report_and_is_not_auto_deducted(): void
    {
        $date = now()->toDateString();
        $service = app(DayClosureService::class);
        $closure = $service->openOrGet((int) $this->env->company->id, (int) $this->env->salesman->id, $date);

        // عجز مُعلن 50 عند العد الفعلي
        $closure = $service->close($closure, (int) $this->env->user->id, [
            'cash_actual' => '-50',
            'variance_explanation' => 'عجز أثناء العد',
        ]);

        $report = \App\Models\VarianceReport::where('day_closure_id', $closure->id)
            ->where('variance_type', 'cash')
            ->firstOrFail();

        $this->assertSame('pending', $report->status, 'المحضر يحتاج اعتمادًا');
        $this->assertSame('shortage', $report->direction);
        $this->assertSame('50.0000', Dec::money($report->amount));
        $this->assertNull($report->resolution, 'لا خصم تلقائي من راتب المندوب');
    }

    public function test_reopening_a_closed_day_requires_a_reason_and_is_audited(): void
    {
        $date = now()->toDateString();
        $service = app(DayClosureService::class);
        $closure = $service->close(
            $service->openOrGet((int) $this->env->company->id, (int) $this->env->salesman->id, $date),
            (int) $this->env->user->id,
        );

        try {
            $service->reopen($closure, (int) $this->env->user->id, '   ');
            $this->fail('إعادة الفتح بلا سبب يجب أن تُرفض');
        } catch (DomainException $e) {
            $this->assertSame('closure.reopen_reason_required', $e->errorCode);
        }

        $service->reopen($closure->fresh(), (int) $this->env->user->id, 'تصحيح سند تحصيل مفقود');

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'reopen',
            'entity_type' => 'day_closure',
            'entity_id' => $closure->id,
        ]);
    }

    public function test_posting_into_a_closed_fiscal_period_is_rejected(): void
    {
        FiscalPeriod::where('company_id', $this->env->company->id)
            ->whereDate('start_date', '<=', now()->toDateString())
            ->whereDate('end_date', '>=', now()->toDateString())
            ->update(['status' => 'closed']);

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/مقفلة ولا تقبل الترحيل/u');

        $this->sell('1');
    }

    public function test_commission_is_reversed_proportionally_after_a_return(): void
    {
        $rule = CommissionRule::create([
            'company_id' => $this->env->company->id,
            'code' => 'STD',
            'name' => 'عمولة مبيعات قياسية',
            'version' => 1,
            'role_type' => 'sales',
            'base' => 'net_sales',
            'share_pct' => '100',
            'exclude_tax' => true,
            'deduct_returns' => true,
            'valid_from' => now()->startOfYear()->toDateString(),
            'is_active' => true,
        ]);

        CommissionRuleTier::create([
            'commission_rule_id' => $rule->id,
            'from_amount' => '0',
            'to_amount' => null,
            'rate_pct' => '5',
        ]);

        $invoice = $this->sell('20'); // 1600
        $entries = app(CommissionService::class)->accrueForInvoice($invoice);

        $this->assertCount(1, $entries);
        $this->assertSame('80.0000', Dec::money($entries[0]->amount), '5% من 1600');
        $this->assertSame(1, (int) $entries[0]->rule_version, 'إصدار القاعدة محفوظ مع الحركة');

        $return = app(SalesReturnService::class)->createReceiveAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'sales_invoice_id' => $invoice->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'return_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'sales_invoice_line_id' => $invoice->lines->first()->id,
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '5',
                'condition' => 'saleable',
            ]],
        ]);

        $adjustments = app(CommissionService::class)->adjustForReturn($return);

        $this->assertCount(1, $adjustments);
        $this->assertSame('-20.0000', Dec::money($adjustments[0]->amount), 'عكس ربع العمولة لمرتجع ربع الكمية');

        $statement = app(CommissionService::class)->statement(
            (int) $this->env->company->id,
            (int) $this->env->salesman->id,
            now()->startOfMonth()->toDateString(),
            now()->endOfMonth()->toDateString(),
        );

        $this->assertSame('60.0000', $statement['totals']['earned'], 'صافي العمولة بعد التسوية 60');
        $this->assertCount(2, $statement['lines'], 'كل مبلغ يمكن تتبعه إلى مستنده');
        $this->assertSame('sales_return', $statement['lines'][1]['source_type']);
    }

    public function test_commission_recalculation_in_a_settled_period_is_blocked(): void
    {
        \App\Models\CommissionSettlement::create([
            'company_id' => $this->env->company->id,
            'settlement_no' => 'COM-001',
            'salesman_id' => $this->env->salesman->id,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'status' => 'approved',
        ]);

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/مُسوّاة ومعتمدة/u');

        app(CommissionService::class)->assertPeriodOpen((int) $this->env->company->id, now()->toDateString());
    }
}
