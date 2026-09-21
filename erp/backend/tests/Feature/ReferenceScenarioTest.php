<?php

namespace Tests\Feature;

use App\Domain\Field\CashDepositService;
use App\Domain\Field\ExpenseService;
use App\Domain\Inventory\AvailabilityService;
use App\Domain\Inventory\StockLedger;
use App\Domain\Inventory\StockTransferService;
use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Purchasing\SupplierInvoiceService;
use App\Domain\Sales\CustomerReceiptService;
use App\Domain\Sales\SalesInvoiceService;
use App\Domain\Sales\SalesReturnService;
use App\Models\Account;
use App\Support\Dec;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * السيناريو المرجعي الإلزامي (البند ٢٢) — بلا ضرائب أو خصومات.
 *
 *  1. شراء آجل 10 كراتين، الكرتونة 12 قطعة، بتكلفة 50 ج للقطعة → استلام 120 قطعة بقيمة 6000.
 *  2. تحويل 3 كراتين (36 قطعة) إلى سيارة مندوب → الرئيسي 84، السيارة 36.
 *  3. بيع من السيارة 20 قطعة بسعر 80 آجلًا.
 *  4. استلام واعتماد مرتجع قطعتين صالحتين بنفس السعر والتكلفة.
 *  5. تحصيل 1000 نقدًا عبر المندوب، إيداع 900 بخزنة الشركة، اعتماد 100 مصروفًا من عهدته.
 *
 * النتائج المتوقعة:
 *  رصيد السيارة 18 | إجمالي الشركة 102 | قيمة المخزون 5100
 *  صافي المبيعات 1440 | تكلفة المبيعات 900 | مجمل الربح 540
 *  مديونية العميل 440 | عهدة المندوب النقدية 0 | خزنة الشركة 900
 *  المورد مستحق له 6000 | صافي نتيجة هذه العمليات 440
 *  القيود متوازنة والتقارير مطابقة.
 */
class ReferenceScenarioTest extends TestCase
{
    use RefreshDatabase;

