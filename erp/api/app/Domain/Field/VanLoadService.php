<?php

namespace App\Domain\Field;

use App\Domain\Inventory\InventoryService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\StockTransfer;
use App\Models\StockTransferLine;
use App\Models\VanLoad;
use App\Models\VanLoadLine;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Loading a van, reloading it mid-day, returning stock, and van-to-van moves.
 *
 * Loading is a TRANSFER into the van's own warehouse — never a sale. No revenue,
 * no customer, no profit; the goods are still the company's until a customer
 * buys them. Because the van has its own warehouse, the rep's stock is a real
 * balance that can be counted, reserved against and reconciled, which is what
 * the end-of-day goods equation needs.
 *
 * The two legs go through a transit warehouse when one is configured, so goods
 * are never in both the source warehouse and the van at the same time.
 */
class VanLoadService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * @param  array<int, array{item_id: int, item_unit_id?: int|null, qty: string, batch_id?: int|null}>  $lines
     */
    public function create(array $header, array $lines): VanLoad
    {
        return DB::transaction(function () use ($header, $lines) {
            $vehicle = Vehicle::findOrFail($header['vehicle_id']);
            $vanWarehouse = $this->vanWarehouseFor($vehicle);
            $fromWarehouse = Warehouse::findOrFail($header['from_warehouse_id']);

            if ($fromWarehouse->id === $vanWarehouse->id) {
                throw DomainException::make('field.van_same_warehouse',
                    'مخزن المصدر لا يمكن أن يكون مخزن السيارة نفسه.',
                    ['vehicle_id' => $vehicle->id]);
            }

            $load = VanLoad::create([
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('van_load'),
                'load_date' => $header['load_date'] ?? now()->toDateString(),
                'vehicle_id' => $vehicle->id,
                'rep_id' => $header['rep_id'],
                'driver_id' => $header['driver_id'] ?? null,
                'from_warehouse_id' => $fromWarehouse->id,
                'van_warehouse_id' => $vanWarehouse->id,
                'kind' => $header['kind'] ?? 'load',
                'counterpart_vehicle_id' => $header['counterpart_vehicle_id'] ?? null,
                'status' => 'draft',
                'issued_by' => auth()->id(),
                'notes' => $header['notes'] ?? null,
            ]);

            foreach ($lines as $input) {
                $item = Item::findOrFail($input['item_id']);
                $itemUnit = isset($input['item_unit_id'])
                    ? ItemUnit::where('item_id', $item->id)->findOrFail($input['item_unit_id'])
                    : $this->defaultUnit($item);

                $qtyInput = Num::qty($input['qty']);

                VanLoadLine::create([
                    'van_load_id' => $load->id,
                    'item_id' => $item->id,
                    'batch_id' => $input['batch_id'] ?? null,
                    'item_unit_id' => $itemUnit->id,
                    'unit_factor' => $itemUnit->factor,
                    'qty_input' => $qtyInput,
                    'qty_base' => Num::qty($itemUnit->toBase($qtyInput)),
                    'scanned' => $input['scanned'] ?? false,
                ]);
            }

            return $load->fresh(['lines']);
        });
    }

    /**
     * Issue the load: goods leave the warehouse for transit (or straight to the
     * van when no transit warehouse is configured).
     */
    public function issue(VanLoad $load): VanLoad
    {
        return DB::transaction(function () use ($load) {
            $load = VanLoad::with('lines.item')->lockForUpdate()->findOrFail($load->id);

            if ($load->status !== 'draft') {
                throw DomainException::make('field.van_load_already_issued',
                    "أمر التحميل «{$load->code}» تم صرفه بالفعل.", ['status' => $load->status]);
            }
            if ($load->lines->isEmpty()) {
                throw DomainException::make('field.van_load_empty',
                    'لا يمكن صرف أمر تحميل بدون أصناف.', ['load_id' => $load->id]);
            }

            $transit = $this->transitWarehouse();

            $transfer = StockTransfer::create([
                'company_id' => $load->company_id,
                'code' => $this->numbering->next('stock_transfer'),
                'from_warehouse_id' => $load->from_warehouse_id,
                'to_warehouse_id' => $load->van_warehouse_id,
                'transit_warehouse_id' => $transit?->id,
                'transfer_date' => $load->load_date,
                'purpose' => $load->kind === 'return' ? 'van_return' : 'van_load',
                'status' => 'issued',
                'issued_by' => auth()->id(),
                'issued_at' => now(),
                'notes' => "أمر تحميل {$load->code}",
            ]);

            foreach ($load->lines as $line) {
                $item = $line->item;

                // Pick nearest-expiry batches when the item is tracked and the
                // loader did not name one.
                $picks = ($item->track_batches && ! $line->batch_id)
                    ? $this->inventory->allocateBatches(
                        $load->from_warehouse_id, $item, (string) $line->qty_base, $load->load_date)
                    : collect([['batch_id' => $line->batch_id, 'qty_base' => (string) $line->qty_base]]);

                $unitCost = '0';

                foreach ($picks as $pick) {
                    $result = $this->inventory->move(
                        fromWarehouseId: $load->from_warehouse_id,
                        toWarehouseId: $transit?->id ?? $load->van_warehouse_id,
                        itemId: $item->id,
                        qtyBase: $pick['qty_base'],
                        docType: 'van_load',
                        docId: $load->id,
                        docLineId: $line->id,
                        batchId: $pick['batch_id'],
                        movedAt: $load->load_date,
                        reason: 'van_load_issue',
                    );
                    $unitCost = (string) $result['out']->unit_cost;

                    StockTransferLine::create([
                        'stock_transfer_id' => $transfer->id,
                        'item_id' => $item->id,
                        'batch_id' => $pick['batch_id'],
                        'item_unit_id' => $line->item_unit_id,
                        'unit_factor' => $line->unit_factor,
                        'qty_input' => Num::qty(Num::div($pick['qty_base'], $line->unit_factor, Num::QTY_SCALE)),
                        'qty_base' => $pick['qty_base'],
                        'unit_cost' => $unitCost,
                    ]);
                }

                $line->forceFill(['unit_cost' => $unitCost])->save();
            }

            $load->forceFill([
                'status' => 'issued',
                'stock_transfer_id' => $transfer->id,
            ])->save();

            // No transit warehouse configured: the goods are already in the van.
            if (! $transit) {
                $transfer->forceFill(['status' => 'received', 'received_at' => now()])->save();
                $this->markLinesReceived($load);
                $load->forceFill(['status' => 'received', 'received_by' => $load->rep_id])->save();
            } else {
                $transfer->forceFill(['status' => 'in_transit'])->save();
            }

            return $load->fresh(['lines']);
        });
    }

    /**
     * The rep confirms what actually arrived on the van.
     *
     * A shortfall stays in transit rather than vanishing — somebody has to
     * account for it.
     *
     * @param  array<int, array{line_id: int, qty_received_base: string}>|null  $confirmations
     */
    public function receive(VanLoad $load, ?array $confirmations = null): VanLoad
    {
        return DB::transaction(function () use ($load, $confirmations) {
            $load = VanLoad::with('lines')->lockForUpdate()->findOrFail($load->id);

            if ($load->status === 'received') {
                return $load;
            }
            if ($load->status !== 'issued') {
                throw DomainException::make('field.van_load_not_issued',
                    "أمر التحميل «{$load->code}» غير مصروف بعد.", ['status' => $load->status]);
            }

            $transit = $this->transitWarehouse();

            if (! $transit) {
                return $load;   // already delivered directly at issue time
            }

            $byId = collect($confirmations ?? [])->keyBy('line_id');

            foreach ($load->lines as $line) {
                $qty = Num::min(
                    Num::qty($byId->get($line->id)['qty_received_base'] ?? (string) $line->qty_base),
                    (string) $line->qty_base
                );

                if (! Num::isPositive($qty, Num::QTY_SCALE)) {
                    continue;
                }

                $this->inventory->move(
                    fromWarehouseId: $transit->id,
                    toWarehouseId: $load->van_warehouse_id,
                    itemId: $line->item_id,
                    qtyBase: $qty,
                    docType: 'van_load',
                    docId: $load->id,
                    docLineId: $line->id,
                    batchId: $line->batch_id,
                    movedAt: $load->load_date,
                    reason: 'van_load_receive',
                );

                $line->forceFill(['qty_received_base' => $qty])->save();
            }

            $load->forceFill([
                'status' => 'received',
                'received_by' => auth()->id(),
            ])->save();

            if ($transfer = $load->stockTransfer) {
                $shortfall = $load->lines->contains(
                    fn ($l) => Num::cmp($l->qty_received_base, $l->qty_base, Num::QTY_SCALE) < 0
                );
                $transfer->forceFill([
                    'status' => $shortfall ? 'partially_received' : 'received',
                    'received_by' => auth()->id(),
                    'received_at' => now(),
                ])->save();
            }

            return $load->fresh(['lines']);
        });
    }

    /**
     * Send stock back from the van to a warehouse at end of day.
     *
     * Modelled as a load in the opposite direction so the same transfer and
     * movement records describe it; the day-close equation reads it as
     * "returned to warehouse".
     */
    public function returnToWarehouse(Vehicle $vehicle, int $repId, int $toWarehouseId, array $lines): VanLoad
    {
        $vanWarehouse = $this->vanWarehouseFor($vehicle);

        $load = $this->create([
            'vehicle_id' => $vehicle->id,
            'rep_id' => $repId,
            'from_warehouse_id' => $vanWarehouse->id,
            'kind' => 'return',
        ], $lines);

        // Swap the direction: out of the van, into the warehouse.
        $load->forceFill([
            'from_warehouse_id' => $vanWarehouse->id,
            'van_warehouse_id' => $toWarehouseId,
        ])->save();

        return $this->receive($this->issue($load->fresh()));
    }

    /** Each vehicle owns exactly one van warehouse; it is created on first use. */
    public function vanWarehouseFor(Vehicle $vehicle): Warehouse
    {
        $warehouse = Warehouse::query()->where('vehicle_id', $vehicle->id)->where('kind', 'van')->first();

        if ($warehouse) {
            return $warehouse;
        }

        return Warehouse::create([
            'company_id' => $vehicle->company_id,
            'branch_id' => $vehicle->branch_id,
            'code' => 'VAN-'.$vehicle->code,
            'name' => 'مخزن السيارة '.($vehicle->plate_no ?: $vehicle->code),
            'kind' => 'van',
            // Van stock is real and sellable from the van, but it is deliberately
            // excluded from warehouse availability by its kind wherever the
            // question is "what can the office promise a customer".
            'is_sellable' => true,
            'vehicle_id' => $vehicle->id,
            'is_active' => true,
        ]);
    }

    protected function transitWarehouse(): ?Warehouse
    {
        return Warehouse::query()->where('kind', 'transit')->where('is_active', true)->first();
    }

    protected function markLinesReceived(VanLoad $load): void
    {
        foreach ($load->lines as $line) {
            $line->forceFill(['qty_received_base' => $line->qty_base])->save();
        }
    }

    protected function defaultUnit(Item $item): ItemUnit
    {
        return ItemUnit::where('item_id', $item->id)
            ->orderByDesc('is_base')
            ->firstOr(fn () => throw DomainException::make('items.no_unit',
                "الصنف «{$item->name}» ليس له وحدة معرّفة.", ['item_id' => $item->id]));
    }
}
