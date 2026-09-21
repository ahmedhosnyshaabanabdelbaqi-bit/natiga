<?php

namespace App\Domain\Reporting;

use App\Domain\Support\Num;
use App\Support\CompanyContext;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Operational and financial reports.
 *
 * Each report returns rows plus a `totals` block computed over the WHOLE
 * filtered set, so a paged view never presents page subtotals as grand totals.
 */
class ReportService
{
    /** Sales broken down by any of a fixed set of dimensions. */
    public function salesBy(string $dimension, array $filters): array
    {
        $companyId = CompanyContext::idOrFail();
        $from = $filters['from'] ?? now()->startOfMonth()->toDateString();
        $to = $filters['to'] ?? now()->toDateString();

        // Allowlisted dimensions — the grouping expression never comes from input.
        [$groupBy, $labelSelect, $joins] = match ($dimension) {
            'customer' => [['c.id', 'c.code', 'c.name'], 'c.code AS key, c.name AS label', ['customers as c' => ['c.id', 'si.customer_id']]],
            'rep' => [['u.id', 'u.name'], "COALESCE(u.id::text,'—') AS key, COALESCE(u.name,'غير محدد') AS label", ['users as u' => ['u.id', 'si.rep_id']]],
            'item' => [['i.id', 'i.code', 'i.name'], 'i.code AS key, i.name AS label', []],
            'brand' => [['br.id', 'br.name'], "COALESCE(br.id::text,'—') AS key, COALESCE(br.name,'بدون علامة') AS label", []],
            'category' => [['cat.id', 'cat.name'], "COALESCE(cat.id::text,'—') AS key, COALESCE(cat.name,'بدون تصنيف') AS label", []],
            'region' => [['r.id', 'r.name'], "COALESCE(r.id::text,'—') AS key, COALESCE(r.name,'بدون منطقة') AS label", []],
            'branch' => [['b.id', 'b.name'], "COALESCE(b.id::text,'—') AS key, COALESCE(b.name,'—') AS label", []],
            'day' => [['si.invoice_date'], 'si.invoice_date::text AS key, si.invoice_date::text AS label', []],
            default => throw new \InvalidArgumentException("Unsupported sales dimension: {$dimension}"),
        };

        $itemLevel = in_array($dimension, ['item', 'brand', 'category'], true);

        $query = DB::table('sales_invoices as si')
            ->where('si.company_id', $companyId)
            ->where('si.status', 'posted')
            ->whereBetween('si.invoice_date', [$from, $to]);

        if ($itemLevel) {
            $query->join('sales_invoice_lines as sil', 'sil.sales_invoice_id', '=', 'si.id')
                ->join('items as i', 'i.id', '=', 'sil.item_id')
                ->leftJoin('brands as br', 'br.id', '=', 'i.brand_id')
                ->leftJoin('item_categories as cat', 'cat.id', '=', 'i.category_id');
        } else {
            $query->leftJoin('customers as c', 'c.id', '=', 'si.customer_id')
                ->leftJoin('users as u', 'u.id', '=', 'si.rep_id')
                ->leftJoin('regions as r', 'r.id', '=', 'c.region_id')
                ->leftJoin('branches as b', 'b.id', '=', 'si.branch_id');
        }

        $this->applySalesFilters($query, $filters);

        $metrics = $itemLevel
            ? 'SUM(sil.qty_base) AS qty,
               SUM(sil.line_total - sil.tax_amount) AS net_sales,
               SUM(sil.tax_amount) AS tax,
               SUM(sil.discount_amount) AS discount,
               SUM(sil.cogs_amount) AS cogs,
               COUNT(DISTINCT si.id) AS documents'
            : 'SUM(si.total - si.tax_amount) AS net_sales,
               SUM(si.tax_amount) AS tax,
               SUM(si.line_discount_amount + si.doc_discount_amount) AS discount,
               SUM(si.cogs_amount) AS cogs,
               0 AS qty,
               COUNT(*) AS documents';

        $rows = (clone $query)
            ->groupBy($groupBy)
            ->selectRaw("{$labelSelect}, {$metrics}")
            ->orderByDesc('net_sales')
            ->get()
            ->map(function ($row) {
                $row->gross_profit = Num::money(Num::sub($row->net_sales, $row->cogs, Num::MONEY_SCALE));
                $row->margin_pct = Num::isPositive($row->net_sales, Num::MONEY_SCALE)
                    ? Num::round(Num::mul(Num::div($row->gross_profit, $row->net_sales), '100'), 2)
                    : '0.00';

                return $row;
            });

        return [
            'dimension' => $dimension,
            'period' => ['from' => $from, 'to' => $to],
            'rows' => $rows,
            // Totals over everything matched, not over the rows shown.
            'totals' => $this->totalsFrom($rows, ['qty', 'net_sales', 'tax', 'discount', 'cogs', 'gross_profit']),
        ];
    }