    private ScenarioBuilder $env;
    private string $date;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = (new ScenarioBuilder)->build();
        $this->date = now()->toDateString();
    }

    public function test_full_reference_scenario_matches_expected_figures(): void
    {
        $companyId = (int) $this->env->company->id;
        $userId = (int) $this->env->user->id;

        // ==========================================================
        // ١) شراء آجل: 10 كراتين × 12 قطعة بتكلفة 50 ج/قطعة
        //    سعر الكرتونة = 12 × 50 = 600 ج
        // ==========================================================
        $receipt = app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $companyId,
            'branch_id' => $this->env->branch->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'receipt_date' => $this->date,
            'user_id' => $userId,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->cartonUom->id,
                'qty_uom' => '10',
                'unit_price' => '600',    // سعر الكرتونة
            ]],
        ]);

        $this->assertSame('posted', $receipt->status);
        $this->assertSame('6000.0000', $receipt->total_cost, 'قيمة الاستلام يجب أن تكون 6000');
        $this->assertSame('120.000000', $this->qtyIn($this->env->mainWarehouse->id), 'المخزن الرئيسي 120 قطعة بعد الاستلام');
        $this->assertSame('50.000000', $this->avgCost(), 'متوسط التكلفة 50 ج للقطعة');

        // فاتورة المورد — تثبت الالتزام ولا تضيف المخزون مرة ثانية
        $supplierInvoice = app(SupplierInvoiceService::class)->createAndPost([
            'company_id' => $companyId,
            'branch_id' => $this->env->branch->id,
            'supplier_id' => $this->env->supplier->id,
            'invoice_date' => $this->date,
            'payment_type' => 'credit',
            'user_id' => $userId,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->cartonUom->id,
                'qty_uom' => '10',
                'unit_price' => '600',
                'goods_receipt_line_id' => $receipt->lines->first()->id,
            ]],
        ]);

        $this->assertSame('6000.0000', $supplierInvoice->total_amount);
        $this->assertSame(
            '120.000000',
            $this->qtyIn($this->env->mainWarehouse->id),
            'فاتورة المورد يجب ألا تضيف المخزون مرة ثانية',
        );

        // ==========================================================
        // ٢) تحويل 3 كراتين (36 قطعة) إلى سيارة المندوب
        // ==========================================================
        $transferService = app(StockTransferService::class);

        $transfer = DB::transaction(function () use ($companyId, $transferService, $userId) {
            $t = $transferService->create([
                'company_id' => $companyId,
                'branch_id' => $this->env->branch->id,
                'transfer_date' => $this->date,
                'from_warehouse_id' => $this->env->mainWarehouse->id,
                'to_warehouse_id' => $this->env->vanWarehouse->id,
                'purpose' => 'van_load',
                'user_id' => $userId,
                'lines' => [[
                    'item_id' => $this->env->item->id,
                    'uom_id' => $this->env->cartonUom->id,
                    'qty_uom' => '3',
                ]],
            ]);

            $t = $transferService->send($t, $userId);

            // الصنف لا يظهر في المخزنين في الوقت نفسه: بعد الإرسال هو «بالطريق»
            $this->assertSame('84.000000', $this->qtyIn($this->env->mainWarehouse->id), 'الرئيسي 84 بعد الإرسال');
            $this->assertSame('0.000000', $this->qtyIn($this->env->vanWarehouse->id), 'السيارة 0 قبل الاستلام');

            return $transferService->receive(
                $t,
                [['line_id' => $t->lines->first()->id, 'received_qty_uom' => '3']],
                $userId,
            );
        });

        $this->assertSame('received', $transfer->status);
        $this->assertSame('84.000000', $this->qtyIn($this->env->mainWarehouse->id), 'المخزن الرئيسي 84 قطعة');
        $this->assertSame('36.000000', $this->qtyIn($this->env->vanWarehouse->id), 'السيارة 36 قطعة');
        $this->assertSame('120.000000', $this->companyQty(), 'التحويل الداخلي لا يغيّر إجمالي الشركة');
        $this->assertSame('50.000000', $this->avgCost(), 'التحويل الداخلي لا يغيّر متوسط التكلفة');

        // ==========================================================
        // ٣) بيع من السيارة: 20 قطعة بسعر 80 آجلًا
        // ==========================================================
        $invoice = app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $companyId,
            'branch_id' => $this->env->branch->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'invoice_date' => $this->date,
            'payment_type' => 'credit',
            'channel' => 'van_sale',
            'user_id' => $userId,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '20',
                'unit_price' => '80',
            ]],
        ]);

        $this->assertSame('posted', $invoice->status);
        $this->assertSame('1600.0000', $invoice->total_amount);
        $this->assertSame('1000.0000', $invoice->total_cost, 'تكلفة المبيعات 20 × 50 = 1000');
        $this->assertSame('16.000000', $this->qtyIn($this->env->vanWarehouse->id), 'السيارة 16 بعد البيع');

        // ==========================================================
        // ٤) مرتجع قطعتين صالحتين بنفس السعر والتكلفة
        // ==========================================================
        $return = app(SalesReturnService::class)->createReceiveAndPost([
            'company_id' => $companyId,
            'branch_id' => $this->env->branch->id,
            'customer_id' => $this->env->customer->id,
            'sales_invoice_id' => $invoice->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'return_date' => $this->date,
            'settlement_type' => 'credit_note',
            'user_id' => $userId,
            'lines' => [[
                'sales_invoice_line_id' => $invoice->lines->first()->id,
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '2',
                'condition' => 'saleable',
            ]],
        ]);

        $this->assertSame('posted', $return->status);
        $this->assertSame('160.0000', $return->total_amount);
        $this->assertSame('100.0000', $return->total_cost, 'تكلفة المرتجع بتكلفة البيع الأصلية 2 × 50');

        // --- النتائج المخزنية المطلوبة ---
        $this->assertSame('18.000000', $this->qtyIn($this->env->vanWarehouse->id), 'رصيد السيارة 18 قطعة');
        $this->assertSame('102.000000', $this->companyQty(), 'إجمالي الشركة 102 قطعة');
        $this->assertSame('5100.0000', $this->inventoryValue(), 'قيمة المخزون 5100');

        // --- النتائج البيعية المطلوبة ---
        $this->assertSame('1440.0000', $this->netSales(), 'صافي المبيعات 1440');
        $this->assertSame('900.0000', $this->costOfSales(), 'تكلفة المبيعات 900');
        $this->assertSame('540.0000', $this->grossProfit(), 'مجمل الربح 540');

        // ==========================================================
        // ٥) تحصيل 1000 نقدًا عبر المندوب
        // ==========================================================
        $receiptVoucher = app(CustomerReceiptService::class)->createAndPost([
            'company_id' => $companyId,
            'branch_id' => $this->env->branch->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'receipt_date' => $this->date,
            'payment_method' => 'cash',
            'amount' => '1000',
            'user_id' => $userId,
            'allocations' => [[
                'sales_invoice_id' => $invoice->id,
                'amount' => '1000',
            ]],
        ]);

        $this->assertSame('posted', $receiptVoucher->status);
        $this->assertSame(
            '1000.0000',
            $this->accountBalance('1103'),
            'المبلغ يدخل عهدة المندوب النقدية أولًا، لا خزنة الشركة',
        );
        $this->assertSame('0.0000', $this->accountBalance('1101'), 'خزنة الشركة لم تستلم شيئًا بعد');

        // إيداع 900 بخزنة الشركة
        $deposit = app(CashDepositService::class)->createAndPost([
            'company_id' => $companyId,
            'branch_id' => $this->env->branch->id,
            'deposit_date' => $this->date,
            'salesman_id' => $this->env->salesman->id,
            'from_cash_box_id' => $receiptVoucher->cash_box_id,
            'to_cash_box_id' => $this->env->companyCashBox->id,
            'amount' => '900',
            'user_id' => $userId,
        ]);

        $this->assertSame('posted', $deposit->status);

        // اعتماد 100 مصروفًا تشغيليًا مدفوعًا من عهدة المندوب
        $expenseAccount = Account::where('company_id', $companyId)->where('code', '5206')->firstOrFail();

        $expense = app(ExpenseService::class)->createApproveAndPost([
            'company_id' => $companyId,
            'branch_id' => $this->env->branch->id,
            'expense_date' => $this->date,
            'account_id' => $expenseAccount->id,
            'category' => 'road',
            'amount' => '100',
            'paid_from' => 'salesman_custody',
            'salesman_id' => $this->env->salesman->id,
            'description' => 'مصروف طريق',
            'user_id' => $userId,
        ]);

        $this->assertSame('posted', $expense->status);

        // ==========================================================
        // النتائج النهائية
        // ==========================================================
        $this->assertSame('440.0000', $this->accountBalance('1104'), 'مديونية العميل 440');
        $this->assertSame('0.0000', $this->accountBalance('1103'), 'عهدة المندوب النقدية صفر');
        $this->assertSame('900.0000', $this->accountBalance('1101'), 'خزنة الشركة 900');
        $this->assertSame('6000.0000', $this->accountBalance('2101', 'credit'), 'المورد مستحق له 6000');
        $this->assertSame('5100.0000', $this->accountBalance('1106'), 'حساب المخزون 5100 مطابق لقيمة المخزون الفعلية');

        // صافي نتيجة هذه العمليات وحدها = 1600 − 160 − 900 − 100 = 440
        $this->assertSame('440.0000', $this->netResult(), 'صافي نتيجة العمليات 440');

        // كل القيود متوازنة
        $this->assertBooksBalanced();

        // مطابقة تقرير المخزون مع الحساب الرقابي ومع دفتر الحركات
        $this->assertInventoryReconciles();
    }

    // ============ أدوات القياس ============

    private function qtyIn(int $warehouseId): string
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

    /** إجمالي رصيد الشركة من الصنف (كل المخازن، الحالة الصالحة للبيع). */
    private function companyQty(): string
    {
        return Dec::qty(
            DB::table('stock_balances')
                ->where('company_id', $this->env->company->id)
                ->where('item_id', $this->env->item->id)
                ->where('status_bucket', StockLedger::BUCKET_AVAILABLE)
                ->sum('qty_base')
        );
    }

    private function avgCost(): string
    {
        return Dec::cost(
            DB::table('item_costs')
                ->where('company_id', $this->env->company->id)
                ->where('item_id', $this->env->item->id)
                ->value('avg_cost')
        );
    }

    private function inventoryValue(): string
    {
        return Dec::money(
            DB::table('item_costs')
                ->where('company_id', $this->env->company->id)
                ->value('total_value')
        );
    }

    private function netSales(): string
    {
        $sales = DB::table('sales_invoices')
            ->where('company_id', $this->env->company->id)
            ->where('status', '!=', 'cancelled')
            ->selectRaw('COALESCE(SUM(subtotal - line_discount_amount - header_discount_amount), 0) AS v')
            ->value('v');

        $returns = DB::table('sales_returns')
            ->where('company_id', $this->env->company->id)
            ->where('status', 'posted')
            ->selectRaw('COALESCE(SUM(subtotal - discount_amount), 0) AS v')
            ->value('v');

        return Dec::money(Dec::sub($sales, $returns));
    }

    private function costOfSales(): string
    {
        $cogs = DB::table('sales_invoices')
            ->where('company_id', $this->env->company->id)
            ->where('status', '!=', 'cancelled')
            ->sum('total_cost');

        $returnCost = DB::table('sales_returns')
            ->where('company_id', $this->env->company->id)
            ->where('status', 'posted')
            ->sum('total_cost');

        return Dec::money(Dec::sub($cogs, $returnCost));
    }

    private function grossProfit(): string
    {
        return Dec::money(Dec::sub($this->netSales(), $this->costOfSales()));
    }

    /** رصيد حساب بالكود. الاتجاه 'debit' افتراضيًا (مدين − دائن). */
    private function accountBalance(string $code, string $nature = 'debit'): string
    {
        $account = Account::where('company_id', $this->env->company->id)->where('code', $code)->firstOrFail();

        $row = DB::table('journal_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->where('journal_lines.account_id', $account->id)
            ->where('journal_entries.status', 'posted')
            ->selectRaw('COALESCE(SUM(journal_lines.debit), 0) AS d, COALESCE(SUM(journal_lines.credit), 0) AS c')
            ->first();

        return $nature === 'debit'
            ? Dec::money(Dec::sub($row->d, $row->c))
            : Dec::money(Dec::sub($row->c, $row->d));
    }

    /** صافي النتيجة من دفتر الأستاذ: الإيرادات − المصروفات. */
    private function netResult(): string
    {
        $row = DB::table('journal_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->join('accounts', 'accounts.id', '=', 'journal_lines.account_id')
            ->where('journal_entries.company_id', $this->env->company->id)
            ->where('journal_entries.status', 'posted')
            ->whereIn('accounts.type', ['revenue', 'expense'])
            ->selectRaw("COALESCE(SUM(CASE WHEN accounts.type = 'revenue' THEN journal_lines.credit - journal_lines.debit ELSE 0 END), 0) AS revenue")
            ->selectRaw("COALESCE(SUM(CASE WHEN accounts.type = 'expense' THEN journal_lines.debit - journal_lines.credit ELSE 0 END), 0) AS expense")
            ->first();

        return Dec::money(Dec::sub($row->revenue, $row->expense));
    }

    private function assertBooksBalanced(): void
    {
        $unbalanced = DB::table('journal_entries')
            ->where('company_id', $this->env->company->id)
            ->whereColumn('total_debit', '!=', 'total_credit')
            ->count();

        $this->assertSame(0, $unbalanced, 'يجب ألا يوجد قيد غير متوازن');

        $totals = DB::table('journal_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->where('journal_entries.company_id', $this->env->company->id)
            ->where('journal_entries.status', 'posted')
            ->selectRaw('COALESCE(SUM(debit), 0) AS d, COALESCE(SUM(credit), 0) AS c')
            ->first();

        $this->assertTrue(
            Dec::eq($totals->d, $totals->c),
            "ميزان المراجعة غير متوازن: مدين {$totals->d} مقابل دائن {$totals->c}",
        );
    }

    private function assertInventoryReconciles(): void
    {
        // 1) الأرصدة المجمّعة تطابق دفتر الحركات
        $fromMovements = DB::table('stock_movements')
            ->where('company_id', $this->env->company->id)
            ->selectRaw("COALESCE(SUM(CASE WHEN direction = 'in' THEN qty_base ELSE -qty_base END), 0) AS qty")
            ->value('qty');

        $fromBalances = DB::table('stock_balances')
            ->where('company_id', $this->env->company->id)
            ->sum('qty_base');

        $this->assertTrue(
            Dec::eq($fromMovements, $fromBalances),
            "أرصدة المخزون لا تطابق دفتر الحركات: الحركات {$fromMovements} مقابل الأرصدة {$fromBalances}",
        );

        // 2) قيمة المخزون تطابق الحساب الرقابي في دفتر الأستاذ
        $this->assertSame(
            $this->accountBalance('1106'),
            $this->inventoryValue(),
            'قيمة المخزون يجب أن تطابق رصيد حساب المخزون في الأستاذ',
        );
    }
}
