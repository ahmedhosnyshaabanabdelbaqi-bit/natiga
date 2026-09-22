<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Access\Services\AuditService;
use App\Modules\Accounting\Services\PostingService;
use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Inventory\Models\StockMovement;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Inventory\Services\StocktakeService;
use App\Modules\Inventory\Services\TransferService;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly TransferService $transfers,
        private readonly StocktakeService $stocktakes,
        private readonly PostingService $posting,
        private readonly AuditService $audit,
    ) {}

    public function balances(Request $request): JsonResponse
    {
        $query = DB::table('stock_balances')
            ->join('products', 'products.id', '=', 'stock_balances.product_id')
            ->join('product_variants', 'product_variants.id', '=', 'stock_balances.variant_id')
            ->join('warehouses', 'warehouses.id', '=', 'stock_balances.warehouse_id')
            ->when($request->query('warehouse_id'), fn ($q, $v) => $q->where('stock_balances.warehouse_id', $v))
            ->when($request->query('q'), function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('products.name', 'ILIKE', $like)->orWhere('product_variants.sku', 'ILIKE', $like));
            })
            ->when($request->boolean('low_stock'), fn ($q) => $q->whereColumn('stock_balances.qty_on_hand', '<=', 'products.min_stock')->where('products.min_stock', '>', 0))
            ->when($request->boolean('dead_stock'), fn ($q) => $q->where(fn ($w) => $w->whereNull('stock_balances.last_movement_at')->orWhere('stock_balances.last_movement_at', '<', now()->subDays(90))))
            ->orderBy('products.name')
            ->select([
                'stock_balances.id', 'stock_balances.warehouse_id', 'warehouses.name as warehouse_name',
                'stock_balances.variant_id', 'product_variants.sku', 'products.name as product_name',
                'products.min_stock', 'stock_balances.qty_on_hand', 'stock_balances.qty_reserved',
                'stock_balances.avg_cost', 'stock_balances.last_movement_at',
            ]);

        return response()->json($query->paginate(min((int) $request->query('per_page', 50), 200)));
    }

    /** The reference ledger: every quantity change, with its source document. */
    public function movements(Request $request): JsonResponse
    {
        $query = StockMovement::query()
            ->with(['variant:id,sku,name', 'warehouse:id,name', 'user:id,name'])
            ->when($request->query('variant_id'), fn ($q, $v) => $q->where('variant_id', $v))
            ->when($request->query('warehouse_id'), fn ($q, $v) => $q->where('warehouse_id', $v))
            ->when($request->query('reason'), fn ($q, $v) => $q->where('reason', $v))
            ->when($request->query('from'), fn ($q, $v) => $q->where('occurred_at', '>=', $v))
            ->when($request->query('to'), fn ($q, $v) => $q->where('occurred_at', '<=', $v))
            ->orderByDesc('id');

        return response()->json($query->paginate(min((int) $request->query('per_page', 50), 200)));
    }

    /** Manual adjustment. Always a documented movement with a reason. */
    public function adjust(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'qty_base' => ['required', 'string', 'regex:/^-?\d+(\.\d{1,4})?$/'],
            'unit_cost' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,6})?$/'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $variant = ProductVariant::query()->with('product')->findOrFail($data['variant_id']);
        $qty = Quantity::of($data['qty_base']);

        $movement = DB::transaction(function () use ($data, $variant, $qty) {
            $movement = $this->inventory->record(
                warehouseId: (int) $data['warehouse_id'],
                variant: $variant,
                qtyBase: $qty,
                reason: InventoryService::REASON_ADJUSTMENT,
                unitCost: isset($data['unit_cost']) ? Money::of($data['unit_cost']) : null,
                note: $data['reason'],
            );

            $value = Money::of($movement->total_cost);
            if ($value->isPositive()) {
                // Inventory up or down against the variance account, so the
                // books stay balanced.
                $this->posting->post(
                    'inventory_adjustment',
                    $movement,
                    $qty->isPositive()
                        ? [
                            ['account' => PostingService::INVENTORY, 'debit' => $value, 'memo' => $data['reason']],
                            ['account' => PostingService::INVENTORY_VARIANCE, 'credit' => $value, 'memo' => $data['reason']],
                        ]
                        : [
                            ['account' => PostingService::INVENTORY_VARIANCE, 'debit' => $value, 'memo' => $data['reason']],
                            ['account' => PostingService::INVENTORY, 'credit' => $value, 'memo' => $data['reason']],
                        ],
                    'تسوية مخزون',
                );
            }

            $this->audit->log('inventory.adjusted', $movement, null, [
                'variant_id' => $variant->id,
                'qty_base' => $qty->toString(),
            ], $data['reason']);

            return $movement;
        });

        return response()->json(['movement' => $movement], 201);
    }

    /** Derived balances vs the ledger — the proof that the projection is sound. */
    public function reconcile(Request $request): JsonResponse
    {
        $discrepancies = $this->inventory->reconcile($request->query('warehouse_id') ? (int) $request->query('warehouse_id') : null);

        return response()->json([
            'discrepancies' => $discrepancies,
            'in_sync' => $discrepancies === [],
            'checked_at' => now()->toIso8601String(),
        ]);
    }

    public function rebuild(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', 'integer'],
            'variant_id' => ['required', 'integer'],
        ]);

        return response()->json([
            'balance' => $this->inventory->rebuildBalance((int) $data['warehouse_id'], (int) $data['variant_id']),
        ]);
    }

    // ---- transfers --------------------------------------------------------

    public function createTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_warehouse_id' => ['required', 'integer', 'exists:warehouses,id', 'different:to_warehouse_id'],
            'to_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'lines.*.product_unit_id' => ['required', 'integer', 'exists:product_units,id'],
            'lines.*.qty' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        return response()->json($this->transfers->create($data), 201);
    }

    public function sendTransfer(Request $request, int $transfer): JsonResponse
    {
        return response()->json($this->transfers->send($transfer));
    }

    public function receiveTransfer(Request $request, int $transfer): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.line_id' => ['required', 'integer'],
            'lines.*.qty_base' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
        ]);

        return response()->json($this->transfers->receive($transfer, $data['lines']));
    }

    // ---- stocktake --------------------------------------------------------

    public function startStocktake(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'scope' => ['nullable', 'in:full,partial'],
            'variant_ids' => ['nullable', 'array'],
            'category_id' => ['nullable', 'integer'],
        ]);

        return response()->json($this->stocktakes->start($data), 201);
    }

    public function countStocktake(Request $request, int $stocktake): JsonResponse
    {
        $data = $request->validate([
            'counts' => ['required', 'array', 'min:1'],
            'counts.*.variant_id' => ['required', 'integer'],
            'counts.*.counted_qty' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
        ]);

        return response()->json($this->stocktakes->count($stocktake, $data['counts']));
    }

    public function postStocktake(Request $request, int $stocktake): JsonResponse
    {
        return response()->json($this->stocktakes->post($stocktake, $request->input('notes')));
    }

    public function showStocktake(int $stocktake): JsonResponse
    {
        return response()->json($this->stocktakes->show($stocktake));
    }
}
