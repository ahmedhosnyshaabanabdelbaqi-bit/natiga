<?php

namespace App\Domain\Sync;

use App\Domain\Credit\CreditService;
use App\Domain\Support\Num;
use App\Models\Device;
use App\Models\OfflineGrant;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Outbound sync: the working set a rep's device needs to operate offline.
 *
 * Incremental — the device sends the watermark it last saw and gets back only
 * what changed. The payload carries a `price_version` so the device can tell
 * whether its prices are still the ones the server would apply, and an explicit
 * statement of how much credit and van stock it is allowed to spend.
 */
class SyncPullService
{
    public function __construct(private readonly CreditService $credit) {}

    public function pull(Device $device, ?string $since = null): array
    {
        $companyId = CompanyContext::idOrFail();
        $repId = $device->user_id;
        $since = $since ?: '1970-01-01 00:00:00';
        $now = now();

        $customerIds = DB::table('customer_assignments')
            ->where('company_id', $companyId)
            ->where('rep_id', $repId)
            ->whereNull('to_date')
            ->pluck('customer_id');

        $grant = OfflineGrant::query()
            ->where('device_id', $device->id)
            ->where('status', 'active')
            ->where('valid_to', '>=', $now)
            ->first();

        return [
            'server_time' => $now->toIso8601String(),
            'watermark' => $now->toDateTimeString(),
            'price_version' => $this->priceVersion(),
            'grant' => $grant ? [
                'valid_to' => $grant->valid_to->toIso8601String(),
                'max_doc_value' => (string) $grant->max_doc_value,
                'max_daily_value' => (string) $grant->max_daily_value,
                'allow_credit_sales' => (bool) $grant->allow_credit_sales,
            ] : null,
            'customers' => $this->customers($customerIds, $since),
            'items' => $this->items($since),
            'prices' => $this->prices($customerIds, $since),
            'van_stock' => $this->vanStock($device),
            'credit_reservations' => $this->creditReservations($device),
            'open_invoices' => $this->openInvoices($customerIds),
            'visit_plan' => $this->visitPlan($repId),
            'pending_operations' => $this->pendingOperations($device),
        ];
    }

    protected function customers($customerIds, string $since): array
    {
        return DB::table('customers')
            ->whereIn('id', $customerIds)
            ->where('updated_at', '>', $since)
            ->select([
                'id', 'code', 'name', 'phone', 'address', 'latitude', 'longitude',
                'price_list_id', 'discount_pct', 'payment_terms_days', 'credit_limit',
                'credit_hold', 'is_cash_only', 'kind', 'visit_days', 'updated_at',
            ])
            ->get()
            ->map(fn ($c) => (array) $c)
            ->all();
    }

    protected function items(string $since): array
    {
        return DB::table('items as i')
            ->leftJoin('tax_rates as t', 't.id', '=', 'i.tax_rate_id')
            ->where('i.company_id', CompanyContext::idOrFail())
            ->where('i.status', 'active')
            ->whereNull('i.deleted_at')
            ->where('i.updated_at', '>', $since)
            ->select([
                'i.id', 'i.code', 'i.name', 'i.base_unit_id', 'i.is_taxable',
                'i.track_batches', 'i.track_expiry', 'i.is_weighted',
                'i.default_sale_price', 'i.updated_at',
                DB::raw('COALESCE(t.rate, 0) AS tax_rate'),
            ])
            ->get()
            ->map(function ($item) {
                $item = (array) $item;
                $item['units'] = DB::table('item_units as iu')
                    ->join('units as u', 'u.id', '=', 'iu.unit_id')
                    ->leftJoin('barcodes as bc', 'bc.item_unit_id', '=', 'iu.id')
                    ->where('iu.item_id', $item['id'])
                    ->where('iu.is_active', true)
                    ->select(['iu.id', 'iu.unit_id', 'u.name as unit_name', 'iu.factor',
                        'iu.is_base', 'iu.is_sales_default', 'bc.barcode', 'iu.sale_price'])
                    ->get()->map(fn ($u) => (array) $u)->all();

                return $item;
            })
            ->all();
    }

    protected function prices($customerIds, string $since): array
    {
        $priceListIds = DB::table('customers')->whereIn('id', $customerIds)
            ->whereNotNull('price_list_id')->distinct()->pluck('price_list_id');

        return [
            'price_list_lines' => DB::table('price_list_lines')
                ->whereIn('price_list_id', $priceListIds)
                ->where('updated_at', '>', $since)
                ->get()->map(fn ($r) => (array) $r)->all(),
            'contracts' => DB::table('customer_price_agreements')
                ->whereIn('customer_id', $customerIds)
                ->where('updated_at', '>', $since)
                ->get()->map(fn ($r) => (array) $r)->all(),
        ];
    }

