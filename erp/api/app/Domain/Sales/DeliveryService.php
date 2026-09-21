<?php

namespace App\Domain\Sales;

use App\Domain\Inventory\InventoryService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\DeliveryNote;
use App\Models\DeliveryNoteLine;
use App\Models\SalesOrder;
use App\Models\StockReservation;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * The delivery note is where goods physically leave.
 *
 * This is the single event that decrements stock for an order-based sale.
 * The invoice that follows reads the cost captured here and posts revenue and
 * COGS, but never moves stock again. That split is what makes a double
 * deduction structurally impossible rather than merely unlikely.
 */
class DeliveryService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly SalesOrderService $orders,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * Plan a delivery from an approved order. Nothing moves yet.
     *
     * @param  array<int, array{sales_order_line_id: int, qty_base: string, batch_id?: int|null}>|null  $lines
     */
    public function createFromOrder(SalesOrder $order, array $header = [], ?array $lines = null): DeliveryNote
    {
        if ($order->status !== 'approved' && $order->status !== 'partially_delivered') {
            throw DomainException::make('sales.order_not_approved',
                "لا يمكن التجهيز قبل اعتماد أمر البيع «{$order->code}».",
                ['status' => $order->status]);
        }

        return DB::transaction(function () use ($order, $header, $lines) {
            $note = DeliveryNote::create([
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('delivery_note', $order->branch_id),
                'sales_order_id' => $order->id,
                'customer_id' => $order->customer_id,
                'customer_address_id' => $header['customer_address_id'] ?? $order->customer_address_id,
                'warehouse_id' => $header['warehouse_id'] ?? $order->warehouse_id,
                'vehicle_id' => $header['vehicle_id'] ?? null,
                'driver_id' => $header['driver_id'] ?? null,
                'rep_id' => $order->rep_id,
                'delivery_date' => $header['delivery_date'] ?? now()->toDateString(),
                'stop_sequence' => $header['stop_sequence'] ?? null,
                'eta' => $header['eta'] ?? null,
                'status' => 'draft',
                'notes' => $header['notes'] ?? null,
            ]);

            $order->load('lines');
            $planned = $lines !== null
                ? collect($lines)
                : $order->lines->map(fn ($l) => [
                    'sales_order_line_id' => $l->id,
                    'qty_base' => $l->qtyOutstandingBase(),
                ]);

            foreach ($planned as $input) {
                $orderLine = $order->lines->firstWhere('id', $input['sales_order_line_id']);

                if (! $orderLine) {
                    throw DomainException::make('sales.line_not_in_order',
                        'سطر غير موجود في أمر البيع.', ['line_id' => $input['sales_order_line_id']]);
                }

                $qty = Num::min(Num::qty($input['qty_base']), $orderLine->qtyOutstandingBase());

                if (! Num::isPositive($qty, Num::QTY_SCALE)) {
                    continue;
                }

                // Follow the reservation's batch choice where one exists, so the
                // goods that were held are the goods that ship.
                $batchIds = $input['batch_id'] ?? null
                    ? [['batch_id' => $input['batch_id'], 'qty_base' => $qty]]
                    : $this->plannedBatches($order, $orderLine->id, $qty);

                foreach ($batchIds as $pick) {
                    DeliveryNoteLine::create([
                        'delivery_note_id' => $note->id,
                        'sales_order_line_id' => $orderLine->id,
                        'item_id' => $orderLine->item_id,
                        'batch_id' => $pick['batch_id'],
                        'qty_base' => $pick['qty_base'],
                    ]);
                }
            }

            return $note->fresh(['lines']);
        });
    }

    /**
     * Confirm what actually arrived at the customer, and move the stock.
     *
     * Partial delivery and per-line refusal are first-class: the refused
     * quantity never left, so it is simply not issued, and its reservation is
     * released back to available stock.
     *
     * @param  array<int, array{line_id: int, qty_delivered_base: string, qty_refused_base?: string, refusal_reason?: string|null}>  $confirmations
     */
    public function confirmDelivery(DeliveryNote $note, array $confirmations, array $proof = []): DeliveryNote
    {
        return DB::transaction(function () use ($note, $confirmations, $proof) {
            $note = DeliveryNote::with('lines')->lockForUpdate()->findOrFail($note->id);

            if ($note->hasLeftStock()) {
                throw DomainException::make('sales.delivery_already_confirmed',
                    "إذن التسليم «{$note->code}» مؤكد بالفعل.", ['status' => $note->status]);
            }
            if ($note->status === 'cancelled') {
                throw DomainException::make('sales.delivery_cancelled',
                    "إذن التسليم «{$note->code}» ملغي.", ['status' => $note->status]);
            }

            $byId = collect($confirmations)->keyBy('line_id');
            $anyDelivered = false;
            $anyShort = false;

            foreach ($note->lines as $line) {
                $input = $byId->get($line->id, ['qty_delivered_base' => (string) $line->qty_base]);

                $delivered = Num::min(Num::qty($input['qty_delivered_base'] ?? '0'), (string) $line->qty_base);
                $refused = Num::qty($input['qty_refused_base']
                    ?? Num::sub($line->qty_base, $delivered, Num::QTY_SCALE));

                if (Num::isPositive($delivered, Num::QTY_SCALE)) {
                    $reservation = $this->reservationFor($note, $line);

                    if ($reservation) {
                        // Consume the hold before issuing, so the issue sees the
                        // quantity as usable rather than reserved-away.
                        $this->inventory->release($reservation, $delivered, 'consumed');
                    }

                    $movement = $this->inventory->issue(
                        warehouseId: $note->warehouse_id,
                        itemId: $line->item_id,
                        qtyBase: $delivered,
                        docType: 'delivery_note',
                        docId: $note->id,
                        docLineId: $line->id,
                        batchId: $line->batch_id,
                        movedAt: $note->delivery_date,
                        reason: 'sale_delivery',
                    );

                    // Freeze the cost here. The invoice will read this, not the
                    // average that happens to be current when it is raised.
                    $line->forceFill([
                        'qty_delivered_base' => $delivered,
                        'unit_cost' => $movement->unit_cost,
                    ]);
                    $anyDelivered = true;
                }

                if (Num::isPositive($refused, Num::QTY_SCALE)) {
                    $reservation = $this->reservationFor($note, $line);
                    if ($reservation) {
                        $this->inventory->release($reservation, $refused, 'released');
                    }
                    $line->forceFill([
                        'qty_refused_base' => $refused,
                        'refusal_reason' => $input['refusal_reason'] ?? null,
                    ]);
                    $anyShort = true;
                }

                $line->save();

                if ($orderLine = $line->salesOrderLine) {
                    $orderLine->forceFill([
                        'qty_delivered_base' => Num::qty(
                            Num::add($orderLine->qty_delivered_base, $delivered)
                        ),
                    ])->save();
                }
            }

            $note->forceFill([
                'status' => match (true) {
                    ! $anyDelivered => 'refused',
                    $anyShort => 'partially_delivered',
                    default => 'delivered',
                },
                'delivered_at' => now(),
                'received_by_name' => $proof['received_by_name'] ?? null,
                'signature_path' => $proof['signature_path'] ?? null,
                'proof_photos' => $proof['photos'] ?? [],
                'otp_verified' => $proof['otp_verified'] ?? false,
                'gps_lat' => $proof['gps_lat'] ?? null,
                'gps_lng' => $proof['gps_lng'] ?? null,
                'failure_reason' => $anyDelivered ? null : ($proof['failure_reason'] ?? null),
            ])->save();

            if ($note->order) {
                $this->orders->refreshFulfilmentStatus($note->order);
            }

            return $note->fresh(['lines']);
        });
    }

    /**
     * Record a delivery that could not be made, and reschedule it.
     *
     * The goods are still in the warehouse (or on the van) — nothing is issued,
     * and the reservation stays so the next attempt is still covered.
     */
    public function markFailed(DeliveryNote $note, string $reason, ?string $rescheduleTo = null): DeliveryNote
    {
        return DB::transaction(function () use ($note, $reason, $rescheduleTo) {
            if ($note->hasLeftStock()) {
                throw DomainException::make('sales.delivery_already_confirmed',
                    'لا يمكن تسجيل تعذر التسليم بعد تأكيد الخروج.', ['status' => $note->status]);
            }

            $note->forceFill([
                'status' => $rescheduleTo ? 'rescheduled' : 'refused',
                'failure_reason' => $reason,
                'rescheduled_to' => $rescheduleTo,
            ])->save();

            return $note;
        });
    }

    /** The active reservation backing this delivery line, if any. */
    protected function reservationFor(DeliveryNote $note, DeliveryNoteLine $line): ?StockReservation
    {
        if (! $note->sales_order_id || ! $line->sales_order_line_id) {
            return null;
        }

        return StockReservation::query()
            ->where('doc_type', 'sales_order')
            ->where('doc_id', $note->sales_order_id)
            ->where('doc_line_id', $line->sales_order_line_id)
            ->where('item_id', $line->item_id)
            ->when($line->batch_id, fn ($q) => $q->where('batch_id', $line->batch_id))
            ->where('status', 'active')
            ->orderByDesc('qty_base')
            ->first();
    }

    /** Batch split for a planned line, taken from its reservations. */
    protected function plannedBatches(SalesOrder $order, int $orderLineId, string $qty): array
    {
        $reservations = StockReservation::query()
            ->where('doc_type', 'sales_order')
            ->where('doc_id', $order->id)
            ->where('doc_line_id', $orderLineId)
            ->where('status', 'active')
            ->get();

        if ($reservations->isEmpty()) {
            return [['batch_id' => null, 'qty_base' => $qty]];
        }

        $remaining = $qty;
        $picks = [];

        foreach ($reservations as $reservation) {
            if (! Num::isPositive($remaining, Num::QTY_SCALE)) {
                break;
            }
            $take = Num::min((string) $reservation->qty_base, $remaining);
            $picks[] = ['batch_id' => $reservation->batch_id, 'qty_base' => Num::qty($take)];
            $remaining = Num::qty(Num::sub($remaining, $take));
        }

        // Anything the reservations did not cover ships unbatched — a backorder
        // that was never held.
        if (Num::isPositive($remaining, Num::QTY_SCALE)) {
            $picks[] = ['batch_id' => null, 'qty_base' => $remaining];
        }

        return $picks;
    }
}
