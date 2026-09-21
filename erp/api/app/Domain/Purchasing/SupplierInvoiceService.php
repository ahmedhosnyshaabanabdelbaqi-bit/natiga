<?php

namespace App\Domain\Purchasing;

use App\Domain\Accounting\LedgerService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\GoodsReceiptLine;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\SupplierInvoiceLine;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Supplier invoice — the three-way match against receipt and order.
 *
 *   Dr  GRNI                   what the receipt said the goods were worth
 *   Dr  Input VAT              recoverable tax
 *   Dr/Cr  Inventory           the price variance, if the invoice disagrees
 *     Cr  Supplier                 invoice total
 *
 * Stock is NOT touched here — the receipt already added it. A price difference
 * is carried to inventory for the quantity still on hand and to COGS for the
 * part already sold, through InventoryService::applyLateCost.
 */
class SupplierInvoiceService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly InventoryService $inventory,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * @param  array<int, array{goods_receipt_line_id?: int|null, item_id?: int|null, expense_account_id?: int|null, qty_base?: string, unit_price: string, tax_rate?: string}>  $lines
     */
    public function create(array $header, array $lines): SupplierInvoice
    {
        return DB::transaction(function () use ($header, $lines) {
            $supplier = Supplier::findOrFail($header['supplier_id']);
            $invoiceDate = $header['invoice_date'] ?? now()->toDateString();

            $invoice = SupplierInvoice::create([
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('supplier_invoice'),
                'supplier_invoice_no' => $header['supplier_invoice_no'] ?? null,
                'supplier_id' => $supplier->id,
                'invoice_date' => $invoiceDate,
                'due_date' => $header['due_date']
                    ?? \Illuminate\Support\Carbon::parse($invoiceDate)
                        ->addDays((int) $supplier->payment_terms_days)->toDateString(),
                'status' => 'draft',
                'discount_amount' => Num::money($header['discount_amount'] ?? '0'),
                'notes' => $header['notes'] ?? null,
            ]);

            foreach ($lines as $input) {
                $this->addLine($invoice, $input);
            }

            $this->recalculate($invoice);

            return $invoice->fresh(['lines']);
        });
    }

    protected function addLine(SupplierInvoice $invoice, array $input): void
    {
        $receiptLine = isset($input['goods_receipt_line_id'])
            ? GoodsReceiptLine::findOrFail($input['goods_receipt_line_id'])
            : null;

        $qtyBase = Num::qty($input['qty_base'] ?? $receiptLine?->qty_base ?? '0');

        // Invoicing more than was received breaks the match — refuse it.
        if ($receiptLine) {
            $uninvoiced = $receiptLine->uninvoicedQtyBase();

            if (Num::cmp($qtyBase, $uninvoiced, Num::QTY_SCALE) > 0) {
                throw DomainException::make('purchasing.over_invoice', sprintf(
                    'الكمية المفوترة (%s) تتجاوز المستلم غير المفوتر (%s).', $qtyBase, $uninvoiced
                ), ['receipt_line_id' => $receiptLine->id, 'uninvoiced' => $uninvoiced]);
            }
        }

        $unitPrice = Num::round($input['unit_price'], 4);
        $taxRate = Num::of($input['tax_rate'] ?? '0');
        $net = Num::mul($qtyBase, $unitPrice);
        $tax = Num::pct($net, $taxRate);

        // Difference per base unit between what the invoice says and what the
        // receipt booked. Positive means the goods cost more than we recorded.
        $variance = $receiptLine
            ? Num::sub($unitPrice, $receiptLine->unit_cost)
            : '0';

        SupplierInvoiceLine::create([
            'supplier_invoice_id' => $invoice->id,
            'goods_receipt_line_id' => $receiptLine?->id,
            'item_id' => $input['item_id'] ?? $receiptLine?->item_id,
            'expense_account_id' => $input['expense_account_id'] ?? null,
            'qty_base' => $qtyBase,
            'unit_price' => $unitPrice,
            'tax_rate' => $taxRate,
            'tax_amount' => Num::money($tax),
            'line_total' => Num::money(Num::add($net, $tax, Num::MONEY_SCALE)),
            'price_variance' => Num::round($variance, 4),
            'note' => $input['note'] ?? null,
        ]);
    }

    public function post(SupplierInvoice $invoice): SupplierInvoice
    {
        return DB::transaction(function () use ($invoice) {
            $invoice = SupplierInvoice::with(['lines.goodsReceiptLine', 'supplier'])
                ->lockForUpdate()->findOrFail($invoice->id);

            if ($invoice->status === 'posted') {
                return $invoice;
            }
            if ($invoice->lines->isEmpty()) {
                throw DomainException::make('purchasing.invoice_empty',
                    'لا يمكن ترحيل فاتورة مورد بدون سطور.', ['invoice_id' => $invoice->id]);
            }

            $this->recalculate($invoice);
            $invoice->refresh()->load('lines.goodsReceiptLine');

            $accounts = $this->ledger->accounts();
            $draft = $this->ledger->draftFor(
                'supplier_invoice', $invoice->id, $invoice->invoice_date->toDateString(),
                "فاتورة مورد {$invoice->code} — {$invoice->supplier->name}"
            );

            $grniToClear = '0';
            $varianceToInventory = '0';
            $varianceToCogs = '0';

            foreach ($invoice->lines as $line) {
                $receiptLine = $line->goodsReceiptLine;

                if ($receiptLine) {
                    // Clear GRNI at the value the receipt booked, not the invoice's.
                    $grniToClear = Num::add($grniToClear,
                        Num::mul($line->qty_base, $receiptLine->unit_cost), Num::MONEY_SCALE);

                    if (! Num::isZero($line->price_variance, 4)) {
                        $varianceAmount = Num::mul($line->qty_base, $line->price_variance);

                        // Split the variance the same way a late cost is split:
                        // what is still on hand lifts the average, what is sold
                        // hits COGS. History is not rewritten.
                        $onHand = $this->inventory->currentOnHandForItem($receiptLine->item_id);
                        $split = $this->inventory->applyLateCost(
                            $receiptLine->item_id,
                            $varianceAmount,
                            Num::min($onHand, (string) $line->qty_base),
                            (string) $line->qty_base
                        );

                        $varianceToInventory = Num::add($varianceToInventory, $split['to_inventory'], Num::MONEY_SCALE);
                        $varianceToCogs = Num::add($varianceToCogs, $split['to_cogs'], Num::MONEY_SCALE);
                    }

                    $receiptLine->forceFill([
                        'qty_invoiced_base' => Num::qty(
                            Num::add($receiptLine->qty_invoiced_base, $line->qty_base)
                        ),
                    ])->save();
                } elseif ($line->expense_account_id) {
                    // A service or expense line on a supplier invoice.
                    $draft->debit($line->expense_account_id,
                        Num::sub($line->line_total, $line->tax_amount, Num::MONEY_SCALE),
                        $line->note ?? 'مصروف على فاتورة مورد');
                } else {
                    // Invoice without a prior receipt: the goods are billed but
                    // not yet in stock, so this sits in GRNI the other way round.
                    $draft->debit($accounts->key('grni'),
                        Num::sub($line->line_total, $line->tax_amount, Num::MONEY_SCALE),
                        'فاتورة قبل الاستلام', 'supplier', $invoice->supplier_id);
                }
            }

            if (Num::isPositive($grniToClear, Num::MONEY_SCALE)) {
                $draft->debit($accounts->key('grni'), $grniToClear,
                    'إقفال بضاعة مستلمة غير مفوترة', 'supplier', $invoice->supplier_id);
            }

            if (! Num::isZero($varianceToInventory, Num::MONEY_SCALE)) {
                $draft->signed($accounts->key('inventory'), $varianceToInventory,
                    'debit', 'فرق سعر على المخزون القائم');
            }
            if (! Num::isZero($varianceToCogs, Num::MONEY_SCALE)) {
                $draft->signed($accounts->key('cogs'), $varianceToCogs,
                    'debit', 'فرق سعر على البضاعة المباعة');
            }

            if (Num::isPositive($invoice->tax_amount, Num::MONEY_SCALE)) {
                $draft->debit($accounts->key('vat_input'), $invoice->tax_amount, 'ضريبة مشتريات');
            }

            $draft->credit($accounts->forSupplier($invoice->supplier), $invoice->total,
                'التزام تجاه المورد', 'supplier', $invoice->supplier_id);

            $difference = $draft->difference();
            if (! Num::isZero($difference, Num::MONEY_SCALE)) {
                $draft->signed($accounts->key('rounding_difference'),
                    Num::neg($difference, Num::MONEY_SCALE), 'debit', 'فروق تقريب');
            }

            $entry = $this->ledger->post($draft);

            $invoice->forceFill([
                'status' => 'posted',
                'journal_entry_id' => $entry->id,
                'posted_at' => now(),
                'posted_by' => auth()->id(),
            ])->save();

            return $invoice->fresh(['lines']);
        });
    }

    public function recalculate(SupplierInvoice $invoice): SupplierInvoice
    {
        $invoice->load('lines');

        $subtotal = '0';
        $tax = '0';

        foreach ($invoice->lines as $line) {
            $subtotal = Num::add($subtotal,
                Num::sub($line->line_total, $line->tax_amount, Num::MONEY_SCALE), Num::MONEY_SCALE);
            $tax = Num::add($tax, $line->tax_amount, Num::MONEY_SCALE);
        }

        $invoice->forceFill([
            'subtotal' => Num::money($subtotal),
            'tax_amount' => Num::money($tax),
            'total' => Num::money(Num::add(
                Num::sub($subtotal, $invoice->discount_amount, Num::MONEY_SCALE), $tax, Num::MONEY_SCALE
            )),
        ])->save();

        return $invoice;
    }

    /** Received-but-unbilled, the figure that should agree with the GRNI account. */
    public function grniBalance(?int $supplierId = null): \Illuminate\Support\Collection
    {
        return DB::table('goods_receipt_lines as grl')
            ->join('goods_receipts as gr', 'gr.id', '=', 'grl.goods_receipt_id')
            ->join('suppliers as s', 's.id', '=', 'gr.supplier_id')
            ->join('items as i', 'i.id', '=', 'grl.item_id')
            ->where('gr.company_id', CompanyContext::idOrFail())
            ->where('gr.status', 'posted')
            ->whereRaw('grl.qty_base > grl.qty_invoiced_base')
            ->when($supplierId, fn ($q) => $q->where('gr.supplier_id', $supplierId))
            ->groupBy('s.id', 's.code', 's.name')
            ->selectRaw('
                s.id AS supplier_id, s.code, s.name,
                SUM((grl.qty_base - grl.qty_invoiced_base) * grl.unit_cost) AS uninvoiced_value,
                COUNT(DISTINCT gr.id) AS receipts
            ')
            ->orderByDesc('uninvoiced_value')
            ->get();
    }
}
