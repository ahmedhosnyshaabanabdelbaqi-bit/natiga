<?php

namespace App\Domain\Reporting;

use App\Domain\Credit\CreditService;
use App\Domain\Support\Num;
use App\Models\User;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard KPIs.
 *
 * Every figure here is computed from posted documents. Each one carries its own
 * definition and period in the payload, and each names the screen that shows the
 * documents behind it, so a number on a tile can always be opened up.
 *
 * Deliberate distinctions kept throughout (see docs/06-kpi-dictionary.md):
 *   - Sales are not collections.
 *   - Gross profit is revenue minus cost of goods sold. It is NOT net profit,
 *     and it is labelled as gross everywhere, because operating expenses are
 *     not allocated to a document.
 *   - Inventory value is at moving average cost, not at selling price.
 */
class DashboardService
{
    public function __construct(private readonly CreditService $credit) {}

    public function forUser(User $user, ?string $from = null, ?string $to = null): array
    {
        $from ??= now()->startOfMonth()->toDateString();
        $to ??= now()->toDateString();

        $role = $this->primaryRole($user);

        $payload = [
            'role' => $role,
            'period' => ['from' => $from, 'to' => $to],
            'generated_at' => now()->toIso8601String(),
            'cards' => [],
            'lists' => [],
        ];

        $payload['cards'] = match ($role) {
            'rep' => $this->repCards($user, $from, $to),
            'supervisor' => $this->supervisorCards($user, $from, $to),
            'warehouse' => $this->warehouseCards(),
            'accounting' => $this->accountingCards($from, $to),
            default => $this->managementCards($user, $from, $to),
        };

        $payload['lists'] = match ($role) {
            'rep' => ['my_overdue' => $this->overdueForRep($user->id)],
            'warehouse' => [
                'below_reorder' => $this->belowReorder(),
                'expiring' => $this->expiringSoon(),
            ],
            default => [
                'pending_approvals' => $this->pendingApprovals($user),
                'top_customers' => $this->topCustomers($from, $to),
                'sales_trend' => $this->salesTrend($from, $to),
            ],
        };

        return $payload;
    }

    // ---------------------------------------------------------------- cards

    protected function managementCards(User $user, string $from, string $to): array
    {
        $sales = $this->salesTotals($from, $to);
        $collections = $this->collectionTotals($from, $to);
        $receivables = $this->receivablesTotal();
        $inventory = $this->inventoryValue();

        return [
            $this->card('net_sales', 'صافي المبيعات', $sales['net'],
                'إجمالي الفواتير المرحّلة بعد الخصم والمرتجعات، بدون الضريبة.',
                'currency', '/sales/invoices?from='.$from.'&to='.$to),

            $this->card('gross_profit', 'مجمل الربح', $sales['gross_profit'],
                'صافي المبيعات − تكلفة البضاعة المباعة. لا يشمل المصروفات التشغيلية، وليس صافي الربح.',
                'currency', '/reports/profitability?from='.$from.'&to='.$to,
                visible: $user->hasPermission('reports.profit.view')),

            $this->card('collections', 'التحصيلات', $collections['total'],
                'سندات القبض المرحّلة خلال الفترة. مستقلة تمامًا عن المبيعات.',
                'currency', '/treasury/receipts?from='.$from.'&to='.$to),

            $this->card('receivables', 'المديونيات القائمة', $receivables['total'],
                'رصيد الفواتير المرحّلة غير المسددة حتى تاريخه، بعد المرتجعات.',
                'currency', '/reports/aging'),

            $this->card('overdue', 'المتأخرات', $receivables['overdue'],
                'الجزء من المديونيات الذي تجاوز تاريخ استحقاقه.',
                'currency', '/reports/aging?overdue=1'),

            $this->card('inventory_value', 'قيمة المخزون', $inventory,
                'الرصيد الفعلي × متوسط التكلفة المرجح المتحرك، بسعر التكلفة لا البيع.',
                'currency', '/inventory/valuation',
                visible: $user->hasPermission('inventory.cost.view')),

            $this->card('open_orders', 'أوامر بيع مفتوحة', $this->openOrdersCount(),
                'أوامر معتمدة لم يكتمل تسليمها.',
                'count', '/sales/orders?status=approved'),

            $this->card('rep_custody', 'عهد المناديب النقدية', $this->repCustodyTotal(),
                'رصيد حسابات العهدة النقدية لجميع المحصلين — نقدية لم تُورَّد للخزنة بعد.',
                'currency', '/treasury/custody',
                visible: $user->hasPermission('treasury.custody.view.all')),
        ];
    }

