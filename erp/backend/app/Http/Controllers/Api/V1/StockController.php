<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Inventory\AvailabilityService;
use App\Domain\Inventory\StockLedger;
use App\Domain\Inventory\StockTransferService;
use App\Models\StockTransfer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StockController extends ApiController
{
    public function __construct(
        private readonly AvailabilityService $availability,
        private readonly StockTransferService $transfers,
    ) {}

    /** الأرصدة: فعلي / محجوز / متاح / غير قابل للبيع، مفصولة بوضوح. */
    public function balances(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $user = $request->user();

        $query = DB::table('stock_balances as sb')
            ->join('items as i', 'i.id', '=', 'sb.item_id')
            ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
            ->leftJoin('stock_batches as b', 'b.id', '=', 'sb.batch_id')
            ->where('sb.company_id', $companyId)
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('sb.warehouse_id', $request->input('warehouse_id')))
            ->when($request->filled('item_id'), fn ($q) => $q->where('sb.item_id', $request->input('item_id')))
            ->when($request->filled('status_bucket'), fn ($q) => $q->where('sb.status_bucket', $request->input('status_bucket')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w
                ->where('i.name_ar', 'ILIKE', '%'.$request->input('search').'%')
                ->orWhere('i.code', 'ILIKE', '%'.$request->input('search').'%')))
            ->when($request->boolean('non_zero_only', true), fn ($q) => $q->where('sb.qty_base', '<>', 0));

        // نطاق المخازن المسموح للمستخدم
        $warehouseScope = $user->scopeIds('warehouse');
        if ($warehouseScope !== [] && ! $user->is_super_admin) {
            $query->whereIn('sb.warehouse_id', $warehouseScope);
        }

        $columns = [
            'sb.id', 'sb.item_id', 'i.code as item_code', 'i.name_ar as item_name',
            'sb.warehouse_id', 'w.name as warehouse_name', 'w.type as warehouse_type',
            'sb.batch_id', 'b.batch_no', 'b.expiry_date',
            'sb.status_bucket', 'sb.qty_base',
        ];

        if ($user->canSeeCost()) {
            $columns[] = 'sb.total_value';
        }

        $perPage = min((int) $request->input('per_page', 50), 200);
        $page = $query->orderBy('i.name_ar')->paginate($perPage, $columns);

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
                'totals_all_results' => [
                    'qty_base' => (string) (clone $query)->sum('sb.qty_base'),
                    'total_value' => $user->canSeeCost() ? (string) (clone $query)->sum('sb.total_value') : null,
                ],
                'buckets_note' => 'الحجر والتالف وتحت الفحص لا تدخل ضمن المتاح للبيع.',
            ],
        ]);
    }

    public function availability(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['required', 'integer'],
            'warehouse_id' => ['nullable', 'integer'],
        ]);

        return $this->ok($this->availability->forItem(
            $this->companyId($request),
            (int) $data['item_id'],
            isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null,
        ));
    }

    /** كارت الصنف — كل حركة مع مستندها ورصيد جارٍ. */
    public function itemCard(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['required', 'integer'],
            'warehouse_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $companyId = $this->companyId($request);
        $from = $data['from'] ?? now()->startOfMonth()->toDateString();
        $to = $data['to'] ?? now()->toDateString();
        $canSeeCost = $request->user()->canSeeCost();

        $opening = DB::table('stock_movements')
            ->where('company_id', $companyId)
            ->where('item_id', $data['item_id'])
            ->when(isset($data['warehouse_id']), fn ($q) => $q->where('warehouse_id', $data['warehouse_id']))
            ->whereDate('movement_date', '<', $from)
            ->selectRaw("COALESCE(SUM(CASE WHEN direction = 'in' THEN qty_base ELSE -qty_base END), 0) AS qty")
            ->value('qty');

        $movements = DB::table('stock_movements as sm')
            ->leftJoin('warehouses as w', 'w.id', '=', 'sm.warehouse_id')
            ->leftJoin('stock_batches as b', 'b.id', '=', 'sm.batch_id')
            ->where('sm.company_id', $companyId)
            ->where('sm.item_id', $data['item_id'])
            ->when(isset($data['warehouse_id']), fn ($q) => $q->where('sm.warehouse_id', $data['warehouse_id']))
            ->whereBetween('sm.movement_date', [$from, $to])
            ->orderBy('sm.movement_date')
            ->orderBy('sm.id')
            ->get([
                'sm.id', 'sm.movement_date', 'sm.doc_type', 'sm.doc_id', 'sm.doc_no', 'sm.direction',
                'sm.qty_base', 'sm.status_bucket', 'w.name as warehouse_name', 'b.batch_no',
                'sm.unit_cost', 'sm.total_cost',
            ]);

        $balance = \App\Support\Dec::of($opening);
        $rows = $movements->map(function ($m) use (&$balance, $canSeeCost) {
            $balance = $m->direction === 'in'
                ? \App\Support\Dec::add($balance, $m->qty_base)
                : \App\Support\Dec::sub($balance, $m->qty_base);

            $row = (array) $m;
            $row['running_balance'] = \App\Support\Dec::qty($balance);

            if (! $canSeeCost) {
                unset($row['unit_cost'], $row['total_cost']);
            }

            return $row;
        });

        return $this->ok([
            'period' => ['from' => $from, 'to' => $to],
            'opening_balance' => \App\Support\Dec::qty($opening),
            'closing_balance' => \App\Support\Dec::qty($balance),
            'movements' => $rows,
        ]);
    }

    public function transfers(Request $request): JsonResponse
    {
        $query = StockTransfer::query()
            ->where('company_id', $this->companyId($request))
            ->with(['fromWarehouse:id,name', 'toWarehouse:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->orderByDesc('transfer_date')
            ->orderByDesc('id');

        return $this->paginate($request, $query, ['transfer_no'], ['transfer_date', 'transfer_no']);
    }

    public function createTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'transfer_date' => ['required', 'date'],
            'from_warehouse_id' => ['required', 'integer', 'different:to_warehouse_id', 'exists:warehouses,id'],
            'to_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'purpose' => ['nullable', 'in:van_load,van_return,inter_warehouse,van_to_van'],
            'notes' => ['nullable', 'string'],
            'send' => ['nullable', 'boolean'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.uom_id' => ['required', 'integer', 'exists:uoms,id'],
            'lines.*.qty_uom' => ['required', 'numeric', 'gt:0'],
            'lines.*.batch_id' => ['nullable', 'integer'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;

        $transfer = DB::transaction(function () use ($data, $request) {
            $t = $this->transfers->create($data);

            if ($data['send'] ?? false) {
                $t = $this->transfers->send($t, (int) $request->user()->id);
            }

            return $t;
        });

        return $this->ok($transfer->load('lines'), status: 201);
    }

    public function sendTransfer(Request $request, int $id): JsonResponse
    {
        $transfer = StockTransfer::where('company_id', $this->companyId($request))->findOrFail($id);

        return $this->ok($this->transfers->send($transfer, (int) $request->user()->id)->load('lines'));
    }

    public function receiveTransfer(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.line_id' => ['required', 'integer'],
            'lines.*.received_qty_uom' => ['required', 'numeric', 'min:0'],
            'lines.*.status_bucket' => ['nullable', 'in:available,inspection,quarantine,damaged'],
        ]);

        $transfer = StockTransfer::where('company_id', $this->companyId($request))->findOrFail($id);

        return $this->ok($this->transfers->receive($transfer, $data['lines'], (int) $request->user()->id)->load('lines'));
    }

    public function buckets(): JsonResponse
    {
        return $this->ok([
            ['key' => StockLedger::BUCKET_AVAILABLE, 'label' => 'صالح للبيع', 'sellable' => true],
            ['key' => StockLedger::BUCKET_INSPECTION, 'label' => 'تحت الفحص', 'sellable' => false],
            ['key' => StockLedger::BUCKET_QUARANTINE, 'label' => 'حجر', 'sellable' => false],
            ['key' => StockLedger::BUCKET_DAMAGED, 'label' => 'تالف', 'sellable' => false],
            ['key' => StockLedger::BUCKET_IN_TRANSIT, 'label' => 'بالطريق', 'sellable' => false],
        ]);
    }
}
