<?php

namespace App\Domain\Inventory;

use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Exceptions\InsufficientStockException;
use App\Models\Batch;
use App\Models\Item;
use App\Models\ItemCost;
use App\Models\StockBalance;
use App\Models\StockMovement;
use App\Models\StockReservation;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The only component in the system that writes stock_balances, stock_movements
 * and item_costs. Everything else asks it to move goods.
 *
 * Concurrency: every issue and receipt takes a row lock on the balance row
 * before reading it (SELECT … FOR UPDATE). Two simultaneous sales of the last
 * carton therefore serialise — the second one sees the first one's result and
 * fails with InsufficientStockException, rather than both passing a check that
 * was true when they read it. The CHECK constraint on stock_balances is the
 * backstop if a future code path ever forgets the lock.
 *
 * Costing: moving weighted average, maintained per (company, item). Transfers
 * between warehouses are therefore cost-neutral, which is the point — moving
 * your own goods is not a profit event. Every outbound movement records the
 * average that applied at that instant, so historical margins are frozen.
 */
class InventoryService
{
    public function __construct(private readonly StockQuery $query) {}

    /**
     * Bring goods into a warehouse and roll the weighted average forward.
     *
     * @param  string  $unitCost  cost per BASE unit, excluding recoverable tax
     */
    public function receive(
        int $warehouseId,
        int $itemId,
        string $qtyBase,
        string $unitCost,
        string $docType,
        int $docId,
        ?int $docLineId = null,
        ?int $batchId = null,
        ?int $binId = null,
        ?\DateTimeInterface $movedAt = null,
        ?string $reason = null,
        bool $updateAverageCost = true,
    ): StockMovement {
        $this->assertInTransaction();
        $qtyBase = Num::qty($qtyBase);

        if (! Num::isPositive($qtyBase, Num::QTY_SCALE)) {
            throw DomainException::make('stock.invalid_quantity',
                'كمية الاستلام يجب أن تكون أكبر من صفر.', compact('itemId', 'qtyBase'));
        }

        $balance = $this->lockBalance($warehouseId, $itemId, $batchId, $binId);
        $newOnHand = Num::qty(Num::add($balance->qty_on_hand, $qtyBase));

        DB::table('stock_balances')->where('id', $balance->id)->update([
            'qty_on_hand' => $newOnHand,
            'updated_at' => now(),
        ]);

        if ($updateAverageCost) {
            $this->rollAverageCostIn($itemId, $qtyBase, $unitCost);
        }

        return $this->writeMovement(
            'in', $warehouseId, $itemId, $qtyBase, $unitCost, $docType, $docId,
            $docLineId, $batchId, $binId, $movedAt, $reason, $newOnHand
        );
    }

    /**
     * Take goods out of a warehouse at the cost currently on the books.
     *
     * The caller does not choose the cost: it is read under the same lock that
     * guards the quantity, so a concurrent receipt cannot change the average
     * between the two reads.
     */
    public function issue(
        int $warehouseId,
        int $itemId,
        string $qtyBase,
        string $docType,
        int $docId,
        ?int $docLineId = null,
        ?int $batchId = null,
        ?int $binId = null,
        ?\DateTimeInterface $movedAt = null,
        ?string $reason = null,
        ?string $forcedUnitCost = null,
        bool $allowReservedConsumption = false,
    ): StockMovement {
        $this->assertInTransaction();
        $qtyBase = Num::qty($qtyBase);

        if (! Num::isPositive($qtyBase, Num::QTY_SCALE)) {
            throw DomainException::make('stock.invalid_quantity',
                'كمية الصرف يجب أن تكون أكبر من صفر.', compact('itemId', 'qtyBase'));
        }

        $balance = $this->lockBalance($warehouseId, $itemId, $batchId, $binId);

        // Reserved stock is spoken for. Only the document holding the reservation
        // may draw on it, and it says so by passing allowReservedConsumption.
        $usable = $allowReservedConsumption
            ? (string) $balance->qty_on_hand
            : Num::sub($balance->qty_on_hand, $balance->qty_reserved, Num::QTY_SCALE);

        if (Num::cmp($usable, $qtyBase, Num::QTY_SCALE) < 0) {
            $item = Item::withoutGlobalScope('company')->find($itemId);
            throw new InsufficientStockException(
                $itemId, $item?->name ?? (string) $itemId, $warehouseId,
                $qtyBase, Num::qty($usable), $batchId
            );
        }

        $unitCost = $forcedUnitCost !== null
            ? Num::of($forcedUnitCost)
            : $this->currentAverageCost($itemId);

        $newOnHand = Num::qty(Num::sub($balance->qty_on_hand, $qtyBase));

        DB::table('stock_balances')->where('id', $balance->id)->update([
            'qty_on_hand' => $newOnHand,
            'updated_at' => now(),
        ]);

        $this->rollAverageCostOut($itemId, $qtyBase, $unitCost);

        return $this->writeMovement(
            'out', $warehouseId, $itemId, $qtyBase, $unitCost, $docType, $docId,
            $docLineId, $batchId, $binId, $movedAt, $reason, $newOnHand
        );
    }