    protected function repCards(User $user, string $from, string $to): array
    {
        $sales = $this->salesTotals($from, $to, repId: $user->id);
        $collections = $this->collectionTotals($from, $to, repId: $user->id);

        $visits = DB::table('visits')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('rep_id', $user->id)
            ->whereBetween('business_date', [$from, $to])
            ->selectRaw('COUNT(*) AS done, COUNT(*) FILTER (WHERE is_productive) AS productive')
            ->first();

        $planned = DB::table('visit_plan_lines as vpl')
            ->join('visit_plans as vp', 'vp.id', '=', 'vpl.visit_plan_id')
            ->where('vp.rep_id', $user->id)
            ->whereBetween('vp.plan_date', [$from, $to])
            ->count();

        return [
            $this->card('my_sales', 'مبيعاتي', $sales['net'],
                'صافي فواتيري المرحّلة خلال الفترة.', 'currency', '/sales/invoices?mine=1'),

            $this->card('my_collections', 'تحصيلاتي', $collections['total'],
                'سندات القبض التي سجلتها ورُحّلت.', 'currency', '/treasury/receipts?mine=1'),

            $this->card('my_custody', 'عهدتي النقدية', $this->custodyFor($user->id),
                'النقدية المستلمة منّي ولم تُورَّد بعد للخزنة. الشيكات والتحويلات غير محسوبة هنا.',
                'currency', '/field/day-closing'),

            $this->card('visits_done', 'زيارات منفذة', (string) ($visits->done ?? 0),
                'عدد الزيارات المسجلة خلال الفترة.', 'count', '/field/visits'),

            $this->card('visits_planned', 'زيارات مخططة', (string) $planned,
                'عدد الزيارات في خطة السير.', 'count', '/field/visit-plans'),

            $this->card('productive_rate', 'نسبة الزيارات المنتجة',
                $planned > 0 ? Num::round(Num::div((string) ($visits->productive ?? 0), (string) $visits->done ?: '1', 4), 4) : '0',
                'الزيارات التي نتج عنها طلب أو تحصيل أو مرتجع ÷ الزيارات المنفذة.',
                'ratio', '/field/visits?productive=1'),
        ];
    }

    protected function supervisorCards(User $user, string $from, string $to): array
    {
        $cards = $this->managementCards($user, $from, $to);

        $cards[] = $this->card('unsynced_ops', 'عمليات لم تُزامَن', (string) DB::table('sync_operations')
            ->where('company_id', CompanyContext::idOrFail())
            ->whereIn('status', ['pending', 'conflict'])
            ->count(),
            'عمليات ميدانية لم تصل أو تعارضت مع حالة السيرفر وتحتاج مراجعة بشرية.',
            'count', '/sync/conflicts');

        $cards[] = $this->card('open_day_closings', 'إقفالات يوم معلقة', (string) DB::table('day_closings')
            ->where('company_id', CompanyContext::idOrFail())
            ->whereIn('status', ['submitted', 'reopened'])
            ->count(),
            'أيام مناديب مسلَّمة بانتظار اعتماد المشرف.',
            'count', '/field/day-closings?status=submitted');

        return $cards;
    }

