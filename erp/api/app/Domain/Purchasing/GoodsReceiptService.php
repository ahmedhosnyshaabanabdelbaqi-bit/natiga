<?php

namespace App\Domain\Purchasing;

use App\Domain\Accounting\LedgerService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Batch;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptLine;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\Supplier;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Goods receipt — the event that adds stock and starts the GRNI clock.
 *
 *   Dr  Inventory              value received
 *     Cr  Goods received not invoiced   same
 *
 * The supplier is not credited here; that happens when their invoice arrives
 * and clears GRNI. Keeping the two apart is what stops stock being added twice
 * when an invoice follows a receipt, and it gives a real figure for "received
 * but unbilled" instead of a reconciliation exercise.
 */
class GoodsReceiptService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * @param  array<int, array{item_id?: int, purchase_order_line_id?: int|null, item_unit_id?: int|null, qty: string, unit_cost?: string|null, batch_code?: string|null, expiry_date?: string|null, disposition?: string}>  $lines
     */
    public function create(array $header, array $lines): GoodsReceipt
    {
        return DB::transaction(function () use ($header, $lines) {
            $order = isset($header['purchase_order_id'])
                ? PurchaseOrder::with('lines')->findOrFail($header['purchase_order_id'])
                : null;

            if ($order && ! in_array($order->status, ['approved', 'partially_received'], true)) {
                throw DomainException::make('purchasing.order_not_receivable',
                    "أمر الشراء «{$order->code}» غير قابل للاستلام في حالته الحالية.",
                    ['status' => $order->status]);
            }

            $supplier = Supplier::findOrFail($header['supplier_id'] ?? $order->supplier_id);
            $warehouse = Warehouse::findOrFail($header['warehouse_id'] ?? $order->warehouse_id);

            $receipt = GoodsReceipt::create([
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('goods_receipt'),
                'supplier_id' => $supplier->id,
                'purchase_order_id' => $order?->id,
                'warehouse_id' => $warehouse->id,
                'receipt_date' => $header['receipt_date'] ?? now()->toDateString(),
                'supplier_delivery_ref' => $header['supplier_delivery_ref'] ?? null,
                'status' => 'draft',
                'created_by' => auth()->id(),
                'notes' => $header['notes'] ?? null,
            ]);

            foreach ($lines as $input) {
                $this->addLine($receipt, $order, $input);
            }

            $this->recalculate($receipt);

            return $receipt->fresh(['lines']);
        });
    }

    protected function addLine(GoodsReceipt $receipt, ?PurchaseOrder $order, array $input): void
    {
        $orderLine = isset($input['purchase_order_line_id'])
            ? PurchaseOrderLine::findOrFail($input['purchase_order_line_id'])
            : null;

        if ($orderLine && $order && $orderLine->purchase_order_id !== $order->id) {
            throw DomainException::make('purchasing.line_mismatch',
                'سطر الاستلام لا ينتمي إلى أمر الشراء المحدد.', ['line_id' => $orderLine->id]);
        }

        $item = Item::findOrFail($orderLine?->item_id ?? $input['item_id']);
        $itemUnit = isset($input['item_unit_id'])
            ? ItemUnit::where('item_id', $item->id)->findOrFail($input['item_unit_id'])
            : ($orderLine?->itemUnit ?? $this->defaultPurchaseUnit($item));

        // Snapshot the factor the PO was placed at, not today's definition.
        $factor = $orderLine?->unit_factor ?? $itemUnit->factor;
        $qtyInput = Num::qty($input['qty']);
        $qtyBase = Num::qty(Num::mul($qtyInput, $factor, Num::QTY_SCALE));

        if (! Num::isPositive($qtyBase, Num::QTY_SCALE)) {
            throw DomainException::make('purchasing.invalid_quantity',
                "كمية استلام غير صالحة للصنف «{$item->name}».", ['item_id' => $item->id]);
        }

        // Over-receipt beyond what remains on the PO is refused rather than
        // silently accepted — it is nearly always a keying error.
        if ($orderLine) {
            $outstanding = Num::sub($orderLine->qty_base, $orderLine->qty_received_base, Num::QTY_SCALE);

            if (Num::cmp($qtyBase, $outstanding, Num::QTY_SCALE) > 0) {
                throw DomainException::make('purchasing.over_receipt', sprintf(
                    'كمية استلام «%s» (%s) تتجاوز المتبقي على أمر الشراء (%s).',
                    $item->name, $qtyBase, $outstanding
                ), ['item_id' => $item->id, 'requested' => $qtyBase, 'outstanding' => $outstanding]);
            }
        }

        // Cost per BASE unit, excluding recoverable tax.
        $unitCostInput = $input['unit_cost'] ?? $orderLine?->unit_price ?? '0';
        $unitCost = Num::round(Num::div($unitCostInput, $factor), 8);

        $batchId = null;
        if ($item->track_batches) {
            $batchId = $this->resolveBatch($item, $receipt, $input);
        }

        GoodsReceiptLine::create([
            'goods_receipt_id' => $receipt->id,
            'purchase_order_line_id' => $orderLine?->id,
            'item_id' => $item->id,
            'batch_id' => $batchId,
            'item_unit_id' => $itemUnit->id,
            'unit_factor' => $factor,
            'qty_input' => $qtyInput,
            'qty_base' => $qtyBase,
            'unit_cost' => $unitCost,
            'value' => Num::round(Num::mul($qtyBase, $unitCost), 4),
            'disposition' => $input['disposition'] ?? 'stock',
            'note' => $input['note'] ?? null,
        ]);
    }

    protected function resolveBatch(Item $item, GoodsReceipt $receipt, array $input): int
    {
        $code = $input['batch_code']
            ?? $receipt->supplier_delivery_ref
            ?? ($receipt->code.'-'.$item->code);

        $batch = Batch::firstOrCreate(
            ['company_id' => $receipt->company_id, 'item_id' => $item->id, 'code' => $code],
            [
                'lot_no' => $input['lot_no'] ?? null,
                'mfg_date' => $input['mfg_date'] ?? null,
                'expiry_date' => $input['expiry_date'] ?? null,
                'supplier_id' => $receipt->supplier_id,
                'status' => ($input['disposition'] ?? 'stock') === 'quarantine' ? 'quarantine' : 'ok',
            ]
        );

        if ($item->track_expiry && ! $batch->expiry_date) {
            throw DomainException::make('purchasing.expiry_required',
                "الصنف «{$item->name}» يتطلب تاريخ صلاحية عند الاستلام.",
                ['item_id' => $item->id, 'batch_code' => $code]);
        }

        return $batch->id;
    }

    /**
     * Post the receipt: stock in, GRNI credited, PO progress updated.
     *
     * Goods flagged for inspection or quarantine go to a non-sellable warehouse
     * of that kind, so they count in inventory value but not in what is
     * available to sell.
     */
    public function post(GoodsReceipt $receipt): GoodsReceipt
    {
        return DB::transaction(function () use ($receipt) {
            $receipt = GoodsReceipt::with(['lines.item', 'supplier'])
                ->lockForUpdate()->findOrFail($receipt->id);

            if ($receipt->status === 'posted') {
                return $receipt;
            }
            if ($receipt->status === 'cancelled') {
                throw DomainException::make('purchasing.receipt_cancelled',
                    "إذن الاستلام «{$receipt->code}» ملغي.", ['status' => $receipt->status]);
            }
            if ($receipt->lines->isEmpty()) {
                throw DomainException::make('purchasing.receipt_empty',
                    'لا يمكن ترحيل إذن استلام بدون سطور.', ['receipt_id' => $receipt->id]);
            }

            $totalValue = '0';

            foreach ($receipt->lines as $line) {
                $warehouseId = $this->warehouseForDisposition($line->disposition, $receipt->warehouse_id);

                $this->inventory->receive(
                    warehouseId: $warehouseId,
                    itemId: $line->item_id,
                    qtyBase: (string) $line->qty_base,
                    unitCost: (string) $line->unit_cost,
                    docType: 'goods_receipt',
                    docId: $receipt->id,
                    docLineId: $line->id,
                    batchId: $line->batch_id,
                    movedAt: $receipt->receipt_date,
                    reason: 'purchase_receipt',
                );

                $totalValue = Num::add($totalValue, $line->value, Num::MONEY_SCALE);

                if ($orderLine = $line->purchaseOrderLine) {
                    $orderLine->forceFill([
                        'qty_received_base' => Num::qty(
                            Num::add($orderLine->qty_received_base, $line->qty_base)
                        ),
                    ])->save();
                }
            }

            $accounts = $this->ledger->accounts();
            $draft = $this->ledger->draftFor(
                'goods_receipt', $receipt->id, $receipt->receipt_date->toDateString(),
                "استلام بضاعة {$receipt->code} — {$receipt->supplier->name}"
            );

            $draft->debit($accounts->key('inventory'), $totalValue, 'إضافة للمخزون');
            $draft->credit($accounts->key('grni'), $totalValue,
                'بضاعة مستلمة غير مفوترة', 'supplier', $receipt->supplier_id);

            $entry = $this->ledger->post($draft);

            $receipt->forceFill([
                'status' => 'posted',
                'total_value' => Num::money($totalValue),
                'journal_entry_id' => $entry->id,
                'posted_at' => now(),
                'posted_by' => auth()->id(),
            ])->save();

            if ($order = $receipt->purchaseOrder) {
                $this->refreshOrderStatus($order);
            }

            return $receipt->fresh(['lines']);
        });
    }

    public function recalculate(GoodsReceipt $receipt): GoodsReceipt
    {
        $receipt->load('lines');

        $total = $receipt->lines->reduce(
            fn ($carry, $l) => Num::add($carry, $l->value, Num::MONEY_SCALE), '0'
        );

        $receipt->forceFill(['total_value' => Num::money($total)])->save();

        return $receipt;
    }

    protected function refreshOrderStatus(PurchaseOrder $order): void
    {
        $order->load('lines');

        $ordered = $order->lines->reduce(fn ($c, $l) => Num::add($c, $l->qty_base, Num::QTY_SCALE), '0');
        $received = $order->lines->reduce(fn ($c, $l) => Num::add($c, $l->qty_received_base, Num::QTY_SCALE), '0');

        $order->forceFill([
            'status' => match (true) {
                ! Num::isPositive($received, Num::QTY_SCALE) => 'approved',
                Num::cmp($received, $ordered, Num::QTY_SCALE) >= 0 => 'received',
                default => 'partially_received',
            },
        ])->save();
    }

    protected function warehouseForDisposition(string $disposition, int $default): int
    {
        if ($disposition === 'stock') {
            return $default;
        }

        $kind = $disposition === 'quarantine' ? 'quarantine' : 'inspection';

        $warehouse = Warehouse::query()->where('kind', $kind)->where('is_active', true)->first();

        if (! $warehouse) {
            throw DomainException::make('inventory.disposition_warehouse_missing',
                "لا يوجد مخزن من نوع «{$kind}» لاستقبال البضاعة تحت الفحص.",
                ['disposition' => $disposition]);
        }

        return $warehouse->id;
    }

    protected function defaultPurchaseUnit(Item $item): ItemUnit
    {
        return ItemUnit::where('item_id', $item->id)
            ->orderByDesc('is_purchase_default')
            ->orderByDesc('is_base')
            ->firstOr(fn () => throw DomainException::make('items.no_unit',
                "الصنف «{$item->name}» ليس له وحدة معرّفة.", ['item_id' => $item->id]));
    }
}