    /**
     * Move goods out of one warehouse and into another at unchanged cost.
     *
     * Used for the two legs of a transfer (source → transit, transit →
     * destination) and for van loading. Because the average cost is held per
     * item rather than per warehouse, a transfer produces no cost effect and no
     * profit; the out and in legs carry the same unit cost.
     */
    public function move(
        int $fromWarehouseId,
        int $toWarehouseId,
        int $itemId,
        string $qtyBase,
        string $docType,
        int $docId,
        ?int $docLineId = null,
        ?int $batchId = null,
        ?\DateTimeInterface $movedAt = null,
        ?string $reason = null,
        bool $allowReservedConsumption = false,
    ): array {
        $this->assertInTransaction();

        if ($fromWarehouseId === $toWarehouseId) {
            throw DomainException::make('stock.same_warehouse',
                'لا يمكن التحويل إلى نفس المخزن.', compact('fromWarehouseId'));
        }

        $out = $this->issue(
            $fromWarehouseId, $itemId, $qtyBase, $docType, $docId, $docLineId,
            $batchId, null, $movedAt, $reason ?? 'transfer_out',
            null, $allowReservedConsumption
        );

        $in = $this->receive(
            $toWarehouseId, $itemId, $qtyBase, (string) $out->unit_cost, $docType, $docId,
            $docLineId, $batchId, null, $movedAt, $reason ?? 'transfer_in',
            updateAverageCost: false,   // the goods never left the company
        );

        return ['out' => $out, 'in' => $in];
    }

    /**
     * Hold quantity against a document without moving it.
     *
     * Reservations are what make `available` smaller than `on hand`, and they
     * are written under the same row lock as a movement so a reservation and a
     * sale cannot both claim the last unit.
     */
    public function reserve(
        int $warehouseId,
        int $itemId,
        string $qtyBase,
        string $docType,
        int $docId,
        ?int $docLineId = null,
        ?int $batchId = null,
        ?\DateTimeInterface $expiresAt = null,
    ): StockReservation {
        $this->assertInTransaction();
        $qtyBase = Num::qty($qtyBase);

        $balance = $this->lockBalance($warehouseId, $itemId, $batchId, null);
        $available = Num::sub($balance->qty_on_hand, $balance->qty_reserved, Num::QTY_SCALE);

        if (Num::cmp($available, $qtyBase, Num::QTY_SCALE) < 0) {
            $item = Item::withoutGlobalScope('company')->find($itemId);
            throw new InsufficientStockException(
                $itemId, $item?->name ?? (string) $itemId, $warehouseId,
                $qtyBase, Num::qty($available), $batchId
            );
        }

        DB::table('stock_balances')->where('id', $balance->id)->update([
            'qty_reserved' => Num::qty(Num::add($balance->qty_reserved, $qtyBase)),
            'updated_at' => now(),
        ]);

        return StockReservation::create([
            'company_id' => CompanyContext::idOrFail(),
            'warehouse_id' => $warehouseId,
            'item_id' => $itemId,
            'batch_id' => $batchId,
            'qty_base' => $qtyBase,
            'doc_type' => $docType,
            'doc_id' => $docId,
            'doc_line_id' => $docLineId,
            'status' => 'active',
            'expires_at' => $expiresAt,
        ]);
    }

