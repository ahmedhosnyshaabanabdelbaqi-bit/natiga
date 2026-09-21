<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Inventory\AvailabilityService;
use App\Domain\Inventory\CostEngine;
use App\Domain\Pricing\PriceResolver;
use App\Domain\Shared\AuditLogger;
use App\Models\Item;
use App\Models\ItemBarcode;
use App\Models\ItemUom;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * الأصناف. التكلفة والربح لا تُرسل في الـ API لمن لا يملك صلاحية مشاهدتها —
 * الإخفاء يتم في الاستجابة نفسها، لا في الواجهة.
 */
class ItemController extends ApiController
{
    public function __construct(
        private readonly AvailabilityService $availability,
        private readonly CostEngine $costs,
        private readonly PriceResolver $prices,
        private readonly AuditLogger $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);

        $query = Item::query()
            ->where('company_id', $companyId)
            ->with(['category:id,name', 'brand:id,name', 'baseUom:id,code,name_ar', 'uoms.uom:id,code,name_ar'])
            ->when($request->filled('category_id'), fn ($q) => $q->where('category_id', $request->input('category_id')))
            ->when($request->filled('brand_id'), fn ($q) => $q->where('brand_id', $request->input('brand_id')))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($request->boolean('below_reorder'), function ($q) use ($companyId) {
                $q->whereRaw('reorder_point > (
                    SELECT COALESCE(SUM(qty_base), 0) FROM stock_balances sb
                    WHERE sb.item_id = items.id AND sb.company_id = ? AND sb.status_bucket = ?
                )', [$companyId, 'available']);
            });

        $response = $this->paginate($request, $query, ['name_ar', 'code', 'name_en'], ['code', 'name_ar', 'reorder_point', 'created_at']);

        return $this->attachStockAndCost($request, $response);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $companyId = $this->companyId($request);

        $item = Item::where('company_id', $companyId)
            ->with(['category', 'brand', 'baseUom', 'uoms.uom', 'barcodes', 'variants'])
            ->findOrFail($id);

        $payload = $item->toArray();
        $payload['stock'] = $this->availability->forItem($companyId, $id);

        $payload['stock_by_warehouse'] = DB::table('stock_balances as sb')
            ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
            ->where('sb.company_id', $companyId)
            ->where('sb.item_id', $id)
            ->where('sb.qty_base', '>', 0)
            ->groupBy('w.id', 'w.name', 'w.type', 'sb.status_bucket')
            ->get(['w.id as warehouse_id', 'w.name as warehouse_name', 'w.type', 'sb.status_bucket', DB::raw('SUM(sb.qty_base) as qty')]);

        if ($request->user()->canSeeCost()) {
            $payload['avg_cost'] = $this->costs->currentAverage($companyId, $id);
        }

