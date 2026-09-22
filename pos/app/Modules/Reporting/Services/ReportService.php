<?php

declare(strict_types=1);

namespace App\Modules\Reporting\Services;

use App\Modules\Core\Services\BusinessCalendar;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Reporting.
 *
 * Every report here shares ONE definition of the period (business day, via
 * BusinessCalendar) and ONE definition of each figure, published alongside the
 * numbers in `definition`, so two reports cannot disagree about the same range.
 *
 * Definitions used throughout:
 *   gross sales   = sum of completed invoice grand totals (tax included)
 *   returns       = sum of return grand totals in the same period
 *   net sales     = gross sales - returns
 *   cost of sales = COGS of sold items - COGS reversed by returns
 *   gross profit  = (net sales - tax collected) - cost of sales
 *   cash received = signed sum of drawer movements of type sale_cash+change_out
 *
 * Revenue is NOT profit, and buying stock is NOT an expense: purchases move
 * value into inventory and only reach the profit line as cost of sales.
 */
class ReportService
{
    public function __construct(private readonly BusinessCalendar $calendar) {}

    /** @return array<string,mixed> */
    public function dashboard(string $from, ?string $to = null, ?int $branchId = null): array
    {
        $to ??= $from;

        $sales = DB::table('sales')
            ->where('status', 'completed')
            ->whereBetween('business_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->selectRaw('COUNT(*) AS invoices,
                         COALESCE(SUM(grand_total),0) AS gross,
                         COALESCE(SUM(tax_total),0) AS tax,
                         COALESCE(SUM(discount_total),0) AS discounts,
                         COALESCE(SUM(cost_total),0) AS cost,
                         COALESCE(SUM(due_total),0) AS credit')
            ->first();

        $returns = DB::table('sale_returns')
            ->whereBetween('business_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->selectRaw('COUNT(*) AS cnt,
                         COALESCE(SUM(grand_total),0) AS total,
                         COALESCE(SUM(tax_total),0) AS tax,
                         COALESCE(SUM(cost_total),0) AS cost')
            ->first();

        $expenses = DB::table('expenses')
            ->whereBetween('spent_on', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->sum('amount');

        $grossSales = Money::of((string) $sales->gross);
        $returnsTotal = Money::of((string) $returns->total);
        $netSales = $grossSales->minus($returnsTotal);
        $taxNet = Money::of((string) $sales->tax)->minus(Money::of((string) $returns->tax));
        $costOfSales = Money::of((string) $sales->cost)->minus(Money::of((string) $returns->cost));
        $grossProfit = $netSales->minus($taxNet)->minus($costOfSales);
        $expenseTotal = Money::of((string) $expenses);

        return [
            'period' => ['from' => $from, 'to' => $to, 'timezone' => $this->calendar->timezone()],
            'invoices' => (int) $sales->invoices,
            'gross_sales' => $grossSales->toString(),
            'returns_count' => (int) $returns->cnt,
            'returns_total' => $returnsTotal->toString(),
            'net_sales' => $netSales->toString(),
            'tax_collected' => $taxNet->toString(),
            'discounts' => Money::of((string) $sales->discounts)->toString(),
            'cost_of_sales' => $costOfSales->toString(),
            'gross_profit' => $grossProfit->toString(),
            'expenses' => $expenseTotal->toString(),
            'operating_profit' => $grossProfit->minus($expenseTotal)->toString(),
            'credit_sales' => Money::of((string) $sales->credit)->toString(),
            'cash_positions' => $this->cashPositions($branchId),
            'receivables' => Money::of((string) DB::table('customers')->where('balance', '>', 0)->sum('balance'))->toString(),
            'payables' => Money::of((string) DB::table('suppliers')->where('balance', '>', 0)->sum('balance'))->toString(),
            'alerts' => $this->alerts($branchId),
            'definition' => [
                'net_sales' => 'إجمالي الفواتير المعتمدة ناقص المرتجعات، شامل الضريبة.',
                'gross_profit' => 'صافي المبيعات بعد استبعاد الضريبة المحصلة، ناقص تكلفة البضاعة المباعة.',
                'operating_profit' => 'مجمل الربح ناقص المصروفات التشغيلية المسجلة في نفس الفترة.',
                'excludes' => 'لا تشمل الفواتير الملغاة، ولا المشتريات التي لم تُبع بعد.',
            ],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public function salesByPeriod(string $from, string $to, string $groupBy = 'day', ?int $branchId = null): array
    {
        $expression = match ($groupBy) {
            'month' => "to_char(business_date, 'YYYY-MM')",
            'week' => "to_char(business_date, 'IYYY-IW')",
            default => "to_char(business_date, 'YYYY-MM-DD')",
        };

        return DB::table('sales')
            ->where('status', 'completed')
            ->whereBetween('business_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->selectRaw("$expression AS bucket, COUNT(*) AS invoices,
                         SUM(grand_total) AS gross, SUM(discount_total) AS discounts,
                         SUM(tax_total) AS tax, SUM(cost_total) AS cost")
            ->groupBy('bucket')
            ->orderBy('bucket')
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();
    }

    /** @return array<int,array<string,mixed>> */
    public function topProducts(string $from, string $to, int $limit = 20, string $direction = 'desc', ?int $branchId = null): array
    {
        return DB::table('sale_lines')
            ->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->where('sales.status', 'completed')
            ->whereBetween('sales.business_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->groupBy('sale_lines.variant_id', 'sale_lines.product_name')
            ->selectRaw('sale_lines.variant_id, sale_lines.product_name,
                         SUM(sale_lines.qty_base) AS qty,
                         SUM(sale_lines.total_amount) AS revenue,
                         SUM(sale_lines.cost_amount) AS cost,
                         SUM(sale_lines.total_amount - sale_lines.tax_amount - sale_lines.cost_amount) AS profit')
            ->orderBy('qty', $direction === 'asc' ? 'asc' : 'desc')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();
    }

    /** @return array<string,mixed> */
    public function paymentMix(string $from, string $to, ?int $branchId = null): array
    {
        $rows = DB::table('sale_payments')
            ->join('sales', 'sales.id', '=', 'sale_payments.sale_id')
            ->where('sales.status', 'completed')
            ->whereBetween('sales.business_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->groupBy('sale_payments.method_code')
            ->selectRaw('sale_payments.method_code, SUM(sale_payments.amount) AS total, COUNT(*) AS count')
            ->get();

        return $rows->mapWithKeys(fn ($r) => [$r->method_code => [
            'total' => Money::of((string) $r->total)->toString(),
            'count' => (int) $r->count,
        ]])->all();
    }

    /** @return array<string,mixed> Stock value at the running average cost. */
    public function inventoryValuation(?int $warehouseId = null): array
    {
        $rows = DB::table('stock_balances')
            ->join('products', 'products.id', '=', 'stock_balances.product_id')
            ->when($warehouseId, fn ($q) => $q->where('stock_balances.warehouse_id', $warehouseId))
            ->where('stock_balances.qty_on_hand', '<>', 0)
            ->selectRaw('COUNT(*) AS items,
                         SUM(stock_balances.qty_on_hand) AS qty,
                         SUM(stock_balances.qty_on_hand * stock_balances.avg_cost) AS value')
            ->first();

        return [
            'items' => (int) $rows->items,
            'total_qty' => (string) $rows->qty,
            'total_value' => Money::of((string) ($rows->value ?? '0'))->toString(),
            'method' => config('pos.sales.costing_method'),
            'definition' => 'قيمة المخزون بالمتوسط المرجح المتحرك وقت التقرير.',
        ];
    }

    /** @return array<string,mixed> */
    public function alerts(?int $branchId = null): array
    {
        $lowStock = DB::table('stock_balances')
            ->join('products', 'products.id', '=', 'stock_balances.product_id')
            ->join('warehouses', 'warehouses.id', '=', 'stock_balances.warehouse_id')
            ->when($branchId, fn ($q) => $q->where('warehouses.branch_id', $branchId))
            ->where('products.min_stock', '>', 0)
            ->whereColumn('stock_balances.qty_on_hand', '<=', 'products.min_stock')
            ->count();

        $expiringSoon = DB::table('batches')
            ->whereNotNull('expiry_date')
            ->whereBetween('expiry_date', [now()->toDateString(), now()->addDays(30)->toDateString()])
            ->count();

        $expired = DB::table('batches')
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<', now()->toDateString())
            ->count();

        $openShifts = DB::table('shifts')->whereIn('status', ['open', 'closing'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->count();

        $unsynced = DB::table('offline_operations')->whereIn('status', ['pending', 'conflict'])->count();

        $overdue = DB::table('sales')
            ->where('is_credit', true)
            ->where('status', 'completed')
            ->whereNotNull('due_date')
            ->where('due_date', '<', now()->toDateString())
            ->count();

        return compact('lowStock', 'expiringSoon', 'expired', 'openShifts', 'unsynced', 'overdue');
    }

    /** @return array<string,string> */
    private function cashPositions(?int $branchId = null): array
    {
        return DB::table('cash_accounts')
            ->where('is_active', true)
            ->when($branchId, fn ($q) => $q->where(fn ($w) => $w->where('branch_id', $branchId)->orWhereNull('branch_id')))
            ->get(['code', 'name', 'balance'])
            ->mapWithKeys(fn ($r) => [$r->code => Money::of((string) $r->balance)->toString()])
            ->all();
    }

    /**
     * Drill-down: the documents that make up a reported figure.
     *
     * @return array<string,mixed>
     */
    public function drillDown(string $metric, string $from, string $to, ?int $branchId = null, int $page = 1): array
    {
        $perPage = 50;

        $query = match ($metric) {
            'gross_sales', 'net_sales' => DB::table('sales')
                ->where('status', 'completed')
                ->whereBetween('business_date', [$from, $to])
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->select(['id', 'number', 'business_date', 'grand_total', 'user_id', 'customer_id'])
                ->orderByDesc('sold_at'),
            'returns_total' => DB::table('sale_returns')
                ->whereBetween('business_date', [$from, $to])
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->select(['id', 'number', 'business_date', 'grand_total', 'sale_id'])
                ->orderByDesc('returned_at'),
            'expenses' => DB::table('expenses')
                ->whereBetween('spent_on', [$from, $to])
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->select(['id', 'number', 'spent_on', 'amount', 'description'])
                ->orderByDesc('spent_on'),
            default => throw new InvalidOperationException(
                'لا يوجد تفصيل معرف لهذا المؤشر.',
                'unknown_metric',
                422,
                ['metric' => $metric],
            ),
        };

        return [
            'metric' => $metric,
            'period' => ['from' => $from, 'to' => $to],
            'rows' => $query->forPage($page, $perPage)->get(),
            'total' => $query->count(),
        ];
    }
}
