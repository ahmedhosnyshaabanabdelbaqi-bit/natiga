<?php

namespace App\Domain\Reporting;

use App\Models\User;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * لوحات التحكم حسب الدور. كل مؤشر:
 *  - يعتمد على بيانات فعلية من قاعدة البيانات (لا أرقام عشوائية)،
 *  - له تعريف في قاموس المؤشرات،
 *  - يحمل وقت آخر تحديث،
 *  - يمكن فتح المستندات المكوّنة له عبر رابط تفصيلي.
 */
class DashboardService
{
    public function forUser(User $user, string $from, string $to): array
    {
        $companyId = (int) $user->company_id;
        $role = $this->primaryRole($user);

        $cards = match ($role) {
            'salesman' => $this->salesmanCards($user, $companyId, $from, $to),
            'supervisor' => $this->supervisorCards($user, $companyId, $from, $to),
            'warehouse' => $this->warehouseCards($user, $companyId),
            'accounting' => $this->accountingCards($user, $companyId, $from, $to),
            default => $this->managementCards($user, $companyId, $from, $to),
        };

        return [
            'role_view' => $role,
            'period' => ['from' => $from, 'to' => $to],
            'generated_at' => now()->toIso8601String(),
            'cards' => array_values(array_filter($cards)),
            'dictionary' => KpiDictionary::all(),
        ];
    }

    private function primaryRole(User $user): string
    {
        if ($user->isSalesman()) {
            return 'salesman';
        }

        $codes = $user->roles()->pluck('code')->all();

        foreach ([
            'supervisor' => 'supervisor',
            'warehouse_keeper' => 'warehouse',
            'accountant' => 'accounting',
            'finance_manager' => 'accounting',
        ] as $roleCode => $view) {
            if (in_array($roleCode, $codes, true)) {
                return $view;
            }
        }

        return 'management';
    }

    private function card(string $key, string $value, ?string $drilldown = null, array $extra = []): array
    {
        $definition = KpiDictionary::get($key);

        return array_merge([
            'key' => $key,
            'label' => $definition['label'] ?? $key,
            'value' => $value,
            'formula' => $definition['formula'] ?? null,
            'note' => $definition['note'] ?? null,
            'drilldown' => $drilldown,
        ], $extra);
    }

    // ---------- المؤشرات ----------

    public function netSales(int $companyId, string $from, string $to, ?int $salesmanId = null): string
    {
        $sales = DB::table('sales_invoices')
            ->where('company_id', $companyId)
            ->where('status', '!=', 'cancelled')
            ->whereBetween('invoice_date', [$from, $to])
            ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
            ->selectRaw('COALESCE(SUM(subtotal - line_discount_amount - header_discount_amount), 0) AS v')
            ->value('v');

        $returns = DB::table('sales_returns')
            ->where('company_id', $companyId)
            ->where('status', 'posted')
            ->whereBetween('return_date', [$from, $to])
            ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
            ->selectRaw('COALESCE(SUM(subtotal - discount_amount), 0) AS v')
            ->value('v');

        return Dec::money(Dec::sub($sales, $returns));
    }

    public function costOfSales(int $companyId, string $from, string $to, ?int $salesmanId = null): string
    {
        $cogs = DB::table('sales_invoices')
            ->where('company_id', $companyId)
            ->where('status', '!=', 'cancelled')
            ->whereBetween('invoice_date', [$from, $to])
            ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
            ->sum('total_cost');

        $returnCost = DB::table('sales_returns')
            ->where('company_id', $companyId)
            ->where('status', 'posted')
            ->whereBetween('return_date', [$from, $to])
            ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
            ->sum('total_cost');

        return Dec::money(Dec::sub($cogs, $returnCost));
    }

    public function collections(int $companyId, string $from, string $to, ?int $salesmanId = null): string
    {
        return Dec::money(
            DB::table('customer_receipts')
                ->where('company_id', $companyId)
                ->where('status', 'posted')
                ->whereBetween('receipt_date', [$from, $to])
                ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
                ->sum('amount')
        );
    }

    public function receivables(int $companyId, ?int $salesmanId = null): string
    {
        return Dec::money(
            DB::table('sales_invoices')
                ->where('company_id', $companyId)
                ->whereIn('status', ['posted', 'partially_paid'])
                ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
                ->selectRaw('COALESCE(SUM(total_amount - paid_amount - returned_amount), 0) AS v')
                ->value('v')
        );
    }

