<?php

namespace App\Domain\Sales;

use App\Domain\Accounting\LedgerService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Pricing\PricingService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\SalesInvoice;
use App\Models\SalesInvoiceLine;
use App\Models\SalesReturn;
use App\Models\SalesReturnLine;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Customer returns.
 *
 * Physical receipt and financial approval are separate steps on purpose:
 *
 *   receive()  — goods come back and land in the warehouse matching their
 *                disposition. Only 'sellable' goes to saleable stock; the rest
 *                goes to inspection, damaged, or a supplier-return area.
 *   post()     — the credit note is raised and the ledger entry written.
 *
 * Cost handling: the return is valued at the cost the goods were SOLD at,
 * taken from the invoice line, not at today's average. Selling at 10 and
 * taking it back at 12 would manufacture a loss that never happened.
 */
class SalesReturnService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly PricingService $pricing,
        private readonly InvoiceService $invoices,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * @param  array<int, array{sales_invoice_line_id?: int|null, item_id?: int, qty: string, disposition?: string, batch_id?: int|null, unit_price?: string|null}>  $lines
     */
    public function create(array $header, array $lines): SalesReturn
    {
        return DB::transaction(function () use ($header, $lines) {
            $invoice = isset($header['sales_invoice_id'])
                ? SalesInvoice::with('lines')->findOrFail($header['sales_invoice_id'])
                : null;

            $withoutInvoice = $invoice === null;

            if ($withoutInvoice && empty($header['approval_id'])) {
                // Allowed, but never by default — it needs a recorded approval.
                throw DomainException::make('sales.return_without_invoice_needs_approval',
                    'المرتجع بدون فاتورة يحتاج موافقة مسجلة قبل الإنشاء.',
                    ['customer_id' => $header['customer_id'] ?? null]);
            }

            if ($invoice && $invoice->status !== 'posted') {
                throw DomainException::make('sales.return_invoice_not_posted',
                    "لا يمكن إنشاء مرتجع على فاتورة غير مرحّلة «{$invoice->code}».",
                    ['status' => $invoice->status]);
            }

            $warehouse = Warehouse::findOrFail($header['receipt_warehouse_id']);

            $return = SalesReturn::create([
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('sales_return'),
                'customer_id' => $header['customer_id'] ?? $invoice->customer_id,
                'sales_invoice_id' => $invoice?->id,
                'rep_id' => $header['rep_id'] ?? $invoice?->rep_id,
                'receipt_warehouse_id' => $warehouse->id,
                'return_date' => $header['return_date'] ?? now()->toDateString(),
                'reason' => $header['reason'] ?? null,
                'status' => 'draft',
                'without_invoice' => $withoutInvoice,
                'refund_method' => $header['refund_method'] ?? 'credit_note',
                'source' => $header['source'] ?? 'web',
                'device_id' => $header['device_id'] ?? null,
                'client_uuid' => $header['client_uuid'] ?? null,
                'notes' => $header['notes'] ?? null,
            ]);

            foreach ($lines as $input) {
                $this->addLine($return, $invoice, $input);
            }

            $this->recalculate($return);

            return $return->fresh(['lines']);
        });
    }

    protected function addLine(SalesReturn $return, ?SalesInvoice $invoice, array $input): void
    {
        $invoiceLine = isset($input['sales_invoice_line_id'])
            ? SalesInvoiceLine::findOrFail($input['sales_invoice_line_id'])
            : null;

        if ($invoiceLine && $invoice && $invoiceLine->sales_invoice_id !== $invoice->id) {
            throw DomainException::make('sales.return_line_mismatch',
                'سطر المرتجع لا ينتمي إلى الفاتورة المحددة.',
                ['line_id' => $invoiceLine->id]);
        }

        $item = $invoiceLine
            ? Item::findOrFail($invoiceLine->item_id)
            : Item::findOrFail($input['item_id']);

        $itemUnit = $invoiceLine
            ? ItemUnit::find($invoiceLine->item_unit_id)
            : $this->defaultSalesUnit($item);

        $factor = $invoiceLine?->unit_factor ?? $itemUnit->factor;
        $qtyInput = Num::qty($input['qty']);
        $qtyBase = Num::qty(Num::mul($qtyInput, $factor, Num::QTY_SCALE));

        // Never allow more back than went out, net of earlier returns.
        if ($invoiceLine) {
            $returnable = $invoiceLine->returnableQtyBase();

            if (Num::cmp($qtyBase, $returnable, Num::QTY_SCALE) > 0) {
                throw DomainException::make('sales.return_exceeds_sold', sprintf(
                    'الكمية المرتجعة من «%s» (%s) تتجاوز المتبقي القابل للإرجاع (%s).',
                    $item->name, $qtyBase, $returnable
                ), [
                    'item_id' => $item->id,
                    'requested' => $qtyBase,
                    'returnable' => $returnable,
                ]);
            }
        }

        $unitPrice = $invoiceLine?->unit_price ?? Num::round($input['unit_price'] ?? '0', 4);
        $discountPct = $invoiceLine?->discount_pct ?? '0';
        $taxRate = $invoiceLine?->tax_rate ?? '0';
        $isBonus = (bool) ($invoiceLine?->is_bonus ?? false);

        $computed = $this->pricing->computeLine(
            $qtyInput, $isBonus ? '0' : $unitPrice, $discountPct, '0', $isBonus ? '0' : $taxRate
        );

        SalesReturnLine::create([
            'sales_return_id' => $return->id,
            'sales_invoice_line_id' => $invoiceLine?->id,
            'item_id' => $item->id,
            'batch_id' => $input['batch_id'] ?? $invoiceLine?->batch_id,
            'item_unit_id' => $itemUnit?->id,
            'unit_factor' => $factor,
            'qty_input' => $qtyInput,
            'qty_base' => $qtyBase,
            'unit_price' => $isBonus ? '0' : $unitPrice,
            'discount_pct' => $discountPct,
            'tax_rate' => $isBonus ? '0' : $taxRate,
            'tax_amount' => $computed['tax_amount'],
            'line_total' => $computed['total'],
            'disposition' => $input['disposition'] ?? 'inspection',
            // Cost frozen at the point of sale — the whole reason this column exists.
            'original_unit_cost' => $invoiceLine?->unit_cost
                ?? $this->inventory->currentAverageCost($item->id),
            'is_bonus' => $isBonus,
        ]);
    }

    /**
     * Take the goods in. Each line lands in the warehouse its disposition says,
     * which is how "not everything comes back sellable" is enforced rather than
     * merely intended.
     *
     * @param  array<string, int>  $dispositionWarehouses  disposition => warehouse id
     */
    public function receive(SalesReturn $return, array $dispositionWarehouses = []): SalesReturn
    {
        return DB::transaction(function () use ($return, $dispositionWarehouses) {
            $return = SalesReturn::with('lines')->lockForUpdate()->findOrFail($return->id);

            if (in_array($return->status, ['received', 'inspected', 'posted'], true)) {
                return $return;
            }

            foreach ($return->lines as $line) {
                $warehouseId = $this->warehouseForDisposition(
                    $line->disposition, $return->receipt_warehouse_id, $dispositionWarehouses
                );

                $this->inventory->receive(
                    warehouseId: $warehouseId,
                    itemId: $line->item_id,
                    qtyBase: (string) $line->qty_base,
                    unitCost: (string) $line->original_unit_cost,
                    docType: 'sales_return',
                    docId: $return->id,
                    docLineId: $line->id,
                    batchId: $line->batch_id,
                    movedAt: $return->return_date,
                    reason: 'customer_return_'.$line->disposition,
                );

                $line->forceFill([
                    'cogs_amount' => Num::round(
                        Num::mul($line->qty_base, $line->original_unit_cost), 4
                    ),
                ])->save();
            }

            $return->forceFill([
                'status' => 'received',
                'received_by' => auth()->id(),
                'received_at' => now(),
            ])->save();

            return $return->fresh(['lines']);
        });
    }

    /**
     * Raise the credit note and post it.
     *
     *   Dr  Sales returns        net of discount
     *   Dr  Output VAT           tax reversed
     *     Cr  Customer / Cash        total
     *   Dr  Inventory            cost of goods returned
     *     Cr  COGS                   same
     */
    public function post(SalesReturn $return): SalesReturn
    {
        return DB::transaction(function () use ($return) {
            $return = SalesReturn::with(['lines', 'customer', 'invoice'])
                ->lockForUpdate()->findOrFail($return->id);

            if ($return->status === 'posted') {
                return $return;
            }
            if ($return->status === 'draft') {
                throw DomainException::make('sales.return_not_received',
                    "لا يمكن ترحيل مرتجع لم يتم استلامه فعليًا «{$return->code}».",
                    ['status' => $return->status]);
            }

            $this->recalculate($return);
            $return->refresh()->load('lines');

            $accounts = $this->ledger->accounts();
            $draft = $this->ledger->draftFor(
                'sales_return', $return->id, $return->return_date->toDateString(),
                "مرتجع مبيعات {$return->code} — {$return->customer->name}"
            );

            $netReturn = Num::sub($return->total, $return->tax_amount, Num::MONEY_SCALE);

            $draft->debit($accounts->key('sales_returns'), $netReturn, 'قيمة المرتجع');

            if (Num::isPositive($return->tax_amount, Num::MONEY_SCALE)) {
                $draft->debit($accounts->key('vat_output'), $return->tax_amount, 'عكس ضريبة المبيعات');
            }

            if ($return->refund_method === 'cash') {
                $draft->credit(
                    $return->rep_id ? $accounts->forCustody($return->rep_id) : $accounts->key('cash_on_hand'),
                    $return->total, 'رد نقدي للعميل', 'customer', $return->customer_id
                );
            } else {
                $draft->credit($accounts->forCustomer($return->customer), $return->total,
                    'تخفيض مديونية العميل', 'customer', $return->customer_id);
            }

            if (Num::isPositive($return->cogs_amount, Num::MONEY_SCALE)) {
                $draft->debit($accounts->key('inventory'), $return->cogs_amount, 'إعادة البضاعة للمخزون');
                $draft->credit($accounts->key('cogs'), $return->cogs_amount, 'عكس تكلفة المبيعات');
            }

            $difference = $draft->difference();
            if (! Num::isZero($difference, Num::MONEY_SCALE)) {
                $draft->signed($accounts->key('rounding_difference'),
                    Num::neg($difference, Num::MONEY_SCALE), 'debit', 'فروق تقريب');
            }

            $entry = $this->ledger->post($draft);

            // Roll the effect onto the invoice exactly once.
            foreach ($return->lines as $line) {
                if ($invoiceLine = $line->salesInvoiceLine) {
                    $invoiceLine->forceFill([
                        'qty_returned_base' => Num::qty(
                            Num::add($invoiceLine->qty_returned_base, $line->qty_base)
                        ),
                    ])->save();
                }
            }

            if ($invoice = $return->invoice) {
                $invoice->forceFill([
                    'returned_amount' => Num::money(
                        Num::add($invoice->returned_amount, $return->total, Num::MONEY_SCALE)
                    ),
                ])->save();
                $this->invoices->refreshPaymentStatus($invoice);
            }

            $return->forceFill([
                'status' => 'posted',
                'journal_entry_id' => $entry->id,
                'approved_by' => auth()->id(),
                'posted_at' => now(),
            ])->save();

            return $return->fresh(['lines']);
        });
    }

    public function recalculate(SalesReturn $return): SalesReturn
    {
        $return->load('lines');

        $subtotal = '0';
        $tax = '0';
        $total = '0';
        $cogs = '0';

        foreach ($return->lines as $line) {
            $subtotal = Num::add($subtotal, Num::mul($line->qty_input, $line->unit_price), Num::MONEY_SCALE);
            $tax = Num::add($tax, $line->tax_amount, Num::MONEY_SCALE);
            $total = Num::add($total, $line->line_total, Num::MONEY_SCALE);
            $cogs = Num::add($cogs, $line->cogs_amount, Num::MONEY_SCALE);
        }

        $return->forceFill([
            'subtotal' => Num::money($subtotal),
            'tax_amount' => Num::money($tax),
            'total' => Num::money($total),
            'cogs_amount' => Num::money($cogs),
        ])->save();

        return $return;
    }

    /**
     * Resolve where a disposition's goods belong.
     *
     * Falls back to the company's standing warehouse for that purpose, and only
     * then to the nominated receipt warehouse — so a mis-typed request cannot
     * quietly put damaged goods back on sale.
     */
    protected function warehouseForDisposition(string $disposition, int $default, array $overrides): int
    {
        if (isset($overrides[$disposition])) {
            return $overrides[$disposition];
        }

        $kind = match ($disposition) {
            'sellable' => null,
            'damaged' => 'damaged',
            'return_to_supplier' => 'returns',
            default => 'inspection',
        };

        if ($kind === null) {
            return $default;
        }

        $warehouse = Warehouse::query()
            ->where('kind', $kind)
            ->where('is_active', true)
            ->first();

        if (! $warehouse) {
            throw DomainException::make('inventory.disposition_warehouse_missing',
                "لا يوجد مخزن من نوع «{$kind}» لاستقبال المرتجعات بحالة «{$disposition}». أنشئه من إعدادات المخازن.",
                ['disposition' => $disposition, 'kind' => $kind]);
        }

        return $warehouse->id;
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