    /**
     * Van stock is the rep's exclusive allocation — no other device can spend
     * it, which is precisely why selling it offline is safe.
     */
    protected function vanStock(Device $device): array
    {
        $warehouseId = DB::table('warehouses as w')
            ->join('vehicles as v', 'v.id', '=', 'w.vehicle_id')
            ->where('w.company_id', CompanyContext::idOrFail())
            ->where('w.kind', 'van')
            ->whereExists(fn ($q) => $q->select(DB::raw(1))
                ->from('van_loads')
                ->whereColumn('van_loads.van_warehouse_id', 'w.id')
                ->where('van_loads.rep_id', $device->user_id))
            ->value('w.id');

        if (! $warehouseId) {
            return ['warehouse_id' => null, 'lines' => []];
        }

        $lines = DB::table('stock_balances as sb')
            ->join('items as i', 'i.id', '=', 'sb.item_id')
            ->leftJoin('batches as b', 'b.id', '=', 'sb.batch_id')
            ->where('sb.warehouse_id', $warehouseId)
            ->where('sb.qty_on_hand', '>', 0)
            ->select([
                'sb.item_id', 'sb.batch_id', 'i.code', 'i.name',
                'sb.qty_on_hand', 'sb.qty_reserved', 'b.code as batch_code', 'b.expiry_date',
                DB::raw('sb.qty_on_hand - sb.qty_reserved AS qty_available'),
            ])
            ->get()->map(fn ($r) => (array) $r)->all();

        return ['warehouse_id' => $warehouseId, 'lines' => $lines];
    }

    protected function creditReservations(Device $device): array
    {
        return DB::table('credit_reservations as cr')
            ->join('customers as c', 'c.id', '=', 'cr.customer_id')
            ->where('cr.device_id', $device->id)
            ->where('cr.status', 'active')
            ->where('cr.expires_at', '>', now())
            ->select([
                'cr.customer_id', 'c.code', 'c.name', 'cr.amount',
                'cr.consumed_amount', 'cr.expires_at',
                DB::raw('cr.amount - cr.consumed_amount AS available'),
            ])
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    protected function openInvoices($customerIds): array
    {
        return DB::table('sales_invoices')
            ->whereIn('customer_id', $customerIds)
            ->where('status', 'posted')
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->select([
                'id', 'code', 'customer_id', 'invoice_date', 'due_date', 'total',
                'paid_amount', 'returned_amount',
                DB::raw('total - paid_amount - returned_amount AS outstanding'),
            ])
            ->orderBy('due_date')
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    protected function visitPlan(int $repId): array
    {
        return DB::table('visit_plan_lines as vpl')
            ->join('visit_plans as vp', 'vp.id', '=', 'vpl.visit_plan_id')
            ->join('customers as c', 'c.id', '=', 'vpl.customer_id')
            ->where('vp.company_id', CompanyContext::idOrFail())
            ->where('vp.rep_id', $repId)
            ->whereBetween('vp.plan_date', [now()->toDateString(), now()->addDays(7)->toDateString()])
            ->orderBy('vp.plan_date')
            ->orderBy('vpl.sequence')
            ->select(['vpl.id', 'vp.plan_date', 'vpl.customer_id', 'c.name as customer_name',
                'vpl.sequence', 'vpl.planned_at', 'vpl.objective', 'vpl.status'])
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    /** What the device still owes the server, so its badge count is honest. */
    protected function pendingOperations(Device $device): array
    {
        return DB::table('sync_operations')
            ->where('device_id', $device->id)
            ->whereIn('status', ['pending', 'rejected', 'conflict'])
            ->select(['id', 'op_type', 'status', 'error_code', 'error_message', 'client_seq'])
            ->orderBy('client_seq')
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    /**
     * A cheap version stamp over everything that affects a price.
     *
     * The device compares it on each pull; if it changed, the prices it cached
     * are stale and it must refuse to quote from them beyond the grace the
     * company configured.
     */
    public function priceVersion(): int
    {
        $companyId = CompanyContext::idOrFail();

        $latest = collect([
            DB::table('price_lists')->where('company_id', $companyId)->max('updated_at'),
            DB::table('price_list_lines')->max('updated_at'),
            DB::table('customer_price_agreements')->where('company_id', $companyId)->max('updated_at'),
            DB::table('promotions')->where('company_id', $companyId)->max('updated_at'),
        ])->filter()->max();

        return $latest ? strtotime($latest) : 0;
    }
}
