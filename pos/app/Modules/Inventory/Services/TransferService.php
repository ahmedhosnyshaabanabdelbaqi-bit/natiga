<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Services;

use App\Modules\Access\Services\AuditService;
use App\Modules\Catalog\Models\ProductUnit;
use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SequenceService;
use App\Modules\Inventory\Models\StockTransfer;
use App\Modules\Inventory\Models\StockTransferLine;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;

/**
 * Warehouse-to-warehouse transfers.
 *
 * Stock leaves the source when the transfer is SENT and arrives at the
 * destination when it is RECEIVED. In between it sits in a transit warehouse, so
 * the same quantity is never counted in two places at once.
 *
 * Goods are received at the cost they left with, so moving stock around does not
 * invent or destroy value.
 */
class TransferService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly SequenceService $sequences,
        private readonly AuditService $audit,
        private readonly PosContext $context,
    ) {}

    /** @param array<string,mixed> $data */
    public function create(array $data): StockTransfer
    {
        return DB::transaction(function () use ($data): StockTransfer {
            $transfer = StockTransfer::query()->create([
                'number' => $this->sequences->next('stock_transfer'),
                'from_warehouse_id' => $data['from_warehouse_id'],
                'to_warehouse_id' => $data['to_warehouse_id'],
                'status' => 'draft',
                'created_by' => $this->context->userId(),
                'notes' => $data['notes'] ?? null,
            ]);

            foreach ($data['lines'] as $line) {
                $productUnit = ProductUnit::query()->findOrFail($line['product_unit_id']);
                $qtyBase = Quantity::of($line['qty'])->multipliedBy((string) $productUnit->factor);

                StockTransferLine::query()->create([
                    'stock_transfer_id' => $transfer->id,
                    'variant_id' => $line['variant_id'],
                    'product_unit_id' => $productUnit->id,
                    'qty_sent_base' => $qtyBase->toString(),
                    'qty_received_base' => '0',
                    'unit_cost' => '0',
                ]);
            }

            return $transfer->load('lines');
        });
    }

    public function send(int $transferId): StockTransfer
    {
        return DB::transaction(function () use ($transferId): StockTransfer {
            $transfer = StockTransfer::query()->with('lines')->whereKey($transferId)->lockForUpdate()->firstOrFail();

            if ($transfer->status !== 'draft') {
                throw new InvalidOperationException('تم إرسال هذا التحويل بالفعل.', 'transfer_already_sent', 409);
            }

            $transit = $this->transitWarehouse($transfer);

            foreach ($transfer->lines as $line) {
                $variant = ProductVariant::query()->with('product')->findOrFail($line->variant_id);
                $qty = Quantity::of($line->qty_sent_base);

                $out = $this->inventory->record(
                    warehouseId: (int) $transfer->from_warehouse_id,
                    variant: $variant,
                    qtyBase: $qty->negated(),
                    reason: InventoryService::REASON_TRANSFER_OUT,
                    sourceType: StockTransfer::class,
                    sourceId: $transfer->id,
                    sourceLineId: $line->id,
                    productUnitId: $line->product_unit_id,
                );

                $cost = Money::of($out->unit_cost);
                $line->forceFill(['unit_cost' => $cost->toString(6)])->save();

                // Park it in transit: owned by us, not available in either shop.
                $this->inventory->record(
                    warehouseId: $transit->id,
                    variant: $variant,
                    qtyBase: $qty,
                    reason: InventoryService::REASON_TRANSFER_OUT,
                    unitCost: $cost,
                    sourceType: StockTransfer::class,
                    sourceId: $transfer->id,
                    sourceLineId: $line->id,
                    productUnitId: $line->product_unit_id,
                    note: 'مخزون بالطريق',
                );
            }

            $transfer->forceFill([
                'status' => 'sent',
                'sent_at' => now(),
                'sent_by' => $this->context->userId(),
            ])->save();

            $this->audit->log('stock_transfer.sent', $transfer, null, ['number' => $transfer->number]);

            return $transfer->refresh()->load('lines');
        });
    }

    /** @param list<array{line_id:int, qty_base:string}> $lines */
    public function receive(int $transferId, array $lines): StockTransfer
    {
        return DB::transaction(function () use ($transferId, $lines): StockTransfer {
            $transfer = StockTransfer::query()->with('lines')->whereKey($transferId)->lockForUpdate()->firstOrFail();

            if (! in_array($transfer->status, ['sent', 'partially_received'], true)) {
                throw new InvalidOperationException('لا يمكن استلام هذا التحويل في حالته الحالية.', 'transfer_not_receivable', 409);
            }

            $transit = $this->transitWarehouse($transfer);

            foreach ($lines as $input) {
                $line = StockTransferLine::query()
                    ->where('stock_transfer_id', $transfer->id)
                    ->whereKey($input['line_id'])
                    ->firstOrFail();

                $qty = Quantity::of($input['qty_base']);

                // Atomic guard: cannot receive more than was sent.
                $claimed = DB::update(
                    'UPDATE stock_transfer_lines
                        SET qty_received_base = qty_received_base + ?, updated_at = now()
                      WHERE id = ? AND qty_received_base + ? <= qty_sent_base',
                    [$qty->toString(), $line->id, $qty->toString()],
                );

                if ($claimed === 0) {
                    throw new InvalidOperationException(
                        'الكمية المستلمة تتجاوز الكمية المرسلة.',
                        'receipt_exceeds_sent',
                        422,
                        ['line_id' => $line->id],
                    );
                }

                $variant = ProductVariant::query()->with('product')->findOrFail($line->variant_id);
                $cost = Money::of($line->unit_cost);

                $this->inventory->record(
                    warehouseId: $transit->id,
                    variant: $variant,
                    qtyBase: $qty->negated(),
                    reason: InventoryService::REASON_TRANSFER_IN,
                    unitCost: $cost,
                    sourceType: StockTransfer::class,
                    sourceId: $transfer->id,
                    sourceLineId: $line->id,
                    note: 'خروج من مخزون الطريق',
                );

                $this->inventory->record(
                    warehouseId: (int) $transfer->to_warehouse_id,
                    variant: $variant,
                    qtyBase: $qty,
                    reason: InventoryService::REASON_TRANSFER_IN,
                    unitCost: $cost,
                    sourceType: StockTransfer::class,
                    sourceId: $transfer->id,
                    sourceLineId: $line->id,
                    productUnitId: $line->product_unit_id,
                );
            }

            $transfer->load('lines');
            $complete = $transfer->lines->every(
                fn (StockTransferLine $l) => Quantity::of($l->qty_received_base)->compareTo(Quantity::of($l->qty_sent_base)) >= 0
            );

            $transfer->forceFill([
                'status' => $complete ? 'received' : 'partially_received',
                'received_at' => $complete ? now() : null,
                'received_by' => $this->context->userId(),
            ])->save();

            $this->audit->log('stock_transfer.received', $transfer, null, [
                'number' => $transfer->number,
                'complete' => $complete,
            ]);

            return $transfer->refresh()->load('lines');
        });
    }

    /** A per-branch transit location, created on demand. */
    private function transitWarehouse(StockTransfer $transfer): Warehouse
    {
        $branchId = (int) Warehouse::query()->whereKey($transfer->from_warehouse_id)->value('branch_id');

        return Warehouse::query()->firstOrCreate(
            ['code' => 'WH-TRANSIT-'.$branchId],
            [
                'branch_id' => $branchId,
                'name' => 'مخزون بالطريق',
                'type' => 'transit',
                'is_sellable' => false,
                'is_default' => false,
                'is_active' => true,
            ],
        );
    }
}