    public function overdueReceivables(int $companyId, ?int $salesmanId = null): string
    {
        return Dec::money(
            DB::table('sales_invoices')
                ->where('company_id', $companyId)
                ->whereIn('status', ['posted', 'partially_paid'])
                ->whereDate('due_date', '<', now()->toDateString())
                ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
                ->selectRaw('COALESCE(SUM(total_amount - paid_amount - returned_amount), 0) AS v')
                ->value('v')
        );
    }

    public function payables(int $companyId): string
    {
        return Dec::money(
            DB::table('supplier_invoices')
                ->where('company_id', $companyId)
                ->whereIn('status', ['posted', 'partially_paid'])
                ->selectRaw('COALESCE(SUM(total_amount - paid_amount - returned_amount), 0) AS v')
                ->value('v')
        );
    }

    public function inventoryValue(int $companyId): string
    {
        return Dec::money(DB::table('item_costs')->where('company_id', $companyId)->sum('total_value'));
    }

    public function shortagesCount(int $companyId): int
    {
        return DB::table('items')
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->where('reorder_point', '>', 0)
            ->whereRaw('reorder_point > (
                SELECT COALESCE(SUM(qty_base), 0) FROM stock_balances sb
                WHERE sb.item_id = items.id AND sb.status_bucket = ?
            )', ['available'])
            ->count();
    }

    public function cashCustodyTotal(int $companyId): string
    {
        $row = DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->join('accounts as a', 'a.id', '=', 'jl.account_id')
            ->where('je.company_id', $companyId)
            ->where('je.status', 'posted')
            ->where('a.control_type', 'custody_cash')
            ->selectRaw('COALESCE(SUM(jl.debit), 0) AS d, COALESCE(SUM(jl.credit), 0) AS c')
            ->first();

        return Dec::money(Dec::sub($row->d, $row->c));
    }

    public function backordersCount(int $companyId): int
    {
        return DB::table('sales_orders')
            ->where('company_id', $companyId)
            ->where('status', 'approved')
            ->whereIn('delivery_status', ['pending', 'partial'])
            ->whereDate('required_date', '<', now()->toDateString())
            ->count();
    }

    public function fillRate(int $companyId, string $from, string $to): string
    {
        $row = DB::table('sales_order_lines as sol')
            ->join('sales_orders as so', 'so.id', '=', 'sol.sales_order_id')
            ->where('so.company_id', $companyId)
            ->whereBetween('so.order_date', [$from, $to])
            ->selectRaw('COALESCE(SUM(sol.qty_base), 0) AS ordered, COALESCE(SUM(sol.delivered_qty_base), 0) AS delivered')
            ->first();

        if (Dec::isZero($row->ordered)) {
            return '0.0000';
        }

        return Dec::money(Dec::mul(Dec::div($row->delivered, $row->ordered), 100));
    }

    public function productiveVisitsPct(int $companyId, string $from, string $to, ?int $salesmanId = null): string
    {
        $total = DB::table('visits')
            ->where('company_id', $companyId)
            ->whereBetween('visit_date', [$from, $to])
            ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
            ->count();

        if ($total === 0) {
            return '0.0000';
        }

        $productive = DB::table('visits')
            ->where('company_id', $companyId)
            ->whereBetween('visit_date', [$from, $to])
            ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
            ->whereIn('result', ['order', 'collection'])
            ->count();

        return Dec::money(Dec::mul(Dec::div($productive, $total), 100));
    }

    public function pendingApprovals(int $companyId): int
    {
        return DB::table('approval_requests')->where('company_id', $companyId)->where('status', 'pending')->count();
    }

    public function operatingExpenses(int $companyId, string $from, string $to): string
    {
        return Dec::money(
            DB::table('expenses')
                ->where('company_id', $companyId)
                ->where('status', 'posted')
                ->whereBetween('expense_date', [$from, $to])
                ->sum('amount')
        );
    }

    // ---------- بطاقات الأدوار ----------