    protected function warehouseCards(): array
    {
        $companyId = CompanyContext::idOrFail();

        return [
            $this->card('inventory_value', 'قيمة المخزون', $this->inventoryValue(),
                'الرصيد × متوسط التكلفة المرجح.', 'currency', '/inventory/valuation'),

            $this->card('below_reorder', 'أصناف تحت حد الطلب',
                (string) DB::table('items')->where('company_id', $companyId)
                    ->where('status', 'active')->whereNull('deleted_at')
                    ->where('reorder_point', '>', 0)->count(),
                'أصناف لها حد إعادة طلب معرّف — القائمة أدناه تعرض ما نزل تحته فعلًا.',
                'count', '/inventory/reorder'),

            $this->card('in_transit', 'بضاعة بالطريق', $this->transitValue(),
                'قيمة البضاعة الصادرة من مخزن ولم تُستلم في مخزن آخر بعد.',
                'currency', '/inventory/transfers?status=in_transit'),

            $this->card('pending_receipts', 'أذون استلام غير مرحّلة',
                (string) DB::table('goods_receipts')->where('company_id', $companyId)
                    ->where('status', 'draft')->count(),
                'استلامات مسجلة ولم تُرحّل للمخزون بعد.',
                'count', '/purchasing/receipts?status=draft'),
        ];
    }

    protected function accountingCards(string $from, string $to): array
    {
        $companyId = CompanyContext::idOrFail();

        $grni = DB::table('goods_receipt_lines as grl')
            ->join('goods_receipts as gr', 'gr.id', '=', 'grl.goods_receipt_id')
            ->where('gr.company_id', $companyId)
            ->where('gr.status', 'posted')
            ->whereRaw('grl.qty_base > grl.qty_invoiced_base')
            ->selectRaw('COALESCE(SUM((grl.qty_base - grl.qty_invoiced_base) * grl.unit_cost), 0) AS v')
            ->value('v');

        return [
            $this->card('receivables', 'ذمم مدينة', $this->receivablesTotal()['total'],
                'رصيد العملاء المدين.', 'currency', '/reports/aging'),

            $this->card('payables', 'ذمم دائنة', $this->payablesTotal(),
                'رصيد الموردين الدائن من الفواتير المرحّلة غير المسددة.',
                'currency', '/reports/supplier-aging'),

            $this->card('grni', 'بضاعة مستلمة غير مفوترة', Num::money($grni),
                'قيمة ما استُلم مخزنيًا ولم تصل فاتورته بعد. يجب أن يطابق رصيد حساب الوسيط.',
                'currency', '/purchasing/grni'),

            $this->card('uncleared_cheques', 'شيكات غير محصلة', Num::money(
                DB::table('cheques')->where('company_id', $companyId)
                    ->where('direction', 'in')
                    ->whereIn('status', ['received', 'deposited'])->sum('amount')
            ), 'شيكات واردة لم تُحصَّل بعد. ليست نقدية مؤكدة.',
                'currency', '/treasury/cheques'),

            $this->card('vat_output', 'ضريبة مبيعات الفترة', $this->vatOutput($from, $to),
                'ضريبة القيمة المضافة على الفواتير المرحّلة خلال الفترة.',
                'currency', '/reports/vat'),
        ];
    }

    // ------------------------------------------------------------ primitives

