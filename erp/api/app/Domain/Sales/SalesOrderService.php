<?php

namespace App\Domain\Sales;

use App\Domain\Credit\CreditService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Pricing\PricingService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Approval;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Quotation → order → approval → reservation.
 *
 * An order moves no stock and posts no journal entry. It reserves, which is a
 * promise, and that promise is what makes available-to-promise smaller for
 * everyone else. Drafts reserve nothing at all.
 */
class SalesOrderService
{
    public function __construct(
        private readonly PricingService $pricing,
        private readonly InventoryService $inventory,
        private readonly CreditService $credit,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * @param  array<int, array{item_id: int, item_unit_id?: int|null, qty: string, unit_price?: string|null, discount_pct?: string|null, note?: string|null}>  $lines
     */
    public function create(array $header, array $lines): SalesOrder
    {
        return DB::transaction(function () use ($header, $lines) {
            $customer = Customer::findOrFail($header['customer_id']);
            $warehouse = Warehouse::findOrFail($header['warehouse_id']);
            $orderDate = $header['order_date'] ?? now()->toDateString();

            $order = SalesOrder::create([
                'company_id' => CompanyContext::idOrFail(),
                'branch_id' => $header['branch_id'] ?? $warehouse->branch_id,
                'code' => $this->numbering->next('sales_order', $header['branch_id'] ?? null),
                'customer_id' => $customer->id,
                'customer_address_id' => $header['customer_address_id'] ?? null,
                'rep_id' => $header['rep_id'] ?? $customer->currentRepId(),
                'warehouse_id' => $warehouse->id,
                'price_list_id' => $header['price_list_id'] ?? $customer->price_list_id,
                'cost_center_id' => $header['cost_center_id'] ?? null,
                'order_date' => $orderDate,
                'delivery_date' => $header['delivery_date'] ?? null,
                'payment_type' => $header['payment_type'] ?? ($customer->is_cash_only ? 'cash' : 'credit'),
                'status' => 'draft',
                'doc_discount_amount' => Num::money($header['doc_discount_amount'] ?? '0'),
                'delivery_fee' => Num::money($header['delivery_fee'] ?? '0'),
                'customer_po_ref' => $header['customer_po_ref'] ?? null,
                'is_backorder_allowed' => $header['is_backorder_allowed'] ?? true,
                'source' => $header['source'] ?? 'web',
                'device_id' => $header['device_id'] ?? null,
                'client_uuid' => $header['client_uuid'] ?? null,
                'created_by' => auth()->id(),
                'notes' => $header['notes'] ?? null,
            ]);

            $this->replaceLines($order, $lines);
            $this->applyPromotions($order, $customer);
            $this->recalculate($order);

            return $order->fresh(['lines']);
        });
    }

    public function update(SalesOrder $order, array $header, ?array $lines = null): SalesOrder
    {
        if (! $order->isEditable()) {
            throw DomainException::make('sales.order_locked',
                "لا يمكن تعديل أمر البيع «{$order->code}» في حالته الحالية ({$order->status}).",
                ['order_id' => $order->id, 'status' => $order->status]);
        }

        return DB::transaction(function () use ($order, $header, $lines) {
            $order->fill(array_intersect_key($header, array_flip([
                'customer_address_id', 'delivery_date', 'payment_type', 'notes',
                'doc_discount_amount', 'delivery_fee', 'cost_center_id', 'customer_po_ref',
            ])))->save();

            if ($lines !== null) {
                $this->replaceLines($order, $lines);
                $this->applyPromotions($order, $order->customer);
            }

            $this->recalculate($order);

            return $order->fresh(['lines']);
        });
    }

    /**
     * Approve an order: run the credit check, then reserve stock.
     *
     * Reserving here and not at draft time is deliberate — a half-typed order
     * should not hold the last carton away from a confirmed one.
     *
     * @param  bool  $creditOverrideApproved  true only when an approval record exists
     */
    public function approve(SalesOrder $order, bool $creditOverrideApproved = false): SalesOrder
    {
        $order = $order->fresh(['lines', 'customer']);

        if ($order->status === 'approved') {
            return $order;   // idempotent: a retried approval is a no-op
        }
        if (! $order->isEditable()) {
            throw DomainException::make('sales.order_not_approvable',
                "أمر البيع «{$order->code}» غير قابل للاعتماد في حالته الحالية.",
                ['status' => $order->status]);
        }
        if ($order->lines->isEmpty()) {
            throw DomainException::make('sales.order_empty',
                'لا يمكن اعتماد أمر بيع بدون أصناف.', ['order_id' => $order->id]);
        }

        /**
         * The credit check runs BEFORE the reserving transaction opens.
         *
         * A failure has to leave something behind — the approval request a
         * supervisor will act on — and that record would be rolled back with
         * everything else if it were written inside the transaction the refusal
         * aborts. So the request is committed in its own transaction and the
         * refusal is raised afterwards.
         */
        if ($order->payment_type !== 'cash' && ! $creditOverrideApproved) {
            $check = $this->credit->check($order->customer, (string) $order->total);

            if (! $check['allowed']) {
                DB::transaction(function () use ($order, $check) {
                    $order->forceFill(['status' => 'pending_approval'])->save();

                    Approval::firstOrCreate([
                        'company_id' => $order->company_id,
                        'doc_type' => 'sales_order',
                        'doc_id' => $order->id,
                        'level' => 1,
                        'status' => 'pending',
                    ], [
                        'reason_code' => $check['reason'],
                        'amount' => $order->total,
                        'requested_by' => auth()->id(),
                        'note' => $check['message'],
                    ]);
                });

                throw DomainException::make($check['reason'], $check['message'], [
                    'order_id' => $order->id,
                    'requires_approval' => true,
                    'exposure' => $check['exposure'],
                ]);
            }
        }

        return DB::transaction(function () use ($order) {
            // Re-read under a lock: two approvals of the same order must not
            // both reserve stock.
            $locked = SalesOrder::lockForUpdate()->findOrFail($order->id);

            if ($locked->status === 'approved') {
                return $locked->fresh(['lines']);
            }

            $this->reserveStock($locked);

            $locked->forceFill([
                'status' => 'approved',
                'approved_by' => auth()->id(),
                'approved_at' => now(),
            ])->save();

            return $locked->fresh(['lines']);
        });
    }

    public function cancel(SalesOrder $order, ?string $reason = null): SalesOrder
    {
        return DB::transaction(function () use ($order, $reason) {
            if ($order->delivery_status !== 'pending' || $order->invoice_status !== 'pending') {
                throw DomainException::make('sales.order_has_movement',
                    "أمر البيع «{$order->code}» تم تسليمه أو فوترته جزئيًا؛ استخدم المرتجع أو الإشعار الدائن.",
                    ['delivery_status' => $order->delivery_status, 'invoice_status' => $order->invoice_status]);
            }

            $this->inventory->releaseFor('sales_order', $order->id);

            $order->forceFill([
                'status' => 'cancelled',
                'notes' => trim(($order->notes ?? '')."\nسبب الإلغاء: ".($reason ?? '—')),
            ])->save();

            return $order;
        });
    }

    /**
     * Hold stock for each line, honouring FEFO for batch-tracked items.
     *
     * An order that allows backorders reserves what is there and lets the rest
     * stand as an outstanding quantity; one that does not will fail loudly.
     */
    protected function reserveStock(SalesOrder $order): void
    {
        foreach ($order->lines as $line) {
            $outstanding = Num::sub($line->qty_base, $line->qty_reserved_base, Num::QTY_SCALE);

            if (! Num::isPositive($outstanding, Num::QTY_SCALE)) {
                continue;
            }

            $item = $line->item;
            $available = $this->inventory->available($order->warehouse_id, $item->id);
            $toReserve = $order->is_backorder_allowed
                ? Num::min($available, $outstanding)
                : $outstanding;

            if (! Num::isPositive($toReserve, Num::QTY_SCALE)) {
                continue;
            }

            $picks = $item->track_batches
                ? $this->inventory->allocateBatches($order->warehouse_id, $item, $toReserve)
                : collect([['batch_id' => null, 'qty_base' => $toReserve]]);

            foreach ($picks as $pick) {
                $this->inventory->reserve(
                    $order->warehouse_id, $item->id, $pick['qty_base'],
                    'sales_order', $order->id, $line->id, $pick['batch_id']
                );
            }

            $line->forceFill([
                'qty_reserved_base' => Num::qty(Num::add($line->qty_reserved_base, $toReserve)),
            ])->save();
        }
    }

    /** @param array<int, array<string, mixed>> $lines */
    protected function replaceLines(SalesOrder $order, array $lines): void
    {
        $this->inventory->releaseFor('sales_order', $order->id);
        $order->lines()->delete();

        $customer = $order->customer;

        foreach ($lines as $input) {
            $item = Item::findOrFail($input['item_id']);
            $itemUnit = isset($input['item_unit_id'])
                ? ItemUnit::where('item_id', $item->id)->findOrFail($input['item_unit_id'])
                : $this->defaultSalesUnit($item);

            $qtyInput = Num::qty($input['qty']);

            if (! Num::isPositive($qtyInput, Num::QTY_SCALE)) {
                throw DomainException::make('sales.invalid_quantity',
                    "كمية غير صالحة للصنف «{$item->name}».", ['item_id' => $item->id]);
            }
            if (! $item->allow_partial_unit && ! $item->is_weighted
                && Num::cmp($qtyInput, Num::intDiv($qtyInput, '1'), Num::QTY_SCALE) !== 0) {
                throw DomainException::make('sales.fractional_quantity',
                    "الصنف «{$item->name}» لا يقبل كميات كسرية.", ['item_id' => $item->id]);
            }

            $price = $this->pricing->resolve(
                $customer, $item, $itemUnit, $qtyInput, $order->order_date->toDateString(), $order->price_list_id
            );

            // An explicit price from the user wins, but the resolved source is
            // still recorded so the override is visible later.
            $unitPrice = isset($input['unit_price']) && $input['unit_price'] !== null
                ? Num::round($input['unit_price'], 4)
                : $price->unitPrice;
            $discountPct = $input['discount_pct'] ?? $price->discountPct;
            $taxRate = $item->is_taxable ? Num::of($item->taxRate?->rate ?? '0') : '0';

            $computed = $this->pricing->computeLine(
                $qtyInput, $unitPrice, $discountPct, $input['discount_amount'] ?? '0',
                $taxRate, $price->priceIncludesTax
            );

            SalesOrderLine::create([
                'sales_order_id' => $order->id,
                'item_id' => $item->id,
                'item_unit_id' => $itemUnit->id,
                'unit_factor' => $itemUnit->factor,     // snapshot
                'qty_input' => $qtyInput,
                'qty_base' => Num::qty($itemUnit->toBase($qtyInput)),
                'unit_price' => $unitPrice,             // snapshot
                'discount_pct' => Num::of($discountPct),
                'discount_amount' => $computed['discount_amount'],
                'tax_rate' => $taxRate,                 // snapshot
                'tax_amount' => $computed['tax_amount'],
                'line_total' => $computed['total'],
                'price_source' => isset($input['unit_price']) ? 'manual_override' : $price->source,
                'note' => $input['note'] ?? null,
            ]);
        }
    }

    /** Add earned free goods as zero-priced lines flagged is_bonus. */
    protected function applyPromotions(SalesOrder $order, Customer $customer): void
    {
        $order->load('lines.item');

        $basis = $order->lines->where('is_bonus', false)->map(fn ($l) => [
            'item_id' => $l->item_id,
            'qty_base' => (string) $l->qty_base,
            'category_id' => $l->item->category_id,
            'line_total' => (string) $l->line_total,
        ]);

        if ($basis->isEmpty()) {
            return;
        }

        foreach ($this->pricing->bonusLines($customer, $basis, $order->order_date->toDateString()) as $bonus) {
            $item = Item::find($bonus['item_id']);
            if (! $item) {
                continue;
            }

            $itemUnit = $bonus['item_unit_id']
                ? ItemUnit::find($bonus['item_unit_id'])
                : $this->defaultSalesUnit($item);

            $qtyInput = Num::qty(Num::div($bonus['qty_base'], $itemUnit->factor, Num::QTY_SCALE));

            SalesOrderLine::create([
                'sales_order_id' => $order->id,
                'item_id' => $item->id,
                'item_unit_id' => $itemUnit->id,
                'unit_factor' => $itemUnit->factor,
                'qty_input' => $qtyInput,
                'qty_base' => Num::qty($bonus['qty_base']),
                'unit_price' => '0',
                'discount_pct' => '0',
                'discount_amount' => '0',
                // Free goods are not a taxable sale at zero; they carry no output
                // tax here and their cost is still charged to COGS on invoicing.
                'tax_rate' => '0',
                'tax_amount' => '0',
                'line_total' => '0',
                'is_bonus' => true,
                'promotion_id' => $bonus['promotion_id'],
                'price_source' => 'promotion',
            ]);
        }
    }

    /** Recompute header totals from the lines. */
    public function recalculate(SalesOrder $order): SalesOrder
    {
        $order->load('lines');

        $subtotal = '0';
        $lineDiscount = '0';
        $tax = '0';

        foreach ($order->lines as $line) {
            $gross = Num::mul($line->qty_input, $line->unit_price);
            $subtotal = Num::add($subtotal, $gross, Num::MONEY_SCALE);
            $lineDiscount = Num::add($lineDiscount, $line->discount_amount, Num::MONEY_SCALE);
            $tax = Num::add($tax, $line->tax_amount, Num::MONEY_SCALE);
        }

        $net = Num::sub(Num::sub($subtotal, $lineDiscount, Num::MONEY_SCALE),
            $order->doc_discount_amount, Num::MONEY_SCALE);

        $order->forceFill([
            'subtotal' => Num::money($subtotal),
            'line_discount_amount' => Num::money($lineDiscount),
            'tax_amount' => Num::money($tax),
            'total' => Num::money(Num::add(Num::add($net, $tax, Num::MONEY_SCALE),
                $order->delivery_fee, Num::MONEY_SCALE)),
        ])->save();

        return $order;
    }

    /**
     * Refresh the three status axes from the line quantities.
     *
     * Called after every delivery and every invoice, because these are the only
     * events that can change them.
     */
    public function refreshFulfilmentStatus(SalesOrder $order): void
    {
        $order->load('lines');

        $totalQty = $order->lines->reduce(fn ($c, $l) => Num::add($c, $l->qty_base, Num::QTY_SCALE), '0');
        $delivered = $order->lines->reduce(fn ($c, $l) => Num::add($c, $l->qty_delivered_base, Num::QTY_SCALE), '0');
        $invoiced = $order->lines->reduce(fn ($c, $l) => Num::add($c, $l->qty_invoiced_base, Num::QTY_SCALE), '0');

        $status = fn (string $done) => match (true) {
            ! Num::isPositive($done, Num::QTY_SCALE) => 'pending',
            Num::cmp($done, $totalQty, Num::QTY_SCALE) >= 0 => 'complete',
            default => 'partial',
        };

        $deliveryStatus = $status($delivered);
        $invoiceStatus = $status($invoiced);

        $order->forceFill([
            'delivery_status' => $deliveryStatus === 'complete' ? 'delivered' : $deliveryStatus,
            'invoice_status' => $invoiceStatus === 'complete' ? 'invoiced' : $invoiceStatus,
            'status' => ($deliveryStatus === 'complete' && $invoiceStatus === 'complete')
                ? 'closed'
                : ($order->status === 'closed' ? 'approved' : $order->status),
        ])->save();
    }

    protected function defaultSalesUnit(Item $item): ItemUnit
    {
        return ItemUnit::where('item_id', $item->id)
            ->orderByDesc('is_sales_default')
            ->orderByDesc('is_base')
            ->firstOr(fn () => throw DomainException::make('items.no_unit',
                "الصنف «{$item->name}» ليس له وحدة معرّفة.", ['item_id' => $item->id]));
    }
}
