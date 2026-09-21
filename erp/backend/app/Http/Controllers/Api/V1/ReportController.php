<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Credit\CreditService;
use App\Domain\Reporting\DashboardService;
use App\Support\Dec;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * التقارير. كل تقرير:
 *  - يحترم صلاحيات المستخدم (التكلفة والربح لا تُرسل لغير المخوّل)،
 *  - يفرّق بين مجاميع كل النتائج ومجاميع الصفحة،
 *  - يمكن تتبع أرقامه إلى مستنداتها.
 */
class ReportController extends ApiController
{
    public function __construct(
        private readonly DashboardService $dashboard,
        private readonly CreditService $credit,
    ) {}

    private function period(Request $request): array
    {
        return [
            $request->input('from', now()->startOfMonth()->toDateString()),
            $request->input('to', now()->toDateString()),
        ];
    }

    /** مبيعات مجمّعة حسب البعد المطلوب. */
    public function sales(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $companyId = $this->companyId($request);
        $canSeeCost = $request->user()->canSeeCost();

        $groupBy = $request->input('group_by', 'day');

        $dimension = match ($groupBy) {
            'salesman' => ['sm.name', 'si.salesman_id'],
            'customer' => ['c.name', 'si.customer_id'],
            'item' => ['i.name_ar', 'sil.item_id'],
            'brand' => ['br.name', 'i.brand_id'],
            'branch' => ['b.name', 'si.branch_id'],
            default => [DB::raw('si.invoice_date::text'), 'si.invoice_date'],
        };

        $query = DB::table('sales_invoice_lines as sil')
            ->join('sales_invoices as si', 'si.id', '=', 'sil.sales_invoice_id')
            ->join('items as i', 'i.id', '=', 'sil.item_id')
            ->leftJoin('customers as c', 'c.id', '=', 'si.customer_id')
            ->leftJoin('salesmen as sm', 'sm.id', '=', 'si.salesman_id')
            ->leftJoin('brands as br', 'br.id', '=', 'i.brand_id')
            ->leftJoin('branches as b', 'b.id', '=', 'si.branch_id')
            ->where('si.company_id', $companyId)
            ->where('si.status', '!=', 'cancelled')
            ->whereBetween('si.invoice_date', [$from, $to])
            ->when($request->filled('salesman_id'), fn ($q) => $q->where('si.salesman_id', $request->input('salesman_id')))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('si.customer_id', $request->input('customer_id')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('si.branch_id', $request->input('branch_id')));

        $selects = [
            DB::raw($dimension[0] instanceof \Illuminate\Contracts\Database\Query\Expression ? $dimension[0]->getValue(DB::connection()->getQueryGrammar()).' AS label' : $dimension[0].' AS label'),
            DB::raw('SUM(sil.qty_base) AS qty'),
            DB::raw('SUM(sil.line_total) AS net_sales'),
            DB::raw('SUM(sil.discount_amount) AS discounts'),
            DB::raw('SUM(sil.tax_amount) AS tax'),
            DB::raw('COUNT(DISTINCT si.id) AS invoices'),
        ];

        if ($canSeeCost) {
            $selects[] = DB::raw('SUM(sil.total_cost) AS cost');
            $selects[] = DB::raw('SUM(sil.line_total - sil.total_cost) AS gross_profit');
        }

        $rows = $query->groupBy(is_string($dimension[0]) ? $dimension[0] : DB::raw('si.invoice_date'))
            ->orderByDesc(DB::raw('SUM(sil.line_total)'))
            ->limit(500)
            ->get($selects);

        // المرتجعات تُعرض منفصلة حتى لا يختلط البيع بالمردود
        $returns = DB::table('sales_returns')
            ->where('company_id', $companyId)
            ->where('status', 'posted')
            ->whereBetween('return_date', [$from, $to])
            ->selectRaw('COALESCE(SUM(subtotal - discount_amount), 0) AS net, COALESCE(SUM(total_cost), 0) AS cost')
            ->first();

        $netSales = $this->dashboard->netSales($companyId, $from, $to);

        $summary = [
            'net_sales' => $netSales,
            'returns_amount' => Dec::money($returns->net),
            'invoices_count' => (int) DB::table('sales_invoices')->where('company_id', $companyId)
                ->where('status', '!=', 'cancelled')->whereBetween('invoice_date', [$from, $to])->count(),
        ];

        if ($canSeeCost) {
            $cogs = $this->dashboard->costOfSales($companyId, $from, $to);
            $summary['cost_of_sales'] = $cogs;
            $summary['gross_profit'] = Dec::money(Dec::sub($netSales, $cogs));
            $summary['gross_margin_pct'] = Dec::isZero($netSales)
                ? '0.0000'
                : Dec::money(Dec::mul(Dec::div(Dec::sub($netSales, $cogs), $netSales), 100));
        }

        return $this->ok([
            'period' => ['from' => $from, 'to' => $to],
            'group_by' => $groupBy,
            'rows' => $rows,
            'summary_all_results' => $summary,
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    /** تقييم المخزون — يطابق حساب المخزون في الأستاذ. */
    public function inventoryValuation(Request $request): JsonResponse
    {
        abort_unless($request->user()->canSeeCost(), 403, 'تقييم المخزون يتطلب صلاحية مشاهدة التكلفة.');

        $companyId = $this->companyId($request);

        $rows = DB::table('item_costs as ic')
            ->join('items as i', 'i.id', '=', 'ic.item_id')
            ->where('ic.company_id', $companyId)
            ->where('ic.qty_on_hand', '<>', 0)
            ->orderByDesc('ic.total_value')
            ->get(['i.id as item_id', 'i.code', 'i.name_ar', 'ic.qty_on_hand', 'ic.avg_cost', 'ic.total_value']);

        $inventoryValue = $this->dashboard->inventoryValue($companyId);

        // المطابقة مع الحساب الرقابي
        $glBalance = DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->join('accounts as a', 'a.id', '=', 'jl.account_id')
            ->where('je.company_id', $companyId)
            ->where('je.status', 'posted')
            ->where('a.control_type', 'inventory')
            ->selectRaw('COALESCE(SUM(jl.debit - jl.credit), 0) AS v')
            ->value('v');

        return $this->ok([
            'rows' => $rows,
            'total_value' => $inventoryValue,
            'gl_inventory_balance' => Dec::money($glBalance),
            'reconciled' => Dec::eq($inventoryValue, $glBalance),
            'method' => 'المتوسط المرجح المتحرك',
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    public function aging(Request $request): JsonResponse
    {
        $rows = $this->credit->aging(
            $this->companyId($request),
            $request->input('customer_id') ? (int) $request->input('customer_id') : null,
            $request->input('as_of'),
        );

        $names = DB::table('customers')
            ->whereIn('id', array_column($rows, 'customer_id'))
            ->pluck('name', 'id');

        foreach ($rows as &$row) {
            $row['customer_name'] = $names[$row['customer_id']] ?? null;
        }

        return $this->ok([
            'as_of' => $request->input('as_of', now()->toDateString()),
            'rows' => $rows,
            'totals_all_results' => [
                'current' => Dec::money(Dec::sum(array_column($rows, 'current'))),
                'days_1_30' => Dec::money(Dec::sum(array_column($rows, 'days_1_30'))),
                'days_31_60' => Dec::money(Dec::sum(array_column($rows, 'days_31_60'))),
                'days_61_90' => Dec::money(Dec::sum(array_column($rows, 'days_61_90'))),
                'days_90_plus' => Dec::money(Dec::sum(array_column($rows, 'days_90_plus'))),
                'total' => Dec::money(Dec::sum(array_column($rows, 'total'))),
            ],
        ]);
    }

    /** ميزان المراجعة. */
    public function trialBalance(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $companyId = $this->companyId($request);

        $rows = DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->join('accounts as a', 'a.id', '=', 'jl.account_id')
            ->where('je.company_id', $companyId)
            ->where('je.status', 'posted')
            ->whereBetween('je.entry_date', [$from, $to])
            ->groupBy('a.id', 'a.code', 'a.name_ar', 'a.type')
            ->orderBy('a.code')
            ->get([
                'a.id as account_id', 'a.code', 'a.name_ar', 'a.type',
                DB::raw('SUM(jl.debit) AS total_debit'),
                DB::raw('SUM(jl.credit) AS total_credit'),
                DB::raw('SUM(jl.debit - jl.credit) AS balance'),
            ]);

        $totalDebit = Dec::sum($rows->pluck('total_debit'));
        $totalCredit = Dec::sum($rows->pluck('total_credit'));

        return $this->ok([
            'period' => ['from' => $from, 'to' => $to],
            'rows' => $rows,
            'totals' => [
                'debit' => Dec::money($totalDebit),
                'credit' => Dec::money($totalCredit),
                'balanced' => Dec::eq($totalDebit, $totalCredit),
            ],
        ]);
    }

    /** قائمة الدخل من دفتر الأستاذ. */
    public function incomeStatement(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('reports.profit.view'), 403, 'قائمة الدخل تتطلب صلاحية مشاهدة الربح.');

        [$from, $to] = $this->period($request);
        $companyId = $this->companyId($request);

        $rows = DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->join('accounts as a', 'a.id', '=', 'jl.account_id')
            ->where('je.company_id', $companyId)
            ->where('je.status', 'posted')
            ->whereIn('a.type', ['revenue', 'expense'])
            ->whereBetween('je.entry_date', [$from, $to])
            ->groupBy('a.id', 'a.code', 'a.name_ar', 'a.type', 'a.nature')
            ->orderBy('a.code')
            ->get([
                'a.code', 'a.name_ar', 'a.type', 'a.nature',
                DB::raw("SUM(CASE WHEN a.nature = 'credit' THEN jl.credit - jl.debit ELSE jl.debit - jl.credit END) AS amount"),
            ]);

        $revenue = Dec::sum($rows->where('type', 'revenue')->where('nature', 'credit')->pluck('amount'));
        $contraRevenue = Dec::sum($rows->where('type', 'revenue')->where('nature', 'debit')->pluck('amount'));
        $expenses = Dec::sum($rows->where('type', 'expense')->pluck('amount'));

        $netRevenue = Dec::sub($revenue, $contraRevenue);

        $cogs = Dec::sum($rows->where('type', 'expense')->filter(fn ($r) => str_starts_with($r->code, '51'))->pluck('amount'));
        $opex = Dec::sub($expenses, $cogs);

        return $this->ok([
            'period' => ['from' => $from, 'to' => $to],
            'lines' => $rows,
            'summary' => [
                'revenue' => Dec::money($revenue),
                'sales_returns' => Dec::money($contraRevenue),
                'net_revenue' => Dec::money($netRevenue),
                'cost_of_sales' => Dec::money($cogs),
                'gross_profit' => Dec::money(Dec::sub($netRevenue, $cogs)),
                'operating_expenses' => Dec::money($opex),
                'net_profit' => Dec::money(Dec::sub(Dec::sub($netRevenue, $cogs), $opex)),
            ],
            'caveat' => 'الأرقام تعكس ما تم ترحيله فعليًا حتى الآن؛ التكاليف غير المرحّلة لا تظهر.',
        ]);
    }

    /** أداء المناديب: المخطط مقابل المنفذ. */
    public function salesmen(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $companyId = $this->companyId($request);

        $salesmen = DB::table('salesmen')->where('company_id', $companyId)->where('is_active', true)->get(['id', 'code', 'name']);

        $rows = $salesmen->map(function ($s) use ($companyId, $from, $to, $request) {
            $planned = DB::table('visit_plan_lines as vpl')
                ->join('visit_plans as vp', 'vp.id', '=', 'vpl.visit_plan_id')
                ->where('vp.company_id', $companyId)->where('vp.salesman_id', $s->id)
                ->whereBetween('vp.plan_date', [$from, $to])->count();

            $executed = DB::table('visits')
                ->where('company_id', $companyId)->where('salesman_id', $s->id)
                ->whereBetween('visit_date', [$from, $to])->count();

            $row = [
                'salesman_id' => $s->id,
                'code' => $s->code,
                'name' => $s->name,
                'planned_visits' => $planned,
                'executed_visits' => $executed,
                'productive_visits_pct' => $this->dashboard->productiveVisitsPct($companyId, $from, $to, (int) $s->id),
                'net_sales' => $this->dashboard->netSales($companyId, $from, $to, (int) $s->id),
                'collections' => $this->dashboard->collections($companyId, $from, $to, (int) $s->id),
                'receivables' => $this->dashboard->receivables($companyId, (int) $s->id),
                'new_customers' => DB::table('customers')->where('company_id', $companyId)
                    ->where('salesman_id', $s->id)->whereBetween('created_at', [$from.' 00:00:00', $to.' 23:59:59'])->count(),
                'inactive_customers' => DB::table('customers')->where('company_id', $companyId)
                    ->where('salesman_id', $s->id)
                    ->where(fn ($q) => $q->whereNull('last_sale_date')->orWhereDate('last_sale_date', '<', now()->subDays(60)->toDateString()))
                    ->count(),
            ];

            if ($request->user()->canSeeCost()) {
                $row['cost_of_sales'] = $this->dashboard->costOfSales($companyId, $from, $to, (int) $s->id);
            }

            return $row;
        });

        return $this->ok([
            'period' => ['from' => $from, 'to' => $to],
            'rows' => $rows,
        ]);
    }

    /** الأصناف الراكدة والسريعة وتحليل ABC. */
    public function itemPerformance(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $companyId = $this->companyId($request);

        $rows = DB::table('items as i')
            ->leftJoin('sales_invoice_lines as sil', function ($j) use ($from, $to) {
                $j->on('sil.item_id', '=', 'i.id')
                    ->whereExists(function ($q) use ($from, $to) {
                        $q->select(DB::raw(1))->from('sales_invoices as si')
                            ->whereColumn('si.id', 'sil.sales_invoice_id')
                            ->whereBetween('si.invoice_date', [$from, $to])
                            ->where('si.status', '!=', 'cancelled');
                    });
            })
            ->where('i.company_id', $companyId)
            ->where('i.is_active', true)
            ->groupBy('i.id', 'i.code', 'i.name_ar')
            ->orderByDesc(DB::raw('COALESCE(SUM(sil.line_total), 0)'))
            ->get([
                'i.id as item_id', 'i.code', 'i.name_ar',
                DB::raw('COALESCE(SUM(sil.qty_base), 0) AS qty_sold'),
                DB::raw('COALESCE(SUM(sil.line_total), 0) AS net_sales'),
            ]);

        $total = Dec::sum($rows->pluck('net_sales'));
        $cumulative = Dec::of(0);

        $rows = $rows->map(function ($row) use (&$cumulative, $total) {
            $cumulative = Dec::add($cumulative, $row->net_sales);
            $pct = Dec::isZero($total) ? Dec::of(0) : Dec::mul(Dec::div($cumulative, $total), 100);

            $out = (array) $row;
            $out['cumulative_pct'] = Dec::money($pct);
            $out['abc_class'] = Dec::lte($pct, 80) ? 'A' : (Dec::lte($pct, 95) ? 'B' : 'C');
            $out['is_stagnant'] = Dec::isZero($row->qty_sold);

            return $out;
        });

        return $this->ok([
            'period' => ['from' => $from, 'to' => $to],
            'rows' => $rows,
            'abc_note' => 'A: أول 80% من المبيعات، B: حتى 95%، C: الباقي.',
        ]);
    }
}