    /** Release a held quantity, either because it was consumed or cancelled. */
    public function release(StockReservation $reservation, ?string $qtyBase = null, string $status = 'released'): void
    {
        $this->assertInTransaction();

        if ($reservation->status !== 'active') {
            return;
        }

        $qty = Num::qty($qtyBase ?? $reservation->qty_base);
        $qty = Num::min($qty, (string) $reservation->qty_base);

        $balance = $this->lockBalance(
            $reservation->warehouse_id, $reservation->item_id, $reservation->batch_id, null
        );

        DB::table('stock_balances')->where('id', $balance->id)->update([
            'qty_reserved' => Num::qty(Num::max('0', Num::sub($balance->qty_reserved, $qty))),
            'updated_at' => now(),
        ]);

        $remaining = Num::qty(Num::sub($reservation->qty_base, $qty));
        $reservation->forceFill([
            'qty_base' => $remaining,
            'status' => Num::isPositive($remaining, Num::QTY_SCALE) ? 'active' : $status,
        ])->save();
    }

    /** Release every active reservation a document holds. */
    public function releaseFor(string $docType, int $docId, string $status = 'released'): void
    {
        StockReservation::query()
            ->where('doc_type', $docType)
            ->where('doc_id', $docId)
            ->where('status', 'active')
            ->get()
            ->each(fn (StockReservation $r) => $this->release($r, null, $status));
    }

    /**
     * Pick batches for an outbound quantity, nearest-expiry first (FEFO).
     *
     * Batches that are expired, or that fall below the item's minimum remaining
     * shelf life for sale, are skipped rather than silently sold.
     *
     * @return Collection<int, array{batch_id: int|null, qty_base: string}>
     */
    public function allocateBatches(
        int $warehouseId,
        Item $item,
        string $qtyBase,
        ?\DateTimeInterface $asOf = null,
        bool $forSale = true,
    ): Collection {
        if (! $item->track_batches) {
            return collect([['batch_id' => null, 'qty_base' => Num::qty($qtyBase)]]);
        }

        $asOf = $asOf ?? now();
        $minShelfLife = (int) ($item->min_shelf_life_sale_days ?? 0);

        $rows = DB::table('stock_balances as sb')
            ->leftJoin('batches as b', 'b.id', '=', 'sb.batch_id')
            ->where('sb.warehouse_id', $warehouseId)
            ->where('sb.item_id', $item->id)
            ->whereRaw('sb.qty_on_hand - sb.qty_reserved > 0')
            ->select('sb.batch_id', 'sb.qty_on_hand', 'sb.qty_reserved', 'b.expiry_date', 'b.status')
            ->orderByRaw('b.expiry_date ASC NULLS LAST')
            ->orderBy('sb.batch_id')
            ->get();

        $remaining = Num::qty($qtyBase);
        $picks = collect();

        foreach ($rows as $row) {
            if (! Num::isPositive($remaining, Num::QTY_SCALE)) {
                break;
            }
            if ($forSale && $row->status !== null && $row->status !== 'ok') {
                continue;
            }
            if ($forSale && $row->expiry_date !== null) {
                $expiry = \Illuminate\Support\Carbon::parse($row->expiry_date);
                if ($expiry->lte($asOf) || $expiry->lt((clone $asOf)->modify("+{$minShelfLife} days"))) {
                    continue;
                }
            }

            $free = Num::sub($row->qty_on_hand, $row->qty_reserved, Num::QTY_SCALE);
            $take = Num::min($free, $remaining);

            if (Num::isPositive($take, Num::QTY_SCALE)) {
                $picks->push(['batch_id' => $row->batch_id, 'qty_base' => Num::qty($take)]);
                $remaining = Num::qty(Num::sub($remaining, $take));
            }
        }

        if (Num::isPositive($remaining, Num::QTY_SCALE)) {
            throw new InsufficientStockException(
                $item->id, $item->name, $warehouseId,
                Num::qty($qtyBase), Num::qty(Num::sub($qtyBase, $remaining))
            );
        }

        return $picks;
    }

