<?php

namespace App\Http\Controllers\Api;

use App\Domain\Inventory\StockQuery;
use App\Models\Barcode;
use App\Models\Item;
use App\Models\ItemUnit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ItemController extends BaseApiController
{
    protected array $sortable = ['code', 'name', 'default_sale_price', 'reorder_point', 'created_at'];

    protected array $searchable = ['items.code', 'items.name', 'items.name_en'];

    public function __construct(private readonly StockQuery $stock) {}

    public function index(Request $request): JsonResponse
    {
        $query = Item::query()
            ->with(['category:id,name', 'brand:id,name', 'baseUnit:id,name', 'cost'])
            ->when($request->filled('category_id'), fn ($q) => $q->where('category_id', $request->integer('category_id')))
            ->when($request->filled('brand_id'), fn ($q) => $q->where('brand_id', $request->integer('brand_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->boolean('below_reorder'), fn ($q) => $q->whereRaw('
                items.reorder_point > 0 AND items.reorder_point >= (
                    SELECT COALESCE(SUM(sb.qty_on_hand - sb.qty_reserved), 0)
                      FROM stock_balances sb
                      JOIN warehouses w ON w.id = sb.warehouse_id
                     WHERE sb.item_id = items.id
                       AND w.is_sellable
                       AND w.kind NOT IN (\'transit\',\'quarantine\',\'inspection\',\'damaged\')
                )'));

        // Whether costs are visible is a permission, enforced here and not by
        // hiding a column in the UI.
        $canSeeCost = $request->user()->hasPermission('inventory.cost.view');

        return $this->paginated($query, $request, function (Item $item) use ($canSeeCost) {
            $row = [
                'id' => $item->id,
                'code' => $item->code,
                'name' => $item->name,
                'category' => $item->category?->name,
                'brand' => $item->brand?->name,
                'base_unit' => $item->baseUnit?->name,
                'default_sale_price' => (string) $item->default_sale_price,
                'reorder_point' => (string) $item->reorder_point,
                'track_batches' => $item->track_batches,
                'track_expiry' => $item->track_expiry,
                'is_weighted' => $item->is_weighted,
                'status' => $item->status,
                'qty_on_hand' => (string) ($item->cost?->qty_on_hand ?? '0'),
            ];

            if ($canSeeCost) {
                $row['avg_cost'] = (string) ($item->cost?->avg_cost ?? '0');
                $row['stock_value'] = (string) ($item->cost?->total_value ?? '0');
            }

            return $row;
        });
    }

    public function show(Request $request, Item $item): JsonResponse
    {
        $item->load(['category', 'brand', 'baseUnit', 'taxRate', 'units.unit', 'barcodes', 'cost']);
        $canSeeCost = $request->user()->hasPermission('inventory.cost.view');

        return response()->json([
            'item' => $item->toArray(),
            'position' => $this->stock->position($item->id),
            'cost' => $canSeeCost ? [
                'avg_cost' => (string) ($item->cost?->avg_cost ?? '0'),
                'last_purchase_cost' => (string) ($item->cost?->last_purchase_cost ?? '0'),
                'total_value' => (string) ($item->cost?->total_value ?? '0'),
            ] : null,
            'by_warehouse' => DB::table('stock_balances as sb')
                ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
                ->leftJoin('batches as b', 'b.id', '=', 'sb.batch_id')
                ->where('sb.item_id', $item->id)
                ->where('sb.qty_on_hand', '<>', 0)
                ->select(['w.id as warehouse_id', 'w.name as warehouse', 'w.kind',
                    'b.code as batch', 'b.expiry_date',
                    'sb.qty_on_hand', 'sb.qty_reserved',
                    DB::raw('sb.qty_on_hand - sb.qty_reserved AS qty_available')])
                ->orderBy('w.name')
                ->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateItem($request);

        $item = DB::transaction(function () use ($data) {
            $item = Item::create(collect($data)->except('units')->all());

            foreach ($data['units'] as $unit) {
                $itemUnit = ItemUnit::create([
                    'item_id' => $item->id,
                    'unit_id' => $unit['unit_id'],
                    'factor' => $unit['factor'],
                    'is_base' => $unit['is_base'] ?? false,
                    'is_sales_default' => $unit['is_sales_default'] ?? false,
                    'is_purchase_default' => $unit['is_purchase_default'] ?? false,
                    'sale_price' => $unit['sale_price'] ?? null,
                ]);

                if (! empty($unit['barcode'])) {
                    Barcode::firstOrCreate([
                        'company_id' => $item->company_id,
                        'barcode' => $unit['barcode'],
                    ], ['item_id' => $item->id, 'item_unit_id' => $itemUnit->id]);
                }
            }

            return $item;
        });

        return response()->json(['item' => $item->load('units')], 201);
    }

    public function update(Request $request, Item $item): JsonResponse
    {
        $data = $this->validateItem($request, $item);
        $item->update(collect($data)->except('units')->all());

        return response()->json(['item' => $item->fresh('units')]);
    }

    /** Barcode lookup for the scanner: resolves item, unit and conversion factor. */
    public function byBarcode(Request $request): JsonResponse
    {
        $code = trim((string) $request->query('barcode'));

        $row = DB::table('barcodes as b')
            ->join('items as i', 'i.id', '=', 'b.item_id')
            ->leftJoin('item_units as iu', 'iu.id', '=', 'b.item_unit_id')
            ->where('b.company_id', $request->user()->company_id)
            ->where('b.barcode', $code)
            ->select(['i.id as item_id', 'i.code', 'i.name', 'iu.id as item_unit_id', 'iu.factor'])
            ->first();

        if (! $row) {
            return response()->json([
                'error' => 'items.barcode_not_found',
                'message' => "لا يوجد صنف بالباركود «{$code}».",
            ], 404);
        }

        return response()->json(['item' => $row]);
    }

    protected function validateItem(Request $request, ?Item $item = null): array
    {
        $unique = 'unique:items,code,'.($item?->id ?? 'NULL').',id,company_id,'.$request->user()->company_id;

        return $request->validate([
            'code' => ['required', 'string', 'max:48', $unique],
            'name' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'category_id' => ['nullable', 'integer', 'exists:item_categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'base_unit_id' => ['required', 'integer', 'exists:units,id'],
            'tax_rate_id' => ['nullable', 'integer', 'exists:tax_rates,id'],
            'is_taxable' => ['boolean'],
            'track_batches' => ['boolean'],
            'track_expiry' => ['boolean'],
            'track_serials' => ['boolean'],
            'is_weighted' => ['boolean'],
            'allow_partial_unit' => ['boolean'],
            'reorder_point' => ['numeric', 'min:0'],
            'reorder_qty' => ['numeric', 'min:0'],
            'lead_time_days' => ['integer', 'min:0'],
            'shelf_life_days' => ['nullable', 'integer', 'min:0'],
            'min_shelf_life_sale_days' => ['integer', 'min:0'],
            'default_sale_price' => ['numeric', 'min:0'],
            'weight_kg' => ['nullable', 'numeric', 'min:0'],
            'status' => ['in:active,suspended,discontinued'],
            'notes' => ['nullable', 'string'],
            'units' => ['required', 'array', 'min:1'],
            'units.*.unit_id' => ['required', 'integer', 'exists:units,id'],
            'units.*.factor' => ['required', 'numeric', 'gt:0'],
            'units.*.is_base' => ['boolean'],
            'units.*.is_sales_default' => ['boolean'],
            'units.*.is_purchase_default' => ['boolean'],
            'units.*.sale_price' => ['nullable', 'numeric', 'min:0'],
            'units.*.barcode' => ['nullable', 'string', 'max:64'],
        ]);
    }
}
