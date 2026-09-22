<?php

declare(strict_types=1);

namespace App\Modules\Purchasing\Services;

use App\Modules\Access\Services\AuditService;
use App\Modules\Accounting\Services\PostingService;
use App\Modules\Catalog\Models\Batch;
use App\Modules\Catalog\Models\ProductUnit;
use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Catalog\Services\SerialService;
use App\Modules\Core\Services\BusinessCalendar;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SequenceService;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Purchasing\Models\GoodsReceipt;
use App\Modules\Purchasing\Models\GoodsReceiptLine;
use App\Modules\Purchasing\Models\PurchaseOrder;
use App\Modules\Purchasing\Models\PurchaseOrderLine;
use App\Modules\Purchasing\Models\Supplier;
use App\Modules\Purchasing\Models\SupplierLedgerEntry;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;

/**
 * Purchasing.
 *
 * Ordering is not receiving: a purchase order moves NO stock. Only a goods
 * receipt writes stock movements and updates the moving-average cost. Receiving
 * can be partial and repeated until the order is fully covered.
 */
class PurchaseService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly SerialService $serials,
        private readonly PostingService $posting,
        private readonly SequenceService $sequences,
        private readonly BusinessCalendar $calendar,
        private readonly AuditService $audit,
        private readonly PosContext $context,
    ) {}

    /**
     * @param array{supplier_id:int, warehouse_id:int, branch_id:int, expected_on?:string|null,
     *              lines:list<array{variant_id:int, product_unit_id:int, qty:string, unit_cost:string}>} $data
     */
    public function createOrder(array $data): PurchaseOrder
    {
        return DB::transaction(function () use ($data): PurchaseOrder {
            $order = PurchaseOrder::query()->create([
                'number' => $this->sequences->next('purchase_order'),
                'supplier_id' => $data['supplier_id'],
                'warehouse_id' => $data['warehouse_id'],
                'branch_id' => $data['branch_id'],
                'status' => 'draft',
                'ordered_on' => now()->toDateString(),
                'expected_on' => $data['expected_on'] ?? null,
                'created_by' => $this->context->userId(),
                'notes' => $data['notes'] ?? null,
            ]);

            $subtotal = Money::zero();

            foreach ($data['lines'] as $line) {
                $productUnit = ProductUnit::query()->findOrFail($line['product_unit_id']);
                $qty = Quantity::of($line['qty']);
                $qtyBase = $qty->multipliedBy((string) $productUnit->factor);
                $cost = Money::of($line['unit_cost']);
                $total = $cost->multipliedBy($qty)->quantize();

                PurchaseOrderLine::query()->create([
                    'purchase_order_id' => $order->id,
                    'variant_id' => $line['variant_id'],
                    'product_unit_id' => $productUnit->id,
                    'qty' => $qty->toString(),
                    'qty_base' => $qtyBase->toString(),
                    'unit_cost' => $cost->toString(6),
                    'total_cost' => $total->toString(4),
                ]);

                $subtotal = $subtotal->plus($total);
            }

            $order->forceFill([
                'subtotal' => $subtotal->toString(4),
                'grand_total' => $subtotal->toString(4),
            ])->save();

            $this->audit->log('purchase_order.created', $order, null, ['number' => $order->number]);

            return $order->load('lines');
        });
    }

    /**
     * Receive goods. THIS is what increases stock.
     *
     * @param array{supplier_id:int, warehouse_id:int, branch_id:int, purchase_order_id?:int|null,
     *              supplier_reference?:string|null, idempotency_key?:string|null,
     *              lines:list<array{variant_id:int, product_unit_id:int, qty:string, unit_cost:string,
     *                               purchase_order_line_id?:int|null, batch_code?:string|null,
     *                               expiry_date?:string|null, serials?:list<string>}>} $data
     */
    public function receive(array $data): GoodsReceipt
    {
        return DB::transaction(function () use ($data): GoodsReceipt {
            $receipt = GoodsReceipt::query()->create([
                'number' => $this->sequences->next('goods_receipt'),
                'purchase_order_id' => $data['purchase_order_id'] ?? null,
                'supplier_id' => $data['supplier_id'],
                'warehouse_id' => $data['warehouse_id'],
                'branch_id' => $data['branch_id'],
                'status' => 'posted',
                'received_at' => now(),
                'business_date' => $this->calendar->businessDate(),
                'supplier_reference' => $data['supplier_reference'] ?? null,
                'user_id' => $this->context->userId(),
                'idempotency_key' => $data['idempotency_key'] ?? null,
            ]);

            $total = Money::zero();

            foreach ($data['lines'] as $lineData) {
                $variant = ProductVariant::query()->with('product')->findOrFail($lineData['variant_id']);
                $productUnit = ProductUnit::query()->findOrFail($lineData['product_unit_id']);

                $qty = Quantity::of($lineData['qty']);
                $qtyBase = $qty->multipliedBy((string) $productUnit->factor);
                // The cost entered is per SELLING unit; stock is valued per base unit.
                $unitCostEntered = Money::of($lineData['unit_cost']);
                $unitCostBase = $unitCostEntered->dividedBy((string) $productUnit->factor);
                $lineTotal = $unitCostEntered->multipliedBy($qty)->quantize();

                $batch = null;
                if (! empty($lineData['batch_code'])) {
                    $batch = Batch::query()->updateOrCreate(
                        ['variant_id' => $variant->id, 'code' => $lineData['batch_code']],
                        [
                            'expiry_date' => $lineData['expiry_date'] ?? null,
                            'unit_cost' => $unitCostBase->toString(6),
                            'supplier_id' => $data['supplier_id'],
                        ],
                    );
                }

                $line = GoodsReceiptLine::query()->create([
                    'goods_receipt_id' => $receipt->id,
                    'purchase_order_line_id' => $lineData['purchase_order_line_id'] ?? null,
                    'product_id' => $variant->product_id,
                    'variant_id' => $variant->id,
                    'product_unit_id' => $productUnit->id,
                    'batch_id' => $batch?->id,
                    'qty' => $qty->toString(),
                    'qty_base' => $qtyBase->toString(),
                    'unit_cost' => $unitCostBase->toString(6),
                    'total_cost' => $lineTotal->toString(4),
                    'expiry_date' => $lineData['expiry_date'] ?? null,
                ]);

                if ($variant->product->isStocked()) {
                    $this->inventory->record(
                        warehouseId: (int) $receipt->warehouse_id,
                        variant: $variant,
                        qtyBase: $qtyBase,
                        reason: InventoryService::REASON_PURCHASE_RECEIPT,
                        unitCost: $unitCostBase,
                        sourceType: GoodsReceipt::class,
                        sourceId: $receipt->id,
                        sourceLineId: $line->id,
                        productUnitId: $productUnit->id,
                        enteredQty: $qty,
                        batchId: $batch?->id,
                    );
                }

                foreach ($lineData['serials'] ?? [] as $serial) {
                    $this->serials->receive(
                        $variant->id,
                        (string) $serial,
                        (int) $receipt->warehouse_id,
                        $unitCostBase,
                        $batch?->id,
                        $line->id,
                    );
                }

                if (! empty($lineData['purchase_order_line_id'])) {
                    $claimed = DB::update(
                        'UPDATE purchase_order_lines
                            SET qty_received_base = qty_received_base + ?, updated_at = now()
                          WHERE id = ? AND qty_received_base + ? <= qty_base',
                        [$qtyBase->toString(), $lineData['purchase_order_line_id'], $qtyBase->toString()],
                    );

                    if ($claimed === 0) {
                        throw new InvalidOperationException(
                            'الكمية المستلمة تتجاوز الكمية المطلوبة في أمر الشراء.',
                            'receipt_exceeds_order',
                            422,
                            ['purchase_order_line_id' => $lineData['purchase_order_line_id']],
                        );
                    }
                }

                $total = $total->plus($lineTotal);
            }

            $receipt->forceFill([
                'subtotal' => $total->toString(4),
                'grand_total' => $total->toString(4),
            ])->save();

            $this->syncOrderStatus($receipt);
            $this->postSupplierLiability($receipt, $total);

            $this->audit->log('goods_receipt.posted', $receipt, null, [
                'number' => $receipt->number,
                'total' => $total->toString(),
            ]);

            return $receipt->load('lines');
        });
    }

    private function syncOrderStatus(GoodsReceipt $receipt): void
    {
        if (! $receipt->purchase_order_id) {
            return;
        }

        $order = PurchaseOrder::query()->with('lines')->find($receipt->purchase_order_id);
        if (! $order) {
            return;
        }

        $fullyReceived = $order->lines->every(
            fn (PurchaseOrderLine $l) => Quantity::of($l->qty_received_base)->compareTo(Quantity::of($l->qty_base)) >= 0
        );
        $anyReceived = $order->lines->contains(fn (PurchaseOrderLine $l) => Quantity::of($l->qty_received_base)->isPositive());

        $order->forceFill([
            'status' => $fullyReceived ? 'received' : ($anyReceived ? 'partially_received' : $order->status),
        ])->save();
    }

    private function postSupplierLiability(GoodsReceipt $receipt, Money $total): void
    {
        if (! $total->isPositive()) {
            return;
        }

        // Goods received but not yet invoiced are already a liability: the stock
        // is ours and the supplier is owed.
        $this->posting->post('purchase_receipt', $receipt, [
            ['account' => PostingService::INVENTORY, 'debit' => $total, 'memo' => 'استلام بضاعة'],
            ['account' => PostingService::ACCOUNTS_PAYABLE, 'credit' => $total, 'memo' => 'مستحق للمورد'],
        ], 'استلام بضاعة '.$receipt->number, $receipt->business_date->toDateString());

        $supplier = Supplier::query()->whereKey($receipt->supplier_id)->lockForUpdate()->firstOrFail();
        $balanceAfter = Money::of($supplier->balance)->plus($total);

        SupplierLedgerEntry::query()->create([
            'supplier_id' => $supplier->id,
            'entry_date' => $receipt->business_date->toDateString(),
            'type' => 'purchase',
            'source_type' => GoodsReceipt::class,
            'source_id' => $receipt->id,
            'debit' => '0',
            'credit' => $total->toString(4),
            'balance_after' => $balanceAfter->toString(4),
            'description' => 'استلام بضاعة '.$receipt->number,
            'user_id' => $this->context->userId(),
        ]);

        $supplier->forceFill(['balance' => $balanceAfter->toString(4)])->save();
    }
}
