<?php

namespace App\Domain\Inventory;

use App\Domain\Support\Num;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Read-side of the stock engine.
 *
 * The distinction this class exists to keep honest: on-hand, reserved,
 * available and sellable are four different numbers. Quarantine, inspection,
 * damaged and in-transit warehouses hold real stock that is never sellable.
 */
class StockQuery
{
    public function onHand(int $warehouseId, int $itemId, ?int $batchId = null): string
    {
        return Num::qty($this->baseQuery($warehouseId, $itemId, $batchId)->sum('qty_on_hand') ?? 0);
    }

    public function reserved(int $warehouseId, int $itemId, ?int $batchId = null): string
    {
        return Num::qty($this->baseQuery($warehouseId, $itemId, $batchId)->sum('qty_reserved') ?? 0);
    }

    public function available(int $warehouseId, int $itemId, ?int $batchId = null): string
    {
        $row = $this->baseQuery($warehouseId, $itemId, $batchId)
            ->selectRaw('COALESCE(SUM(qty_on_hand - qty_reserved), 0) AS qty')
            ->value('qty');

        return Num::qty($row ?? 0);
    }

    /**
     * Company-wide position for an item, split the way a planner needs it.
     *
     * @return array{on_hand: string, reserved: string, available: string, in_transit: string, quarantine: string, damaged: string, in_vans: string, sellable: string}
     */
    public function position(int $itemId): array
    {
        $rows = DB::table('stock_balances as sb')
            ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
            ->where('sb.company_id', CompanyContext::idOrFail())
            ->where('sb.item_id', $itemId)
            ->groupBy('w.kind', 'w.is_sellable')
            ->selectRaw('w.kind, w.is_sellable, SUM(sb.qty_on_hand) AS on_hand, SUM(sb.qty_reserved) AS reserved')
            ->get();

        $out = [
            'on_hand' => '0', 'reserved' => '0', 'available' => '0', 'in_transit' => '0',
            'quarantine' => '0', 'damaged' => '0', 'in_vans' => '0', 'sellable' => '0',
        ];

        foreach ($rows as $row) {
            $onHand = Num::of($row->on_hand);
            $reserved = Num::of($row->reserved);

            $out['on_hand'] = Num::add($out['on_hand'], $onHand, Num::QTY_SCALE);
            $out['reserved'] = Num::add($out['reserved'], $reserved, Num::QTY_SCALE);

            match ($row->kind) {
                'transit' => $out['in_transit'] = Num::add($out['in_transit'], $onHand, Num::QTY_SCALE),
                'quarantine', 'inspection' => $out['quarantine'] = Num::add($out['quarantine'], $onHand, Num::QTY_SCALE),
                'damaged' => $out['damaged'] = Num::add($out['damaged'], $onHand, Num::QTY_SCALE),
                'van' => $out['in_vans'] = Num::add($out['in_vans'], $onHand, Num::QTY_SCALE),
                default => null,
            };

            $sellableKind = $row->is_sellable
                && ! in_array($row->kind, Warehouse::NON_SELLABLE_KINDS, true);

            if ($sellableKind) {
                $out['sellable'] = Num::add($out['sellable'], $onHand, Num::QTY_SCALE);
                $out['available'] = Num::add(
                    $out['available'],
                    Num::sub($onHand, $reserved, Num::QTY_SCALE),
                    Num::QTY_SCALE
                );
            }
        }

        return array_map(fn ($v) => Num::qty($v), $out);
    }