    /** @return array{net: string, gross: string, tax: string, cogs: string, gross_profit: string, returns: string} */
    public function salesTotals(string $from, string $to, ?int $repId = null): array
    {
        $companyId = CompanyContext::idOrFail();

        $invoices = DB::table('sales_invoices')
            ->where('company_id', $companyId)
            ->where('status', 'posted')
            ->whereBetween('invoice_date', [$from, $to])
            ->when($repId, fn ($q) => $q->where('rep_id', $repId))
            ->selectRaw('
                COALESCE(SUM(total), 0) AS gross,
                COALESCE(SUM(tax_amount), 0) AS tax,
                COALESCE(SUM(cogs_amount), 0) AS cogs,
                COUNT(*) AS invoice_count
            ')->first();

        $returns = DB::table('sales_returns')
            ->where('company_id', $companyId)
            ->where('status', 'posted')
            ->whereBetween('return_date', [$from, $to])
            ->when($repId, fn ($q) => $q->where('rep_id', $repId))
            ->selectRaw('COALESCE(SUM(total), 0) AS total, COALESCE(SUM(tax_amount), 0) AS tax,
                         COALESCE(SUM(cogs_amount), 0) AS cogs')
            ->first();

        // Net sales excludes tax — tax is collected for the authority, not earned.
        $netInvoices = Num::sub($invoices->gross, $invoices->tax, Num::MONEY_SCALE);
        $netReturns = Num::sub($returns->total, $returns->tax, Num::MONEY_SCALE);
        $net = Num::sub($netInvoices, $netReturns, Num::MONEY_SCALE);
        $cogs = Num::sub($invoices->cogs, $returns->cogs, Num::MONEY_SCALE);

        return [
            'gross' => Num::money($invoices->gross),
            'tax' => Num::money($invoices->tax),
            'returns' => Num::money($returns->total),
            'net' => Num::money($net),
            'cogs' => Num::money($cogs),
            'gross_profit' => Num::money(Num::sub($net, $cogs, Num::MONEY_SCALE)),
            'invoice_count' => (int) $invoices->invoice_count,
        ];
    }

    public function collectionTotals(string $from, string $to, ?int $repId = null): array
    {
        $row = DB::table('receipts')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('status', 'posted')
            ->whereBetween('receipt_date', [$from, $to])
            ->when($repId, fn ($q) => $q->where('rep_id', $repId))
            ->selectRaw("
                COALESCE(SUM(amount), 0) AS total,
                COALESCE(SUM(CASE WHEN method = 'cash' THEN amount ELSE 0 END), 0) AS cash,
                COALESCE(SUM(CASE WHEN method = 'cheque' THEN amount ELSE 0 END), 0) AS cheques,
                COALESCE(SUM(CASE WHEN method = 'bank' THEN amount ELSE 0 END), 0) AS bank
            ")->first();

        return [
            'total' => Num::money($row->total),
            'cash' => Num::money($row->cash),
            'cheques' => Num::money($row->cheques),
            'bank' => Num::money($row->bank),
        ];
    }

    protected function receivablesTotal(): array
    {
        $row = DB::table('sales_invoices')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('status', 'posted')
            ->whereRaw('total - paid_amount - returned_amount > 0')
            ->selectRaw('
                COALESCE(SUM(total - paid_amount - returned_amount), 0) AS total,
                COALESCE(SUM(CASE WHEN COALESCE(due_date, invoice_date) < CURRENT_DATE
                                  THEN total - paid_amount - returned_amount ELSE 0 END), 0) AS overdue
            ')->first();

        return ['total' => Num::money($row->total), 'overdue' => Num::money($row->overdue)];
    }

    protected function payablesTotal(): string
    {
        return Num::money(DB::table('supplier_invoices')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('status', 'posted')
            ->selectRaw('COALESCE(SUM(total - paid_amount), 0) AS v')
            ->value('v'));
    }

    protected function inventoryValue(): string
    {
        return Num::money(DB::table('item_costs')
            ->where('company_id', CompanyContext::idOrFail())
            ->sum('total_value'));
    }

    protected function transitValue(): string
    {
        return Num::money(DB::table('stock_balances as sb')
            ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
            ->leftJoin('item_costs as ic', fn ($j) => $j->on('ic.item_id', '=', 'sb.item_id')
                ->on('ic.company_id', '=', 'sb.company_id'))
            ->where('sb.company_id', CompanyContext::idOrFail())
            ->where('w.kind', 'transit')
            ->selectRaw('COALESCE(SUM(sb.qty_on_hand * COALESCE(ic.avg_cost, 0)), 0) AS v')
            ->value('v'));
    }

    protected function repCustodyTotal(): string
    {
        return Num::money(DB::table('custody_accounts as ca')
            ->join('journal_lines as jl', 'jl.account_id', '=', 'ca.account_id')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->where('ca.company_id', CompanyContext::idOrFail())
            ->where('ca.kind', 'cash')
            ->where('je.status', 'posted')
            ->selectRaw('COALESCE(SUM(jl.debit - jl.credit), 0) AS v')
            ->value('v'));
    }

    protected function custodyFor(int $userId): string
    {
        return Num::money(DB::table('custody_accounts as ca')
            ->join('journal_lines as jl', 'jl.account_id', '=', 'ca.account_id')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->where('ca.user_id', $userId)
            ->where('ca.kind', 'cash')
            ->where('je.status', 'posted')
            ->selectRaw('COALESCE(SUM(jl.debit - jl.credit), 0) AS v')
            ->value('v'));
    }

    protected function vatOutput(string $from, string $to): string
    {
        return Num::money(DB::table('sales_invoices')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('status', 'posted')
            ->whereBetween('invoice_date', [$from, $to])
            ->sum('tax_amount'));
    }

    protected function openOrdersCount(): string
    {
        return (string) DB::table('sales_orders')
            ->where('company_id', CompanyContext::idOrFail())
            ->whereIn('status', ['approved', 'partially_delivered'])
            ->where('delivery_status', '<>', 'delivered')
            ->count();
    }

    // ----------------------------------------------------------------- lists

    protected function salesTrend(string $from, string $to): array
    {
        return DB::table('sales_invoices')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('status', 'posted')
            ->whereBetween('invoice_date', [$from, $to])
            ->groupBy('invoice_date')
            ->orderBy('invoice_date')
            ->selectRaw('invoice_date AS date,
                         SUM(total - tax_amount) AS net_sales,
                         SUM(cogs_amount) AS cogs,
                         COUNT(*) AS invoices')
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    protected function topCustomers(string $from, string $to, int $limit = 10): array
    {
        return DB::table('sales_invoices as si')
            ->join('customers as c', 'c.id', '=', 'si.customer_id')
            ->where('si.company_id', CompanyContext::idOrFail())
            ->where('si.status', 'posted')
            ->whereBetween('si.invoice_date', [$from, $to])
            ->groupBy('c.id', 'c.code', 'c.name')
            ->orderByDesc('net_sales')
            ->limit($limit)
            ->selectRaw('c.id, c.code, c.name,
                         SUM(si.total - si.tax_amount) AS net_sales,
                         SUM(si.cogs_amount) AS cogs,
                         COUNT(*) AS invoices')
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    protected function overdueForRep(int $repId): array
    {
        return DB::table('sales_invoices as si')
            ->join('customers as c', 'c.id', '=', 'si.customer_id')
            ->where('si.company_id', CompanyContext::idOrFail())
            ->where('si.rep_id', $repId)
            ->where('si.status', 'posted')
            ->whereRaw('si.total - si.paid_amount - si.returned_amount > 0')
            ->whereDate('si.due_date', '<', now())
            ->orderBy('si.due_date')
            ->limit(20)
            ->selectRaw('si.id, si.code, c.name AS customer, si.due_date,
                         si.total - si.paid_amount - si.returned_amount AS outstanding,
                         CURRENT_DATE - si.due_date AS days_overdue')
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    protected function belowReorder(): array
    {
        return app(\App\Domain\Inventory\StockQuery::class)
            ->belowReorderPoint()->take(20)->map(fn ($r) => (array) $r)->all();
    }

    protected function expiringSoon(): array
    {
        return app(\App\Domain\Inventory\StockQuery::class)
            ->expiringBatches(60)->take(20)->map(fn ($r) => (array) $r)->all();
    }

    protected function pendingApprovals(User $user): array
    {
        return DB::table('approvals')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('status', 'pending')
            ->orderByDesc('created_at')
            ->limit(20)
            ->select(['id', 'doc_type', 'doc_id', 'reason_code', 'amount', 'note', 'created_at'])
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Every KPI ships with its own definition and a link to its source rows.
     * A number the user cannot open is a number they cannot trust.
     */
    protected function card(
        string $key, string $label, string $value, string $definition,
        string $format = 'currency', ?string $drilldown = null, bool $visible = true,
    ): array {
        return [
            'key' => $key,
            'label' => $label,
            'value' => $value,
            'format' => $format,
            'definition' => $definition,
            'drilldown' => $drilldown,
            'visible' => $visible,
        ];
    }

    protected function primaryRole(User $user): string
    {
        $codes = $user->roles->pluck('code');

        return match (true) {
            $codes->contains('rep') || $codes->contains('collector') => 'rep',
            $codes->contains('supervisor') => 'supervisor',
            $codes->contains('warehouse_keeper') => 'warehouse',
            $codes->contains('accountant') || $codes->contains('finance_manager') => 'accounting',
            default => 'management',
        };
    }
}
