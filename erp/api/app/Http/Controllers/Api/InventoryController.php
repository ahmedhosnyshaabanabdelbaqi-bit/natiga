<?php

namespace App\Http\Controllers\Api;

use App\Domain\Inventory\InventoryService;
use App\Domain\Inventory\StockQuery;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Models\StockAdjustment;
use App\Models\StockAdjustmentLine;
use App\Models\StockTransfer;
use App\Models\StockTransferLine;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends BaseApiController
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly StockQuery $stock,
        private readonly DocumentNumbering $numbering,
    ) {}

    /** Stock on hand, with the availability breakdown kept explicit. */
    public function balances(Request $request): JsonResponse
    {
        $canSeeCost = $request->user()->hasPermission('inventory.cost.view');

        $query = DB::table('stock_balances as sb')
            ->join('items as i', 'i.id', '=', 'sb.item_id')
            ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
            ->leftJoin('batches as b', 'b.id', '=', 'sb.batch_id')
            ->leftJoin('item_costs as ic', function ($j) {
                $j->on('ic.item_id', '=', 'sb.item_id')->on('ic.company_id', '=', 'sb.company_id');
            })
            ->where('sb.company_id', CompanyContext::idOrFail())
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('sb.warehouse_id', $request->integer('warehouse_id')))
            ->when($request->filled('item_id'), fn ($q) => $q->where('sb.item_id', $request->integer('item_id')))
            ->when($request->filled('q'), fn ($q) => $q->where(fn ($s) => $s
                ->where('i.code', 'ILIKE', '%'.$request->string('q').'%')
                ->orWhere('i.name', 'ILIKE', '%'.$request->string('q').'%')))
            ->when(! $request->boolean('include_zero'), fn ($q) => $q->where('sb.qty_on_hand', '<>', 0));

        // A user scoped to specific warehouses cannot read outside them.
        if ($warehouses = $request->user()->scopeIds('warehouse')) {
            $query->whereIn('sb.warehouse_id', $warehouses);
        }

        $select = [
            'sb.id', 'i.id as item_id', 'i.code', 'i.name',
            'w.id as warehouse_id', 'w.name as warehouse', 'w.kind as warehouse_kind',
            'b.code as batch', 'b.expiry_date',
            'sb.qty_on_hand', 'sb.qty_reserved',
            DB::raw('sb.qty_on_hand - sb.qty_reserved AS qty_available'),
            DB::raw("(w.is_sellable AND w.kind NOT IN ('transit','quarantine','inspection','damaged')) AS is_sellable"),
        ];

        if ($canSeeCost) {
            $select[] = DB::raw('COALESCE(ic.avg_cost, 0) AS unit_cost');
            $select[] = DB::raw('sb.qty_on_hand * COALESCE(ic.avg_cost, 0) AS value');
        }

        $perPage = min((int) $request->input('per_page', 50), 200);
        $page = $query->select($select)->orderBy('i.code')->orderBy('w.name')->paginate($perPage);

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /** Item card — every movement with a running balance. */
    public function ledger(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['required', 'integer', 'exists:items,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $rows = $this->stock->itemLedger(
            $data['item_id'],
            $data['warehouse_id'] ?? null,
            $data['from'] ?? now()->startOfMonth()->toDateString(),
            $data['to'] ?? now()->toDateString(),
        );

        if (! $request->user()->hasPermission('inventory.cost.view')) {
            $rows = $rows->map(fn ($r) => tap($r, function ($row) {
                unset($row->unit_cost, $row->value);
            }));
        }

        return response()->json(['rows' => $rows->values()]);
    }

    public function valuation(Request $request): JsonResponse
    {
        return response()->json([
            'rows' => $this->stock->valuation($request->integer('warehouse_id') ?: null),
        ]);
    }

    public function expiring(Request $request): JsonResponse
    {
        return response()->json([
            'rows' => $this->stock->expiringBatches($request->integer('days') ?: 60),
        ]);
    }

    /**
     * Transfer between warehouses — issued now, received later.
     *
     * Goods sit in a transit warehouse in between, so they are never counted in
     * both places at once.
     */
    public function storeTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_warehouse_id' => ['required', 'integer', 'exists:warehouses,id', 'different:to_warehouse_id'],
            'to_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'transfer_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.batch_id' => ['nullable', 'integer', 'exists:batches,id'],
            'lines.*.item_unit_id' => ['nullable', 'integer', 'exists:item_units,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'issue' => ['nullable', 'boolean'],
        ]);

        $transfer = DB::transaction(function () use ($data) {
            $transit = Warehouse::query()->where('kind', 'transit')->where('is_active', true)->first();

            $transfer = StockTransfer::create([
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('stock_transfer'),
                'from_warehouse_id' => $data['from_warehouse_id'],
                'to_warehouse_id' => $data['to_warehouse_id'],
                'transit_warehouse_id' => $transit?->id,
                'transfer_date' => $data['transfer_date'] ?? now()->toDateString(),
                'purpose' => 'transfer',
                'status' => 'draft',
                'notes' => $data['notes'] ?? null,
            ]);

            foreach ($data['lines'] as $input) {
                $itemUnit = isset($input['item_unit_id'])
                    ? \App\Models\ItemUnit::findOrFail($input['item_unit_id'])
                    : \App\Models\ItemUnit::where('item_id', $input['item_id'])
                        ->orderByDesc('is_base')->firstOrFail();

                StockTransferLine::create([
                    'stock_transfer_id' => $transfer->id,
                    'item_id' => $input['item_id'],
                    'batch_id' => $input['batch_id'] ?? null,
                    'item_unit_id' => $itemUnit->id,
                    'unit_factor' => $itemUnit->factor,
                    'qty_input' => Num::qty($input['qty']),
                    'qty_base' => Num::qty($itemUnit->toBase($input['qty'])),
                ]);
            }

            return $transfer;
        });

        if ($data['issue'] ?? false) {
            $transfer = $this->issueTransferInternal($transfer);
        }

        return response()->json(['transfer' => $transfer->load('lines')], 201);
    }

    public function issueTransfer(StockTransfer $stockTransfer): JsonResponse
    {
        return response()->json([
            'transfer' => $this->issueTransferInternal($stockTransfer)->load('lines'),
        ]);
    }

    protected function issueTransferInternal(StockTransfer $transfer): StockTransfer
    {
        return DB::transaction(function () use ($transfer) {
            $transfer = StockTransfer::with('lines')->lockForUpdate()->findOrFail($transfer->id);

            if ($transfer->status !== 'draft') {
                abort(422, 'التحويل تم صرفه بالفعل.');
            }

            $target = $transfer->transit_warehouse_id ?? $transfer->to_warehouse_id;

            foreach ($transfer->lines as $line) {
                $result = $this->inventory->move(
                    fromWarehouseId: $transfer->from_warehouse_id,
                    toWarehouseId: $target,
                    itemId: $line->item_id,
                    qtyBase: (string) $line->qty_base,
                    docType: 'stock_transfer',
                    docId: $transfer->id,
                    docLineId: $line->id,
                    batchId: $line->batch_id,
                    movedAt: $transfer->transfer_date,
                    reason: 'transfer_out',
                );

                $line->forceFill(['unit_cost' => $result['out']->unit_cost])->save();
            }

            $transfer->forceFill([
                'status' => $transfer->transit_warehouse_id ? 'in_transit' : 'received',
                'issued_by' => auth()->id(),
                'issued_at' => now(),
            ])->save();

            if (! $transfer->transit_warehouse_id) {
                $transfer->lines->each(fn ($l) => $l->forceFill(['qty_received_base' => $l->qty_base])->save());
            }

            return $transfer;
        });
    }

    /**
     * Receive a transfer. Shortfalls stay in transit and are recorded as such,
     * rather than being absorbed silently.
     */
    public function receiveTransfer(Request $request, StockTransfer $stockTransfer): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['nullable', 'array'],
            'lines.*.line_id' => ['required', 'integer'],
            'lines.*.qty_received_base' => ['required', 'numeric', 'min:0'],
        ]);

        $transfer = DB::transaction(function () use ($stockTransfer, $data) {
            $transfer = StockTransfer::with('lines')->lockForUpdate()->findOrFail($stockTransfer->id);

            if (! in_array($transfer->status, ['in_transit', 'partially_received'], true)) {
                abort(422, 'التحويل غير قابل للاستلام في حالته الحالية.');
            }

            $byId = collect($data['lines'] ?? [])->keyBy('line_id');
            $anyShort = false;

            foreach ($transfer->lines as $line) {
                $outstanding = Num::sub($line->qty_base, $line->qty_received_base, Num::QTY_SCALE);
                $qty = Num::min(
                    Num::qty($byId->get($line->id)['qty_received_base'] ?? $outstanding),
                    $outstanding
                );

                if (Num::isPositive($qty, Num::QTY_SCALE)) {
                    $this->inventory->move(
                        fromWarehouseId: $transfer->transit_warehouse_id,
                        toWarehouseId: $transfer->to_warehouse_id,
                        itemId: $line->item_id,
                        qtyBase: $qty,
                        docType: 'stock_transfer',
                        docId: $transfer->id,
                        docLineId: $line->id,
                        batchId: $line->batch_id,
                        movedAt: now(),
                        reason: 'transfer_in',
                    );
                }

                $received = Num::qty(Num::add($line->qty_received_base, $qty));
                $shortage = Num::qty(Num::sub($line->qty_base, $received, Num::QTY_SCALE));

                $line->forceFill([
                    'qty_received_base' => $received,
                    'qty_shortage_base' => $shortage,
                ])->save();

                if (Num::isPositive($shortage, Num::QTY_SCALE)) {
                    $anyShort = true;
                }
            }

            $transfer->forceFill([
                'status' => $anyShort ? 'partially_received' : 'received',
                'received_by' => auth()->id(),
                'received_at' => now(),
            ])->save();

            return $transfer;
        });

        return response()->json(['transfer' => $transfer->load('lines')]);
    }

    /**
     * Post an approved stock adjustment.
     *
     * Adjustments are the only way a balance changes without a trading
     * document, and they always produce a journal entry — a quantity cannot be
     * edited into existence.
     */
    public function postAdjustment(Request $request, StockAdjustment $stockAdjustment): JsonResponse
    {
        $ledger = app(\App\Domain\Accounting\LedgerService::class);

        $adjustment = DB::transaction(function () use ($stockAdjustment, $ledger, $request) {
            $adjustment = StockAdjustment::with('lines')->lockForUpdate()->findOrFail($stockAdjustment->id);

            if ($adjustment->status === 'posted') {
                return $adjustment;
            }

            // Whoever created the adjustment may not also approve it.
            if ($adjustment->created_by === $request->user()->id
                && ! $request->user()->hasPermission('inventory.adjustment.self_approve')) {
                abort(403, 'لا يجوز اعتماد تسوية أنشأتها بنفسك.');
            }

            $accounts = $ledger->accounts();
            $draft = $ledger->draftFor(
                'stock_adjustment', $adjustment->id, $adjustment->adjustment_date->toDateString(),
                "تسوية مخزون {$adjustment->code} — {$adjustment->reason}"
            );

            $netValue = '0';

            foreach ($adjustment->lines as $line) {
                $qty = (string) $line->qty_base;

                if (Num::isPositive($qty, Num::QTY_SCALE)) {
                    $this->inventory->receive(
                        warehouseId: $adjustment->warehouse_id,
                        itemId: $line->item_id,
                        qtyBase: $qty,
                        unitCost: (string) $line->unit_cost,
                        docType: 'stock_adjustment',
                        docId: $adjustment->id,
                        docLineId: $line->id,
                        batchId: $line->batch_id,
                        movedAt: $adjustment->adjustment_date,
                        reason: $adjustment->reason,
                    );
                } elseif (Num::isNegative($qty, Num::QTY_SCALE)) {
                    $this->inventory->issue(
                        warehouseId: $adjustment->warehouse_id,
                        itemId: $line->item_id,
                        qtyBase: Num::abs($qty),
                        docType: 'stock_adjustment',
                        docId: $adjustment->id,
                        docLineId: $line->id,
                        batchId: $line->batch_id,
                        movedAt: $adjustment->adjustment_date,
                        reason: $adjustment->reason,
                        forcedUnitCost: (string) $line->unit_cost,
                        allowReservedConsumption: true,
                    );
                }

                $netValue = Num::add($netValue, $line->value, Num::MONEY_SCALE);
            }

            if (! Num::isZero($netValue, Num::MONEY_SCALE)) {
                // A surplus debits inventory and credits the variance account;
                // a shortage does the reverse. signed() handles both.
                $draft->signed($accounts->key('inventory'), $netValue, 'debit', 'أثر التسوية على المخزون');
                $draft->signed(
                    $accounts->key($adjustment->reason === 'damage'
                        ? 'damage_expense' : 'inventory_adjustment'),
                    Num::neg($netValue, Num::MONEY_SCALE),
                    'debit',
                    'فروق التسوية'
                );

                $entry = $ledger->post($draft);
                $adjustment->forceFill(['journal_entry_id' => $entry->id])->save();
            }

            $adjustment->forceFill([
                'status' => 'posted',
                'approved_by' => $request->user()->id,
                'total_value' => Num::money($netValue),
            ])->save();

            return $adjustment;
        });

        return response()->json(['adjustment' => $adjustment->load('lines')]);
    }
}