    /** Item card: every movement for an item with a running balance. */
    public function itemLedger(int $itemId, ?int $warehouseId, string $from, string $to): Collection
    {
        $q = DB::table('stock_movements as m')
            ->leftJoin('warehouses as w', 'w.id', '=', 'm.warehouse_id')
            ->leftJoin('batches as b', 'b.id', '=', 'm.batch_id')
            ->where('m.company_id', CompanyContext::idOrFail())
            ->where('m.item_id', $itemId)
            ->whereBetween('m.moved_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->orderBy('m.moved_at')
            ->orderBy('m.id')
            ->select([
                'm.id', 'm.moved_at', 'm.direction', 'm.qty_base', 'm.unit_cost', 'm.value',
                'm.doc_type', 'm.doc_id', 'm.reason', 'm.balance_after',
                'w.name as warehouse_name', 'b.code as batch_code',
            ]);

        if ($warehouseId) {
            $q->where('m.warehouse_id', $warehouseId);
        }

        $opening = $this->balanceBefore($itemId, $warehouseId, $from);
        $running = $opening;

        return $q->get()->map(function ($row) use (&$running) {
            $signed = $row->direction === 'in'
                ? Num::of($row->qty_base)
                : Num::neg($row->qty_base, Num::QTY_SCALE);
            $running = Num::add($running, $signed, Num::QTY_SCALE);
            $row->signed_qty = Num::qty($signed);
            $row->running_balance = Num::qty($running);

            return $row;
        })->prepend((object) [
            'id' => null,
            'moved_at' => $from.' 00:00:00',
            'direction' => null,
            'qty_base' => '0',
            'doc_type' => 'opening_balance',
            'signed_qty' => '0',
            'running_balance' => Num::qty($opening),
            'warehouse_name' => null,
            'batch_code' => null,
        ]);
    }

    public function balanceBefore(int $itemId, ?int $warehouseId, string $date): string
    {
        $q = DB::table('stock_movements')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('item_id', $itemId)
            ->where('moved_at', '<', $date.' 00:00:00');

        if ($warehouseId) {
            $q->where('warehouse_id', $warehouseId);
        }

        $row = $q->selectRaw("
            COALESCE(SUM(CASE WHEN direction = 'in' THEN qty_base ELSE 0 END), 0) AS qty_in,
            COALESCE(SUM(CASE WHEN direction = 'out' THEN qty_base ELSE 0 END), 0) AS qty_out
        ")->first();

        return Num::qty(Num::sub($row->qty_in, $row->qty_out, Num::QTY_SCALE));
    }

    /** Items at or below their reorder point, with what is already on order. */
    public function belowReorderPoint(?int $warehouseId = null): Collection
    {
        $companyId = CompanyContext::idOrFail();

        return DB::table('items as i')
            ->leftJoin('stock_balances as sb', function ($j) use ($warehouseId) {
                $j->on('sb.item_id', '=', 'i.id');
                if ($warehouseId) {
                    $j->where('sb.warehouse_id', '=', $warehouseId);
                }
            })
            ->leftJoin('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
            ->where('i.company_id', $companyId)
            ->where('i.status', 'active')
            ->whereNull('i.deleted_at')
            ->where('i.reorder_point', '>', 0)
            ->groupBy('i.id', 'i.code', 'i.name', 'i.reorder_point', 'i.reorder_qty', 'i.lead_time_days')
            ->havingRaw("COALESCE(SUM(CASE WHEN w.is_sellable AND w.kind NOT IN ('transit','quarantine','inspection','damaged') THEN sb.qty_on_hand - sb.qty_reserved ELSE 0 END), 0) <= i.reorder_point")
            ->selectRaw("
                i.id, i.code, i.name, i.reorder_point, i.reorder_qty, i.lead_time_days,
                COALESCE(SUM(CASE WHEN w.is_sellable AND w.kind NOT IN ('transit','quarantine','inspection','damaged') THEN sb.qty_on_hand - sb.qty_reserved ELSE 0 END), 0) AS available,
                (SELECT COALESCE(SUM(pol.qty_base - pol.qty_received_base), 0)
                   FROM purchase_order_lines pol
                   JOIN purchase_orders po ON po.id = pol.purchase_order_id
                  WHERE pol.item_id = i.id
                    AND po.company_id = i.company_id
                    AND po.status IN ('approved','partially_received')) AS on_order
            ")
            ->orderBy('i.code')
            ->get();
    }

    /** Batches nearing or past expiry, for the expiry watch report. */
    public function expiringBatches(int $withinDays = 60): Collection
    {
        return DB::table('stock_balances as sb')
            ->join('batches as b', 'b.id', '=', 'sb.batch_id')
            ->join('items as i', 'i.id', '=', 'sb.item_id')
            ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
            ->where('sb.company_id', CompanyContext::idOrFail())
            ->where('sb.qty_on_hand', '>', 0)
            ->whereNotNull('b.expiry_date')
            ->where('b.expiry_date', '<=', now()->addDays($withinDays)->toDateString())
            ->orderBy('b.expiry_date')
            ->select([
                'i.code as item_code', 'i.name as item_name', 'b.code as batch_code',
                'b.expiry_date', 'w.name as warehouse_name', 'sb.qty_on_hand',
                DB::raw("(b.expiry_date - CURRENT_DATE) AS days_left"),
            ])
            ->get();
    }

    /** Inventory valuation at the current moving average. */
    public function valuation(?int $warehouseId = null): Collection
    {
        $q = DB::table('stock_balances as sb')
            ->join('items as i', 'i.id', '=', 'sb.item_id')
            ->join('warehouses as w', 'w.id', '=', 'sb.warehouse_id')
            ->leftJoin('item_costs as ic', function ($j) {
                $j->on('ic.item_id', '=', 'sb.item_id')
                    ->on('ic.company_id', '=', 'sb.company_id');
            })
            ->where('sb.company_id', CompanyContext::idOrFail())
            ->where('sb.qty_on_hand', '<>', 0)
            ->groupBy('i.id', 'i.code', 'i.name', 'ic.avg_cost')
            ->selectRaw('
                i.id, i.code, i.name,
                COALESCE(ic.avg_cost, 0) AS avg_cost,
                SUM(sb.qty_on_hand) AS qty_on_hand,
                SUM(sb.qty_on_hand) * COALESCE(ic.avg_cost, 0) AS value
            ')
            ->orderBy('i.code');

        if ($warehouseId) {
            $q->where('sb.warehouse_id', $warehouseId);
        }

        return $q->get();
    }

    protected function baseQuery(int $warehouseId, int $itemId, ?int $batchId)
    {
        $q = DB::table('stock_balances')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('warehouse_id', $warehouseId)
            ->where('item_id', $itemId);

        if ($batchId !== null) {
            $q->where('batch_id', $batchId);
        }

        return $q;
    }
}