    protected function applySalesFilters($query, array $filters): void
    {
        foreach ([
            'customer_id' => 'si.customer_id',
            'rep_id' => 'si.rep_id',
            'branch_id' => 'si.branch_id',
        ] as $key => $column) {
            if (! empty($filters[$key])) {
                $query->where($column, $filters[$key]);
            }
        }

        if (! empty($filters['region_id'])) {
            $query->where('c.region_id', $filters['region_id']);
        }
    }

    /** Trial balance — the first thing an accountant checks. */
    public function trialBalance(string $from, string $to): array
    {
        $rows = DB::table('accounts as a')
            ->leftJoin('journal_lines as jl', 'jl.account_id', '=', 'a.id')
            ->leftJoin('journal_entries as je', function ($j) use ($from, $to) {
                $j->on('je.id', '=', 'jl.journal_entry_id')
                    ->where('je.status', '=', 'posted')
                    ->whereBetween('je.entry_date', [$from, $to]);
            })
            ->where('a.company_id', CompanyContext::idOrFail())
            ->where('a.is_postable', true)
            ->groupBy('a.id', 'a.code', 'a.name', 'a.type')
            ->havingRaw('COALESCE(SUM(jl.debit), 0) <> 0 OR COALESCE(SUM(jl.credit), 0) <> 0')
            ->orderBy('a.code')
            ->selectRaw("
                a.code, a.name, a.type,
                COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0) AS debit,
                COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) AS credit
            ")
            ->get()
            ->map(function ($row) {
                $net = Num::sub($row->debit, $row->credit, Num::MONEY_SCALE);
                $row->balance_debit = Num::isPositive($net, Num::MONEY_SCALE) ? Num::money($net) : '0.00';
                $row->balance_credit = Num::isNegative($net, Num::MONEY_SCALE) ? Num::money(Num::abs($net)) : '0.00';

                return $row;
            });

        $totals = $this->totalsFrom($rows, ['debit', 'credit', 'balance_debit', 'balance_credit']);