        return $this->ok($payload);
    }

    public function byBarcode(Request $request): JsonResponse
    {
        $barcode = (string) $request->query('barcode', '');

        $record = ItemBarcode::where('company_id', $this->companyId($request))
            ->where('barcode', $barcode)
            ->with(['item.baseUom', 'itemUom.uom'])
            ->first();

        if (! $record) {
            return response()->json([
                'error_code' => 'item.barcode_not_found',
                'message' => "لا يوجد صنف بالباركود {$barcode}.",
            ], 404);
        }

        return $this->ok([
            'item' => $record->item,
            'uom' => $record->itemUom?->uom,
            'uom_factor' => $record->itemUom?->factor,
        ]);
    }

    /** تسعير سطر: يُرجع السعر السارٍ ومصدره وحد الخصم. */
    public function price(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['required', 'integer'],
            'uom_id' => ['required', 'integer'],
            'qty' => ['required', 'numeric', 'min:0'],
            'customer_id' => ['nullable', 'integer'],
            'date' => ['nullable', 'date'],
        ]);

        return $this->ok($this->prices->resolve(
            companyId: $this->companyId($request),
            itemId: (int) $data['item_id'],
            uomId: (int) $data['uom_id'],
            qtyInUom: $data['qty'],
            customerId: isset($data['customer_id']) ? (int) $data['customer_id'] : null,
            date: $data['date'] ?? null,
        ));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:60'],
            'name_ar' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'category_id' => ['nullable', 'integer', 'exists:item_categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'base_uom_id' => ['required', 'integer', 'exists:uoms,id'],
            'tax_code_id' => ['nullable', 'integer', 'exists:tax_codes,id'],
            'track_batches' => ['nullable', 'boolean'],
            'track_expiry' => ['nullable', 'boolean'],
            'track_serials' => ['nullable', 'boolean'],
            'is_reel' => ['nullable', 'boolean'],
            'is_weighted' => ['nullable', 'boolean'],
            'reorder_point' => ['nullable', 'numeric', 'min:0'],
            'lead_time_days' => ['nullable', 'integer', 'min:0'],
            'block_sale_days_before_expiry' => ['nullable', 'integer', 'min:0'],
            'uoms' => ['required', 'array', 'min:1'],
            'uoms.*.uom_id' => ['required', 'integer', 'exists:uoms,id'],
            'uoms.*.factor' => ['required', 'numeric', 'gt:0'],
            'uoms.*.barcode' => ['nullable', 'string', 'max:80'],
        ]);

        $companyId = $this->companyId($request);

        $item = DB::transaction(function () use ($data, $companyId) {
            $uoms = $data['uoms'];
            unset($data['uoms']);

            $item = Item::create($data + ['company_id' => $companyId]);

            foreach ($uoms as $uom) {
                $itemUom = ItemUom::create([
                    'item_id' => $item->id,
                    'uom_id' => $uom['uom_id'],
                    'factor' => $uom['factor'],
                    'is_base' => (int) $uom['uom_id'] === (int) $item->base_uom_id,
                ]);

                if (! empty($uom['barcode'])) {
                    ItemBarcode::create([
                        'company_id' => $companyId,
                        'item_id' => $item->id,
                        'item_uom_id' => $itemUom->id,
                        'barcode' => $uom['barcode'],
                    ]);
                }
            }

            return $item;
        });

        $this->audit->log('create', 'item', (int) $item->id, $item->code, null, $item->toArray());

        return $this->ok($item->load('uoms.uom'), status: 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $item = Item::where('company_id', $this->companyId($request))->findOrFail($id);
        $before = $item->toArray();

        $data = $request->validate([
            'name_ar' => ['sometimes', 'string', 'max:255'],
            'name_en' => ['sometimes', 'nullable', 'string', 'max:255'],
            'category_id' => ['sometimes', 'nullable', 'integer'],
            'brand_id' => ['sometimes', 'nullable', 'integer'],
            'reorder_point' => ['sometimes', 'numeric', 'min:0'],
            'lead_time_days' => ['sometimes', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
            'is_sellable' => ['sometimes', 'boolean'],
            'block_sale_days_before_expiry' => ['sometimes', 'integer', 'min:0'],
        ]);

        // معامل التحويل لا يُغيَّر من هنا: المستندات القديمة تحتفظ بمعاملها المحفوظ،
        // وتغيير المعامل يتم بإضافة وحدة جديدة أو بإجراء موثق.
        $item->update($data);

        $this->audit->log('update', 'item', (int) $item->id, $item->code, $before, $item->fresh()->toArray());

        return $this->ok($item->fresh('uoms.uom'));
    }

    private function attachStockAndCost(Request $request, JsonResponse $response): JsonResponse
    {
        $payload = $response->getData(true);
        $companyId = $this->companyId($request);
        $canSeeCost = $request->user()->canSeeCost();

        $ids = array_column($payload['data'], 'id');

        if ($ids === []) {
            return $response;
        }

        $balances = DB::table('stock_balances')
            ->where('company_id', $companyId)
            ->whereIn('item_id', $ids)
            ->where('status_bucket', 'available')
            ->groupBy('item_id')
            ->selectRaw('item_id, SUM(qty_base) AS qty')
            ->pluck('qty', 'item_id');

        $reserved = DB::table('stock_reservations')
            ->where('company_id', $companyId)
            ->whereIn('item_id', $ids)
            ->where('status', 'active')
            ->groupBy('item_id')
            ->selectRaw('item_id, SUM(qty_base) AS qty')
            ->pluck('qty', 'item_id');

        $costs = $canSeeCost
            ? DB::table('item_costs')->where('company_id', $companyId)->whereIn('item_id', $ids)->pluck('avg_cost', 'item_id')
            : collect();

        foreach ($payload['data'] as &$row) {
            $row['on_hand'] = (string) ($balances[$row['id']] ?? '0');
            $row['reserved'] = (string) ($reserved[$row['id']] ?? '0');
            $row['available'] = (string) \App\Support\Dec::max(
                \App\Support\Dec::sub($row['on_hand'], $row['reserved']), 0
            );

            // لا تُرسل التكلفة أصلًا لمن لا يملك صلاحيتها
            if ($canSeeCost) {
                $row['avg_cost'] = (string) ($costs[$row['id']] ?? '0');
            }
        }

        return response()->json($payload);
    }
}