    /** Current moving weighted average cost per base unit. */
    public function currentAverageCost(int $itemId): string
    {
        $row = DB::table('item_costs')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('item_id', $itemId)
            ->first();

        return $row ? Num::of($row->avg_cost) : '0';
    }

    /**
     * Apply a late cost (e.g. freight arriving after part of the goods sold).
     *
     * The portion still in stock lifts the average; the portion already sold is
     * handed back so the caller can post it to COGS. History is not rewritten.
     *
     * @return array{to_inventory: string, to_cogs: string}
     */
    public function applyLateCost(int $itemId, string $amount, string $qtyStillOnHand, string $qtyOriginal): array
    {
        $this->assertInTransaction();

        if (! Num::isPositive($qtyOriginal)) {
            return ['to_inventory' => '0', 'to_cogs' => Num::money($amount)];
        }

        $onHandShare = Num::div($qtyStillOnHand, $qtyOriginal);
        $toInventory = Num::money(Num::mul($amount, $onHandShare));
        $toCogs = Num::money(Num::sub($amount, $toInventory, Num::MONEY_SCALE));

        if (Num::isPositive($toInventory, Num::MONEY_SCALE)) {
            $cost = $this->lockItemCost($itemId);
            $newValue = Num::add($cost->total_value, $toInventory);
            $newAvg = Num::isPositive($cost->qty_on_hand, Num::QTY_SCALE)
                ? Num::div($newValue, $cost->qty_on_hand)
                : Num::of($cost->avg_cost);

            DB::table('item_costs')->where('id', $cost->id)->update([
                'total_value' => Num::round($newValue, 4),
                'avg_cost' => Num::round($newAvg, 8),
                'updated_at' => now(),
            ]);
        }

        return ['to_inventory' => $toInventory, 'to_cogs' => $toCogs];
    }

    /** Total quantity of an item on hand across every warehouse. */
    public function currentOnHandForItem(int $itemId): string
    {
        $row = DB::table('item_costs')
            ->where('company_id', CompanyContext::idOrFail())
            ->where('item_id', $itemId)
            ->first();

        return $row ? Num::qty($row->qty_on_hand) : '0';
    }

    /** Available-to-promise for a warehouse, honouring reservations. */
    public function available(int $warehouseId, int $itemId, ?int $batchId = null): string
    {
        return $this->query->available($warehouseId, $itemId, $batchId);
    }

    // ---------------------------------------------------------------- internals

    protected function writeMovement(
        string $direction, int $warehouseId, int $itemId, string $qtyBase, string $unitCost,
        string $docType, int $docId, ?int $docLineId, ?int $batchId, ?int $binId,
        ?\DateTimeInterface $movedAt, ?string $reason, string $balanceAfter,
    ): StockMovement {
        return StockMovement::create([
            'company_id' => CompanyContext::idOrFail(),
            'warehouse_id' => $warehouseId,
            'item_id' => $itemId,
            'batch_id' => $batchId,
            'bin_id' => $binId,
            'direction' => $direction,
            'qty_base' => $qtyBase,
            'unit_cost' => Num::round($unitCost, 8),
            'value' => Num::round(Num::mul($qtyBase, $unitCost), 4),
            'balance_after' => $balanceAfter,
            'doc_type' => $docType,
            'doc_id' => $docId,
            'doc_line_id' => $docLineId,
            'reason' => $reason,
            'moved_at' => $movedAt ?? now(),
            'created_by' => auth()->id(),
            'created_at' => now(),
        ]);
    }

