<?php

namespace App\Domain\Sales;

use App\Domain\Accounting\LedgerService;
use App\Domain\Credit\CreditService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Pricing\PricingService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Customer;
use App\Models\DeliveryNote;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\JournalEntry;
use App\Models\SalesInvoice;
use App\Models\SalesInvoiceLine;
use App\Models\SalesOrder;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Sales invoicing and the posting that goes with it.
 *
 * Two shapes exist and they are kept explicitly apart:
 *
 *   - Invoice against a delivery note. The goods already left. `moves_stock`
 *     is false; the invoice reads the cost frozen on the delivery line.
 *   - Direct / van invoice. There is no delivery note, so this document is the
 *     shipping event too. `moves_stock` is true and stock is issued here, once.
 *
 * Posting (see docs/04-posting-matrix.md):
 *   Dr  Customer / Cash        total
 *     Cr  Sales revenue            net of discount
 *     Cr  Output VAT               tax
 *     Cr  Delivery income          delivery fee, when charged
 *   Dr  COGS                   cost of goods actually shipped
 *     Cr  Inventory                same
 *
 * Both halves go in one balanced entry inside one transaction.
 */
class InvoiceService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly PricingService $pricing,
        private readonly CreditService $credit,
        private readonly SalesOrderService $orders,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * Raise an invoice for what a delivery note actually delivered.
     *
     * Prices come from the order line — the terms agreed when the order was
     * approved — not from today's price list.
     */
    public function createFromDelivery(DeliveryNote $note, array $header = []): SalesInvoice
    {
        return DB::transaction(function () use ($note, $header) {
            $note = DeliveryNote::with(['lines.salesOrderLine', 'lines.item'])
                ->lockForUpdate()->findOrFail($note->id);

            if (! $note->hasLeftStock()) {
                throw DomainException::make('sales.delivery_not_confirmed',
                    "لا يمكن فوترة إذن تسليم غير مؤكد «{$note->code}».",
                    ['status' => $note->status]);
            }

            $order = $note->order;
            $customer = $note->customer;

            $invoice = SalesInvoice::create([
                'company_id' => CompanyContext::idOrFail(),
                'branch_id' => $order?->branch_id,
                'code' => $this->numbering->next('sales_invoice', $order?->branch_id),
                'customer_id' => $customer->id,
                'sales_order_id' => $note->sales_order_id,
                'delivery_note_id' => $note->id,
                'rep_id' => $note->rep_id ?? $order?->rep_id,
                'warehouse_id' => $note->warehouse_id,
                'cost_center_id' => $order?->cost_center_id,
                'invoice_date' => $header['invoice_date'] ?? now()->toDateString(),
                'due_date' => $header['due_date']
                    ?? now()->addDays((int) $customer->payment_terms_days)->toDateString(),
                'payment_type' => $header['payment_type'] ?? $order?->payment_type ?? 'credit',
                'status' => 'draft',
                'moves_stock' => false,    // the delivery note already moved it
                'doc_discount_amount' => Num::money($header['doc_discount_amount'] ?? $order?->doc_discount_amount ?? '0'),
                'delivery_fee' => Num::money($header['delivery_fee'] ?? $order?->delivery_fee ?? '0'),
                'source' => $header['source'] ?? 'web',
                'notes' => $header['notes'] ?? null,
            ]);

            foreach ($note->lines as $line) {
                if (! Num::isPositive($line->qty_delivered_base, Num::QTY_SCALE)) {
                    continue;
                }

                $uninvoiced = Num::sub($line->qty_delivered_base, $line->qty_invoiced_base, Num::QTY_SCALE);
                if (! Num::isPositive($uninvoiced, Num::QTY_SCALE)) {
                    continue;
                }

                $orderLine = $line->salesOrderLine;
                $itemUnit = $orderLine?->itemUnit ?? $this->defaultSalesUnit($line->item);
                $factor = $orderLine?->unit_factor ?? $itemUnit->factor;
                $qtyInput = Num::qty(Num::div($uninvoiced, $factor, Num::QTY_SCALE));

                $unitPrice = $orderLine?->unit_price ?? '0';
                $discountPct = $orderLine?->discount_pct ?? '0';
                $taxRate = $orderLine?->tax_rate ?? '0';

                $computed = $this->pricing->computeLine($qtyInput, $unitPrice, $discountPct, '0', $taxRate);

                SalesInvoiceLine::create([
                    'sales_invoice_id' => $invoice->id,
                    'sales_order_line_id' => $orderLine?->id,
                    'delivery_note_line_id' => $line->id,
                    'item_id' => $line->item_id,
                    'batch_id' => $line->batch_id,
                    'item_unit_id' => $itemUnit->id,
                    'unit_factor' => $factor,
                    'qty_input' => $qtyInput,
                    'qty_base' => $uninvoiced,
                    'unit_price' => $unitPrice,
                    'discount_pct' => $discountPct,
                    'discount_amount' => $computed['discount_amount'],
                    'tax_rate' => $taxRate,
                    'tax_amount' => $computed['tax_amount'],
                    'line_total' => $computed['total'],
                    // The cost the goods actually left at, captured on delivery.
                    'unit_cost' => $line->unit_cost,
                    'cogs_amount' => Num::round(Num::mul($uninvoiced, $line->unit_cost), 4),
                    'is_bonus' => (bool) ($orderLine?->is_bonus ?? false),
                    'promotion_id' => $orderLine?->promotion_id,
                ]);

                $line->forceFill([
                    'qty_invoiced_base' => Num::qty(Num::add($line->qty_invoiced_base, $uninvoiced)),
                ])->save();

                $orderLine?->forceFill([
                    'qty_invoiced_base' => Num::qty(Num::add($orderLine->qty_invoiced_base, $uninvoiced)),
                ])->save();
            }

            $this->recalculate($invoice);

            if ($order) {
                $this->orders->refreshFulfilmentStatus($order);
            }

            return $invoice->fresh(['lines']);
        });
    }

    /**
     * Direct sale with no prior order or delivery note — the van-sale shape.
     *
     * This document is both the shipping event and the billing event, so it is
     * flagged moves_stock and issues the goods when posted.
     *
     * @param  array<int, array{item_id: int, item_unit_id?: int|null, qty: string, unit_price?: string|null, discount_pct?: string|null, batch_id?: int|null, is_bonus?: bool}>  $lines
     */
    public function createDirect(array $header, array $lines): SalesInvoice
    {
        return DB::transaction(function () use ($header, $lines) {
            $customer = Customer::findOrFail($header['customer_id']);
            $warehouse = Warehouse::findOrFail($header['warehouse_id']);
            $invoiceDate = $header['invoice_date'] ?? now()->toDateString();

            $invoice = SalesInvoice::create([
                'company_id' => CompanyContext::idOrFail(),
                'branch_id' => $header['branch_id'] ?? $warehouse->branch_id,
                'code' => $this->numbering->next('sales_invoice', $header['branch_id'] ?? null),
                'customer_id' => $customer->id,
                'rep_id' => $header['rep_id'] ?? $customer->currentRepId(),
                'warehouse_id' => $warehouse->id,
                'cost_center_id' => $header['cost_center_id'] ?? null,
                'invoice_date' => $invoiceDate,
                'due_date' => $header['due_date']
                    ?? now()->addDays((int) $customer->payment_terms_days)->toDateString(),
                'payment_type' => $header['payment_type'] ?? 'cash',
                'status' => 'draft',
                'moves_stock' => true,     // no delivery note exists; this ships
                'doc_discount_amount' => Num::money($header['doc_discount_amount'] ?? '0'),
                'delivery_fee' => Num::money($header['delivery_fee'] ?? '0'),
                'source' => $header['source'] ?? 'web',
                'device_id' => $header['device_id'] ?? null,
                'client_uuid' => $header['client_uuid'] ?? null,
                'field_no' => $header['field_no'] ?? null,
                'notes' => $header['notes'] ?? null,
            ]);

            foreach ($lines as $input) {
                $item = Item::findOrFail($input['item_id']);
                $itemUnit = isset($input['item_unit_id'])
                    ? ItemUnit::where('item_id', $item->id)->findOrFail($input['item_unit_id'])
                    : $this->defaultSalesUnit($item);

                $qtyInput = Num::qty($input['qty']);
                $isBonus = (bool) ($input['is_bonus'] ?? false);

                $price = $this->pricing->resolve($customer, $item, $itemUnit, $qtyInput, $invoiceDate);
                $unitPrice = $isBonus ? '0'
                    : (isset($input['unit_price']) && $input['unit_price'] !== null
                        ? Num::round($input['unit_price'], 4)
                        : $price->unitPrice);
                $discountPct = $isBonus ? '0' : ($input['discount_pct'] ?? $price->discountPct);
                $taxRate = ($item->is_taxable && ! $isBonus) ? Num::of($item->taxRate?->rate ?? '0') : '0';

                $computed = $this->pricing->computeLine(
                    $qtyInput, $unitPrice, $discountPct, '0', $taxRate, $price->priceIncludesTax
                );

                SalesInvoiceLine::create([
                    'sales_invoice_id' => $invoice->id,
                    'item_id' => $item->id,
                    'batch_id' => $input['batch_id'] ?? null,
                    'item_unit_id' => $itemUnit->id,
                    'unit_factor' => $itemUnit->factor,
                    'qty_input' => $qtyInput,
                    'qty_base' => Num::qty($itemUnit->toBase($qtyInput)),
                    'unit_price' => $unitPrice,
                    'discount_pct' => Num::of($discountPct),
                    'discount_amount' => $computed['discount_amount'],
                    'tax_rate' => $taxRate,
                    'tax_amount' => $computed['tax_amount'],
                    'line_total' => $computed['total'],
                    'is_bonus' => $isBonus,
                    // unit_cost is filled at posting time, from the movement.
                ]);
            }

            $this->recalculate($invoice);

            return $invoice->fresh(['lines']);
        });
    }

    /**
     * Post the invoice: move stock if this document owns that event, then write
     * one balanced journal entry.
     *
     * Reposting is a no-op — the source-uniqueness index on journal_entries and
     * the status check here both stop a retried request duplicating anything.
     */
    public function post(SalesInvoice $invoice, bool $creditOverrideApproved = false): SalesInvoice
    {
        return DB::transaction(function () use ($invoice, $creditOverrideApproved) {
            $invoice = SalesInvoice::with(['lines.item', 'customer'])
                ->lockForUpdate()->findOrFail($invoice->id);

            if ($invoice->status === 'posted') {
                return $invoice;
            }
            if ($invoice->status === 'cancelled') {
                throw DomainException::make('sales.invoice_cancelled',
                    "الفاتورة «{$invoice->code}» ملغاة.", ['invoice_id' => $invoice->id]);
            }
            if ($invoice->lines->isEmpty()) {
                throw DomainException::make('sales.invoice_empty',
                    'لا يمكن ترحيل فاتورة بدون سطور.', ['invoice_id' => $invoice->id]);
            }

            if ($invoice->payment_type !== 'cash' && ! $creditOverrideApproved) {
                $this->credit->assert($invoice->customer, (string) $invoice->total);
            }

            // ---- stock, only when this document is the shipping event --------
            $totalCogs = '0';

            foreach ($invoice->lines as $line) {
                if ($invoice->moves_stock) {
                    $item = $line->item;
                    $picks = ($item->track_batches && ! $line->batch_id)
                        ? $this->inventory->allocateBatches(
                            $invoice->warehouse_id, $item, (string) $line->qty_base, $invoice->invoice_date)
                        : collect([['batch_id' => $line->batch_id, 'qty_base' => (string) $line->qty_base]]);

                    $lineCost = '0';
                    $firstBatchId = $line->batch_id;

                    foreach ($picks as $pick) {
                        $movement = $this->inventory->issue(
                            warehouseId: $invoice->warehouse_id,
                            itemId: $line->item_id,
                            qtyBase: $pick['qty_base'],
                            docType: 'sales_invoice',
                            docId: $invoice->id,
                            docLineId: $line->id,
                            batchId: $pick['batch_id'],
                            movedAt: $invoice->invoice_date,
                            reason: $line->is_bonus ? 'sale_bonus' : 'sale_direct',
                        );
                        $lineCost = Num::add($lineCost, $movement->value);
                        $firstBatchId ??= $pick['batch_id'];
                    }

                    $unitCost = Num::div($lineCost, (string) $line->qty_base);
                    $line->forceFill([
                        'batch_id' => $firstBatchId,
                        'unit_cost' => Num::round($unitCost, 8),
                        'cogs_amount' => Num::round($lineCost, 4),
                    ])->save();
                }

                $totalCogs = Num::add($totalCogs, $line->cogs_amount, Num::MONEY_SCALE);
            }

            $invoice->forceFill(['cogs_amount' => Num::money($totalCogs)])->save();

            // ---- posting -----------------------------------------------------
            $entry = $this->postJournal($invoice);

            $invoice->forceFill([
                'status' => 'posted',
                'journal_entry_id' => $entry->id,
                'posted_at' => now(),
                'posted_by' => auth()->id(),
                'payment_status' => $invoice->payment_type === 'cash' ? 'paid' : 'unpaid',
                'paid_amount' => $invoice->payment_type === 'cash'
                    ? Num::money($invoice->total) : Num::money($invoice->paid_amount),
            ])->save();

            if ($invoice->order) {
                $this->orders->refreshFulfilmentStatus($invoice->order);
            }

            return $invoice->fresh(['lines']);
        });
    }

    protected function postJournal(SalesInvoice $invoice): JournalEntry
    {
        $accounts = $this->ledger->accounts();

        $draft = $this->ledger->draftFor(
            'sales_invoice', $invoice->id, $invoice->invoice_date->toDateString(),
            "فاتورة مبيعات {$invoice->code} — {$invoice->customer->name}"
        );

        $netRevenue = '0';
        foreach ($invoice->lines as $line) {
            $netRevenue = Num::add($netRevenue,
                Num::sub($line->line_total, $line->tax_amount, Num::MONEY_SCALE), Num::MONEY_SCALE);
        }
        // A document-level discount reduces revenue, it is not an expense.
        $netRevenue = Num::sub($netRevenue, $invoice->doc_discount_amount, Num::MONEY_SCALE);

        // Debit side: where the money is owed or landed.
        if ($invoice->payment_type === 'cash') {
            $draft->debit(
                $invoice->rep_id
                    ? $accounts->forCustody($invoice->rep_id)   // van sale: rep holds the cash
                    : $accounts->key('cash_on_hand'),
                $invoice->total,
                'تحصيل نقدي مقابل الفاتورة',
                'customer', $invoice->customer_id
            );
        } else {
            $draft->debit(
                $accounts->forCustomer($invoice->customer),
                $invoice->total,
                'مديونية العميل',
                'customer', $invoice->customer_id
            );
        }

        $draft->credit($accounts->key('sales_revenue'), $netRevenue,
            'صافي المبيعات', null, null, $invoice->cost_center_id);

        if (Num::isPositive($invoice->tax_amount, Num::MONEY_SCALE)) {
            $draft->credit($accounts->key('vat_output'), $invoice->tax_amount, 'ضريبة القيمة المضافة');
        }

        if (Num::isPositive($invoice->delivery_fee, Num::MONEY_SCALE)) {
            $draft->credit($accounts->key('delivery_income'), $invoice->delivery_fee, 'مصاريف توصيل');
        }

        // Cost of sales — including the cost of free goods, which is real.
        if (Num::isPositive($invoice->cogs_amount, Num::MONEY_SCALE)) {
            $draft->debit($accounts->key('cogs'), $invoice->cogs_amount,
                'تكلفة المبيعات', null, null, $invoice->cost_center_id);
            $draft->credit($accounts->key('inventory'), $invoice->cogs_amount, 'صرف من المخزون');
        }

        // Absorb sub-piastre rounding so the entry balances exactly.
        $difference = $draft->difference();
        if (! Num::isZero($difference, Num::MONEY_SCALE)) {
            $draft->signed($accounts->key('rounding_difference'), Num::neg($difference, Num::MONEY_SCALE),
                'debit', 'فروق تقريب');
        }

        return $this->ledger->post($draft);
    }

    /**
     * Cancel a posted invoice by reversing its entry and returning the goods.
     *
     * Nothing is deleted. Where stock left through this document it comes back
     * at the same cost it left at, so the average is not disturbed by the
     * cancellation itself.
     */
    public function cancel(SalesInvoice $invoice, string $reason): SalesInvoice
    {
        return DB::transaction(function () use ($invoice, $reason) {
            $invoice = SalesInvoice::with('lines')->lockForUpdate()->findOrFail($invoice->id);

            if ($invoice->status === 'cancelled') {
                return $invoice;
            }
            if (Num::isPositive($invoice->paid_amount, Num::MONEY_SCALE)) {
                throw DomainException::make('sales.invoice_has_payments',
                    "الفاتورة «{$invoice->code}» عليها تحصيلات؛ استخدم إشعارًا دائنًا بدل الإلغاء.",
                    ['paid_amount' => (string) $invoice->paid_amount]);
            }

            if ($invoice->status === 'posted') {
                if ($invoice->moves_stock) {
                    foreach ($invoice->lines as $line) {
                        $this->inventory->receive(
                            warehouseId: $invoice->warehouse_id,
                            itemId: $line->item_id,
                            qtyBase: (string) $line->qty_base,
                            unitCost: (string) $line->unit_cost,
                            docType: 'sales_invoice_cancel',
                            docId: $invoice->id,
                            docLineId: $line->id,
                            batchId: $line->batch_id,
                            reason: 'invoice_cancelled',
                        );
                    }
                }

                if ($entry = JournalEntry::find($invoice->journal_entry_id)) {
                    $this->ledger->reverse($entry, now()->toDateString(),
                        "إلغاء الفاتورة {$invoice->code}: {$reason}");
                }
            }

            $invoice->forceFill([
                'status' => 'cancelled',
                'notes' => trim(($invoice->notes ?? '')."\nسبب الإلغاء: {$reason}"),
            ])->save();

            return $invoice;
        });
    }

    public function recalculate(SalesInvoice $invoice): SalesInvoice
    {
        $invoice->load('lines');

        $subtotal = '0';
        $lineDiscount = '0';
        $tax = '0';
        $lineTotals = '0';

        foreach ($invoice->lines as $line) {
            $subtotal = Num::add($subtotal, Num::mul($line->qty_input, $line->unit_price), Num::MONEY_SCALE);
            $lineDiscount = Num::add($lineDiscount, $line->discount_amount, Num::MONEY_SCALE);
            $tax = Num::add($tax, $line->tax_amount, Num::MONEY_SCALE);
            $lineTotals = Num::add($lineTotals, $line->line_total, Num::MONEY_SCALE);
        }

        $total = Num::add(
            Num::sub($lineTotals, $invoice->doc_discount_amount, Num::MONEY_SCALE),
            $invoice->delivery_fee,
            Num::MONEY_SCALE
        );

        $invoice->forceFill([
            'subtotal' => Num::money($subtotal),
            'line_discount_amount' => Num::money($lineDiscount),
            'tax_amount' => Num::money($tax),
            'total' => Num::money($total),
        ])->save();

        return $invoice;
    }

    /** Recompute payment status after a receipt is allocated or reversed. */
    public function refreshPaymentStatus(SalesInvoice $invoice): void
    {
        $paid = DB::table('receipt_allocations as ra')
            ->join('receipts as r', 'r.id', '=', 'ra.receipt_id')
            ->where('ra.sales_invoice_id', $invoice->id)
            ->where('r.status', 'posted')
            ->sum('ra.amount');

        $paid = Num::money($paid);
        $outstanding = Num::sub(Num::sub($invoice->total, $paid, Num::MONEY_SCALE),
            $invoice->returned_amount, Num::MONEY_SCALE);

        $invoice->forceFill([
            'paid_amount' => $paid,
            'payment_status' => match (true) {
                ! Num::isPositive($outstanding, Num::MONEY_SCALE) => 'paid',
                Num::isPositive($paid, Num::MONEY_SCALE) => 'partial',
                default => 'unpaid',
            },
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