        return [
            'period' => ['from' => $from, 'to' => $to],
            'rows' => $rows,
            'totals' => $totals,
            // If this is ever false, something wrote to the ledger outside
            // LedgerService. It is surfaced rather than hidden.
            'is_balanced' => Num::cmp($totals['debit'], $totals['credit'], Num::MONEY_SCALE) === 0,
        ];
    }

    /** Income statement from the account-type mapping. */
    public function incomeStatement(string $from, string $to): array
    {
        $rows = DB::table('accounts as a')
            ->join('journal_lines as jl', 'jl.account_id', '=', 'a.id')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->where('a.company_id', CompanyContext::idOrFail())
            ->whereIn('a.type', ['revenue', 'expense'])
            ->where('je.status', 'posted')
            ->whereBetween('je.entry_date', [$from, $to])
            ->groupBy('a.id', 'a.code', 'a.name', 'a.type', 'a.subtype')
            ->orderBy('a.code')
            ->selectRaw('a.code, a.name, a.type, a.subtype,
                         COALESCE(SUM(jl.credit - jl.debit), 0) AS amount')
            ->get();

        $revenue = $rows->where('type', 'revenue')
            ->reduce(fn ($c, $r) => Num::add($c, $r->amount, Num::MONEY_SCALE), '0');
        $expenses = $rows->where('type', 'expense')
            ->reduce(fn ($c, $r) => Num::sub($c, $r->amount, Num::MONEY_SCALE), '0');
        $cogs = $rows->where('subtype', 'cogs')
            ->reduce(fn ($c, $r) => Num::sub($c, $r->amount, Num::MONEY_SCALE), '0');

        return [
            'period' => ['from' => $from, 'to' => $to],
            'revenue' => Num::money($revenue),
            'cogs' => Num::money($cogs),
            'gross_profit' => Num::money(Num::sub($revenue, $cogs, Num::MONEY_SCALE)),
            'operating_expenses' => Num::money(Num::sub($expenses, $cogs, Num::MONEY_SCALE)),
            'net_profit' => Num::money(Num::sub($revenue, $expenses, Num::MONEY_SCALE)),
            'rows' => $rows,
            'note' => 'هذه القائمة مبنية على تصنيف الحسابات في دليل الحسابات. راجع خريطة الحسابات قبل الاعتماد الرسمي.',
        ];
    }

    /** Rep scorecard: plan vs. actual, sales, collections, targets. */
    public function repPerformance(string $from, string $to, ?int $repId = null): array
    {
        $companyId = CompanyContext::idOrFail();

        $rows = DB::table('users as u')
            ->where('u.company_id', $companyId)
            ->when($repId, fn ($q) => $q->where('u.id', $repId))
            ->whereExists(fn ($q) => $q->select(DB::raw(1))->from('customer_assignments')
                ->whereColumn('customer_assignments.rep_id', 'u.id'))
            ->selectRaw("
                u.id, u.name,
                (SELECT COALESCE(SUM(si.total - si.tax_amount), 0) FROM sales_invoices si
                  WHERE si.rep_id = u.id AND si.status = 'posted'
                    AND si.invoice_date BETWEEN ? AND ?) AS net_sales,
                (SELECT COALESCE(SUM(si.cogs_amount), 0) FROM sales_invoices si
                  WHERE si.rep_id = u.id AND si.status = 'posted'
                    AND si.invoice_date BETWEEN ? AND ?) AS cogs,
                (SELECT COALESCE(SUM(r.amount), 0) FROM receipts r
                  WHERE r.rep_id = u.id AND r.status = 'posted'
                    AND r.receipt_date BETWEEN ? AND ?) AS collections,
                (SELECT COALESCE(SUM(sr.total), 0) FROM sales_returns sr
                  WHERE sr.rep_id = u.id AND sr.status = 'posted'
                    AND sr.return_date BETWEEN ? AND ?) AS returns,
                (SELECT COUNT(*) FROM visits v
                  WHERE v.rep_id = u.id AND v.business_date BETWEEN ? AND ?) AS visits_done,
                (SELECT COUNT(*) FROM visits v
                  WHERE v.rep_id = u.id AND v.is_productive
                    AND v.business_date BETWEEN ? AND ?) AS visits_productive,
                (SELECT COUNT(*) FROM visit_plan_lines vpl
                   JOIN visit_plans vp ON vp.id = vpl.visit_plan_id
                  WHERE vp.rep_id = u.id AND vp.plan_date BETWEEN ? AND ?) AS visits_planned,
                (SELECT COUNT(DISTINCT si.customer_id) FROM sales_invoices si
                  WHERE si.rep_id = u.id AND si.status = 'posted'
                    AND si.invoice_date BETWEEN ? AND ?) AS active_customers
            ", array_merge(...array_fill(0, 8, [$from, $to])))
            ->get()
            ->map(function ($row) use ($from, $to) {
                $row->gross_profit = Num::money(Num::sub($row->net_sales, $row->cogs, Num::MONEY_SCALE));
                $row->visit_achievement = $row->visits_planned > 0
                    ? Num::round(Num::mul(Num::div((string) $row->visits_done, (string) $row->visits_planned), '100'), 2)
                    : '0.00';
                $row->productive_rate = $row->visits_done > 0
                    ? Num::round(Num::mul(Num::div((string) $row->visits_productive, (string) $row->visits_done), '100'), 2)
                    : '0.00';

                $target = DB::table('targets')
                    ->where('subject_type', 'rep')
                    ->where('subject_id', $row->id)
                    ->where('metric', 'value')
                    ->where('period_from', '<=', $to)
                    ->where('period_to', '>=', $from)
                    ->value('target_value');

                $row->target = $target ? Num::money($target) : null;
                $row->target_achievement = $target && Num::isPositive($target, Num::MONEY_SCALE)
                    ? Num::round(Num::mul(Num::div((string) $row->net_sales, (string) $target), '100'), 2)
                    : null;

                return $row;
            });

        return [
            'period' => ['from' => $from, 'to' => $to],
            'rows' => $rows,
            'totals' => $this->totalsFrom($rows, ['net_sales', 'cogs', 'gross_profit', 'collections', 'returns']),
        ];
    }

    /** Stagnant vs. fast-moving stock. */
    public function stockMovementSpeed(int $days = 90): array
    {
        $since = now()->subDays($days)->toDateString();

        $rows = DB::table('items as i')
            ->leftJoin('item_costs as ic', fn ($j) => $j->on('ic.item_id', '=', 'i.id')
                ->on('ic.company_id', '=', 'i.company_id'))
            ->where('i.company_id', CompanyContext::idOrFail())
            ->whereNull('i.deleted_at')
            ->selectRaw("
                i.id, i.code, i.name,
                COALESCE(ic.qty_on_hand, 0) AS qty_on_hand,
                COALESCE(ic.total_value, 0) AS stock_value,
                (SELECT COALESCE(SUM(m.qty_base), 0) FROM stock_movements m
                  WHERE m.item_id = i.id AND m.direction = 'out'
                    AND m.reason IN ('sale_delivery','sale_direct','sale_bonus')
                    AND m.moved_at >= ?) AS qty_sold,
                (SELECT MAX(m.moved_at) FROM stock_movements m
                  WHERE m.item_id = i.id AND m.direction = 'out'
                    AND m.reason IN ('sale_delivery','sale_direct')) AS last_sold_at
            ", [$since.' 00:00:00'])
            ->orderByDesc('stock_value')
            ->get()
            ->map(function ($row) use ($days) {
                $dailyRate = Num::div($row->qty_sold, (string) $days, Num::QTY_SCALE);
                $row->daily_rate = Num::qty($dailyRate);
                $row->days_of_cover = Num::isPositive($dailyRate, Num::QTY_SCALE)
                    ? Num::round(Num::div($row->qty_on_hand, $dailyRate), 1)
                    : null;
                $row->classification = match (true) {
                    ! Num::isPositive($row->qty_sold, Num::QTY_SCALE) => 'راكد',
                    $row->days_of_cover !== null && Num::cmp($row->days_of_cover, '120') > 0 => 'بطيء',
                    $row->days_of_cover !== null && Num::cmp($row->days_of_cover, '30') < 0 => 'سريع',
                    default => 'طبيعي',
                };

                return $row;
            });

        return ['window_days' => $days, 'rows' => $rows];
    }

    /** @param array<int, string> $columns */
    protected function totalsFrom(Collection $rows, array $columns): array
    {
        $totals = array_fill_keys($columns, '0');

        foreach ($rows as $row) {
            foreach ($columns as $column) {
                $totals[$column] = Num::add($totals[$column], $row->$column ?? '0', Num::MONEY_SCALE);
            }
        }

        return array_map(fn ($v) => Num::money($v), $totals);
    }
}
