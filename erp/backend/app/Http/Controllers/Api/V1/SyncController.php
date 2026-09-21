<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Sync\SyncService;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * نقاط نهاية المزامنة لتطبيق المندوب.
 * السيرفر هو المصدر المركزي الوحيد للترحيل؛ الجهاز يقترح والسيرفر يقرر.
 */
class SyncController extends ApiController
{
    public function __construct(private readonly SyncService $sync) {}

    private function device(Request $request): Device
    {
        $uid = (string) $request->header('X-Device-Uid', $request->input('device_uid', ''));

        $device = Device::where('company_id', $this->companyId($request))
            ->where('device_uid', $uid)
            ->first();

        abort_if(! $device, 404, 'الجهاز غير مسجّل. سجّل الجهاز أولًا.');

        return $device;
    }

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_uid' => ['required', 'string', 'max:100'],
            'label' => ['nullable', 'string', 'max:255'],
            'platform' => ['nullable', 'string', 'max:30'],
            'app_version' => ['nullable', 'string', 'max:30'],
        ]);

        $device = Device::updateOrCreate(
            ['company_id' => $this->companyId($request), 'device_uid' => $data['device_uid']],
            [
                'user_id' => $request->user()->id,
                'salesman_id' => $request->user()->salesmanId(),
                'label' => $data['label'] ?? null,
                'platform' => $data['platform'] ?? 'android',
                'app_version' => $data['app_version'] ?? null,
                'is_active' => true,
            ],
        );

        return $this->ok($device);
    }

    /** دفع العمليات المحفوظة على الجهاز. */
    public function push(Request $request): JsonResponse
    {
        $data = $request->validate([
            'operations' => ['required', 'array', 'min:1', 'max:200'],
            'operations.*.uuid' => ['required', 'uuid'],
            'operations.*.idempotency_key' => ['required', 'string', 'max:120'],
            'operations.*.device_seq' => ['required', 'integer', 'min:0'],
            'operations.*.op_type' => ['required', 'string', 'max:60'],
            'operations.*.payload' => ['required', 'array'],
        ]);

        $device = $this->device($request);

        $receipts = $this->sync->push($device, $data['operations']);

        return $this->ok([
            'receipts' => $receipts,
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /** سحب البيانات المرجعية بشكل تزايدي. */
    public function pull(Request $request): JsonResponse
    {
        $device = $this->device($request);
        $companyId = $this->companyId($request);
        $since = $request->input('since');
        $salesmanId = $device->salesman_id;

        $touched = fn ($query) => $since ? $query->where('updated_at', '>', $since) : $query;

        $customers = $touched(
            DB::table('customers')
                ->where('company_id', $companyId)
                ->when($salesmanId, fn ($q) => $q->where('salesman_id', $salesmanId))
                ->whereNull('deleted_at')
        )->get([
            'id', 'code', 'name', 'phone', 'address', 'latitude', 'longitude',
            'price_list_id', 'credit_limit', 'payment_term_days', 'is_blocked', 'updated_at',
        ]);

        $items = $touched(
            DB::table('items')->where('company_id', $companyId)->where('is_active', true)->whereNull('deleted_at')
        )->get(['id', 'code', 'name_ar', 'base_uom_id', 'track_batches', 'track_expiry', 'updated_at']);

        $itemUoms = DB::table('item_uoms')
            ->join('items', 'items.id', '=', 'item_uoms.item_id')
            ->where('items.company_id', $companyId)
            ->get(['item_uoms.id', 'item_uoms.item_id', 'item_uoms.uom_id', 'item_uoms.factor', 'item_uoms.is_base']);

        // إصدار الأسعار المسلّم للجهاز — يُحفظ للمراجعة عند التعارض
        $priceVersion = DB::table('price_snapshots')
            ->where('company_id', $companyId)
            ->orderByDesc('version')
            ->first();

        $prices = DB::table('price_list_lines as pll')
            ->join('price_lists as pl', 'pl.id', '=', 'pll.price_list_id')
            ->where('pl.company_id', $companyId)
            ->where('pl.is_active', true)
            ->whereDate('pll.valid_from', '<=', now()->toDateString())
            ->where(fn ($q) => $q->whereNull('pll.valid_to')->orWhereDate('pll.valid_to', '>=', now()->toDateString()))
            ->get(['pll.id', 'pll.price_list_id', 'pll.item_id', 'pll.uom_id', 'pll.min_qty', 'pll.price', 'pll.max_discount_pct']);

        $vanStock = $salesmanId
            ? DB::table('stock_balances as sb')
                ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
                ->where('sb.company_id', $companyId)
                ->where('w.salesman_id', $salesmanId)
                ->where('sb.status_bucket', 'available')
                ->get(['sb.item_id', 'sb.warehouse_id', 'sb.batch_id', 'sb.qty_base'])
            : collect();

        $stockQuotas = DB::table('offline_stock_quotas')
            ->where('device_id', $device->id)->where('status', 'active')
            ->get(['item_id', 'warehouse_id', 'qty_base', 'consumed_qty_base', 'expires_at']);

        $creditQuotas = DB::table('offline_credit_quotas')
            ->where('device_id', $device->id)->where('status', 'active')
            ->get(['customer_id', 'amount', 'consumed_amount', 'expires_at']);

        return $this->ok([
            'server_time' => now()->toIso8601String(),
            'since' => $since,
            'device' => [
                'is_active' => (bool) $device->is_active,
                'offline_authorized_until' => $device->offline_authorized_until?->toIso8601String(),
                'offline_max_ops' => (int) $device->offline_max_ops,
            ],
            'price_version' => $priceVersion?->version,
            'price_expires_at' => $priceVersion?->expires_at,
            'customers' => $customers,
            'items' => $items,
            'item_uoms' => $itemUoms,
            'prices' => $prices,
            'van_stock' => $vanStock,
            'offline_stock_quotas' => $stockQuotas,
            'offline_credit_quotas' => $creditQuotas,
        ]);
    }

    public function status(Request $request): JsonResponse
    {
        return $this->ok($this->sync->status($this->device($request)));
    }

    /** العمليات المعلقة والمرفوضة والمتعارضة مع سبب الخطأ. */
    public function operations(Request $request): JsonResponse
    {
        $device = $this->device($request);

        $query = \App\Models\SyncOperation::query()
            ->where('device_id', $device->id)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->orderByDesc('id');

        return $this->paginate($request, $query, ['idempotency_key', 'server_doc_no'], ['received_at', 'device_seq']);
    }
}