    /**
     * Fetch the balance row with a write lock, creating it if absent.
     *
     * The insert races against a concurrent insert of the same key; the partial
     * unique index turns that race into a constraint violation, which we absorb
     * by re-reading under the lock.
     */
    protected function lockBalance(int $warehouseId, int $itemId, ?int $batchId, ?int $binId): object
    {
        $companyId = CompanyContext::idOrFail();

        $select = fn () => DB::table('stock_balances')
            ->where('company_id', $companyId)
            ->where('warehouse_id', $warehouseId)
            ->where('item_id', $itemId)
            ->whereRaw('COALESCE(batch_id, 0) = ?', [$batchId ?? 0])
            ->whereRaw('COALESCE(bin_id, 0) = ?', [$binId ?? 0])
            ->lockForUpdate()
            ->first();

        if ($row = $select()) {
            return $row;
        }

        try {
            DB::table('stock_balances')->insert([
                'company_id' => $companyId,
                'warehouse_id' => $warehouseId,
                'item_id' => $itemId,
                'batch_id' => $batchId,
                'bin_id' => $binId,
                'qty_on_hand' => 0,
                'qty_reserved' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            // Another transaction created it first; fall through and re-read.
        }

        $row = $select();

        if (! $row) {
            throw DomainException::make('stock.balance_unavailable',
                'تعذر تجهيز سجل الرصيد للصنف.', compact('warehouseId', 'itemId', 'batchId'));
        }

        return $row;
    }

    protected function lockItemCost(int $itemId): object
    {
        $companyId = CompanyContext::idOrFail();

        $select = fn () => DB::table('item_costs')
            ->where('company_id', $companyId)
            ->where('item_id', $itemId)
            ->lockForUpdate()
            ->first();

        if ($row = $select()) {
            return $row;
        }

        try {
            DB::table('item_costs')->insert([
                'company_id' => $companyId,
                'item_id' => $itemId,
                'qty_on_hand' => 0,
                'avg_cost' => 0,
                'total_value' => 0,
                'last_purchase_cost' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            // Concurrent insert — re-read below.
        }

        return $select();
    }

    /**
     * new_avg = (old_qty * old_avg + in_qty * in_cost) / (old_qty + in_qty)
     *
     * When the prior quantity is zero or negative the incoming cost simply
     * becomes the average; averaging against a non-positive base is meaningless.
     */
    protected function rollAverageCostIn(int $itemId, string $qtyBase, string $unitCost): void
    {
        $cost = $this->lockItemCost($itemId);

        $oldQty = Num::of($cost->qty_on_hand);
        $newQty = Num::add($oldQty, $qtyBase, Num::QTY_SCALE);
        $addedValue = Num::mul($qtyBase, $unitCost);

        if (Num::isPositive($oldQty, Num::QTY_SCALE)) {
            $newValue = Num::add($cost->total_value, $addedValue);
        } else {
            $newValue = $addedValue;
        }

        $newAvg = Num::isPositive($newQty, Num::QTY_SCALE)
            ? Num::div($newValue, $newQty)
            : Num::of($unitCost);

        DB::table('item_costs')->where('id', $cost->id)->update([
            'qty_on_hand' => Num::qty($newQty),
            'total_value' => Num::round($newValue, 4),
            'avg_cost' => Num::round($newAvg, 8),
            'last_purchase_cost' => Num::round($unitCost, 8),
            'updated_at' => now(),
        ]);
    }

    /** Outbound leaves the average untouched and reduces quantity and value. */
    protected function rollAverageCostOut(int $itemId, string $qtyBase, string $unitCost): void
    {
        $cost = $this->lockItemCost($itemId);

        $newQty = Num::sub($cost->qty_on_hand, $qtyBase, Num::QTY_SCALE);
        $newValue = Num::sub($cost->total_value, Num::mul($qtyBase, $unitCost));

        // Guard against drift leaving a value behind on a zero quantity.
        if (! Num::isPositive($newQty, Num::QTY_SCALE)) {
            $newQty = Num::qty(Num::max('0', $newQty));
            $newValue = '0';
        }

        DB::table('item_costs')->where('id', $cost->id)->update([
            'qty_on_hand' => Num::qty($newQty),
            'total_value' => Num::round($newValue, 4),
            'updated_at' => now(),
        ]);
    }

    /**
     * Stock changes are only ever valid as part of a document's transaction.
     * Calling one of these outside a transaction is a programming error, not a
     * runtime condition, so it fails loudly.
     */
    protected function assertInTransaction(): void
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException(
                'InventoryService must be called inside a database transaction.'
            );
        }
    }
}