    private function managementCards(User $user, int $companyId, string $from, string $to): array
    {
        $netSales = $this->netSales($companyId, $from, $to);
        $cards = [
            $this->card('net_sales', $netSales, '/reports/sales'),
            $this->card('collections', $this->collections($companyId, $from, $to), '/receipts'),
            $this->card('receivables', $this->receivables($companyId), '/reports/aging'),
            $this->card('overdue_receivables', $this->overdueReceivables($companyId), '/reports/aging'),
            $this->card('payables', $this->payables($companyId), '/suppliers'),
            $this->card('stock_shortages', (string) $this->shortagesCount($companyId), '/items?below_reorder=1'),
            $this->card('backorders', (string) $this->backordersCount($companyId), '/sales-orders?backorder=1'),
            $this->card('fill_rate', $this->fillRate($companyId, $from, $to)),
            $this->card('salesman_cash_custody', $this->cashCustodyTotal($companyId), '/day-closures'),
            $this->card('pending_approvals', (string) $this->pendingApprovals($companyId), '/approvals'),
        ];

        if ($user->canSeeCost()) {
            $cogs = $this->costOfSales($companyId, $from, $to);
            $cards[] = $this->card('inventory_value', $this->inventoryValue($companyId), '/reports/inventory-valuation');
            $cards[] = $this->card('cost_of_sales', $cogs, '/reports/sales');
        }

        if ($user->hasPermission('reports.profit.view')) {
            $cogs = $this->costOfSales($companyId, $from, $to);
            $gross = Dec::sub($netSales, $cogs);
            $expenses = $this->operatingExpenses($companyId, $from, $to);

            $cards[] = $this->card('gross_profit', Dec::money($gross), '/reports/sales');
            $cards[] = $this->card('net_profit', Dec::money(Dec::sub($gross, $expenses)), '/reports/income-statement', [
                'caveat' => 'رقم تقديري حتى اكتمال ترحيل كل التكاليف والمصروفات المرتبطة بالفترة.',
                'operating_expenses' => $expenses,
            ]);
        }

        return $cards;
    }

    private function salesmanCards(User $user, int $companyId, string $from, string $to): array
    {
        $salesmanId = $user->salesmanId();

        return [
            $this->card('net_sales', $this->netSales($companyId, $from, $to, $salesmanId), '/my/invoices'),
            $this->card('collections', $this->collections($companyId, $from, $to, $salesmanId), '/my/receipts'),
            $this->card('receivables', $this->receivables($companyId, $salesmanId), '/my/customers'),
            $this->card('overdue_receivables', $this->overdueReceivables($companyId, $salesmanId), '/my/customers'),
            $this->card('productive_visits', $this->productiveVisitsPct($companyId, $from, $to, $salesmanId), '/my/visits'),
        ];
    }

    private function supervisorCards(User $user, int $companyId, string $from, string $to): array
    {
        return [
            $this->card('net_sales', $this->netSales($companyId, $from, $to), '/reports/salesmen'),
            $this->card('collections', $this->collections($companyId, $from, $to), '/receipts'),
            $this->card('salesman_cash_custody', $this->cashCustodyTotal($companyId), '/day-closures'),
            $this->card('productive_visits', $this->productiveVisitsPct($companyId, $from, $to), '/visits'),
            $this->card('pending_approvals', (string) $this->pendingApprovals($companyId), '/approvals'),
        ];
    }

    private function warehouseCards(User $user, int $companyId): array
    {
        $cards = [
            $this->card('stock_shortages', (string) $this->shortagesCount($companyId), '/items?below_reorder=1'),
            $this->card('backorders', (string) $this->backordersCount($companyId), '/sales-orders?backorder=1'),
        ];

        if ($user->canSeeCost()) {
            $cards[] = $this->card('inventory_value', $this->inventoryValue($companyId), '/reports/inventory-valuation');
        }

        return $cards;
    }

    private function accountingCards(User $user, int $companyId, string $from, string $to): array
    {
        return [
            $this->card('receivables', $this->receivables($companyId), '/reports/aging'),
            $this->card('overdue_receivables', $this->overdueReceivables($companyId), '/reports/aging'),
            $this->card('payables', $this->payables($companyId), '/suppliers'),
            $this->card('collections', $this->collections($companyId, $from, $to), '/receipts'),
            $this->card('salesman_cash_custody', $this->cashCustodyTotal($companyId), '/day-closures'),
            $user->canSeeCost() ? $this->card('inventory_value', $this->inventoryValue($companyId), '/reports/inventory-valuation') : null,
        ];
    }
}
