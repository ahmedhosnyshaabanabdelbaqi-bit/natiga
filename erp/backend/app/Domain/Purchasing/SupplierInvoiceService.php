<?php

namespace App\Domain\Purchasing;

use App\Domain\Accounting\LedgerPoster;
use App\Domain\Accounting\PostingMatrix;
use App\Domain\Inventory\CostEngine;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\GoodsReceiptLine;
use App\Models\ItemUom;
use App\Models\SupplierInvoice;
use App\Models\SupplierInvoiceLine;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * فاتورة المورد — تثبت الالتزام المالي فقط، ولا تضيف المخزون مرة ثانية.
 *
 * القيد: من ح/ بضاعة مستلمة غير مفوترة (بقيمة الاستلام)
 *        + من ح/ ضريبة مدخلات
 *        + فرق السعر إلى ح/ المخزون (زيادة أو نقصًا)
 *        إلى ح/ الموردون
 *
 * اختلاف الكمية أو السعر بين الاستلام والفاتورة يُعالَج صراحةً ولا يُخفى.
 */
class SupplierInvoiceService
{
    public function __construct(
        private readonly LedgerPoster $ledger,
        private readonly PostingMatrix $matrix,
        private readonly CostEngine $costs,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function createAndPost(array $data): SupplierInvoice
    {
        return DB::transaction(function () use ($data) {
            $invoice = $this->create($data);

            return $this->post($invoice, $data['user_id'] ?? null);
        });
    }

    public function create(array $data): SupplierInvoice
    {
        $companyId = (int) $data['company_id'];

        if (empty($data['lines'])) {
            throw DomainException::make('supplier_invoice.no_lines', 'لا يمكن إنشاء فاتورة مورد بلا أصناف.');
        }

        $termDays = (int) ($data['payment_term_days'] ?? 0);

        $invoice = SupplierInvoice::create([
            'company_id' => $companyId,
            'branch_id' => $data['branch_id'] ?? null,
            'invoice_no' => $data['invoice_no'] ?? $this->numbers->next($companyId, 'supplier_invoice', $data['branch_id'] ?? null, $data['invoice_date']),
            'supplier_invoice_no' => $data['supplier_invoice_no'] ?? null,
            'invoice_date' => $data['invoice_date'],
            'due_date' => $data['due_date'] ?? now()->parse($data['invoice_date'])->addDays($termDays)->toDateString(),
            'supplier_id' => $data['supplier_id'],
            'purchase_order_id' => $data['purchase_order_id'] ?? null,
            'payment_type' => $data['payment_type'] ?? 'credit',
            'status' => 'draft',
            'notes' => $data['notes'] ?? null,
            'created_by' => $data['user_id'] ?? null,
        ]);

        $subtotal = Dec::of(0);
        $taxTotal = Dec::of(0);
        $discountTotal = Dec::of(0);
        $lineNo = 1;

        foreach ($data['lines'] as $line) {
            $factor = $this->uomFactor((int) $line['item_id'], (int) $line['uom_id']);
            $qtyUom = Dec::round($line['qty_uom'], Dec::SCALE_QTY);
            $qtyBase = Dec::round(Dec::mul($qtyUom, $factor), Dec::SCALE_QTY);
            $unitPrice = Dec::round($line['unit_price'], Dec::SCALE_MONEY);
            $discount = Dec::round($line['discount_amount'] ?? 0, Dec::SCALE_MONEY);
            $gross = Dec::round(Dec::mul($qtyUom, $unitPrice), Dec::SCALE_MONEY);
            $net = Dec::sub($gross, $discount);
            $taxRate = Dec::of($line['tax_rate'] ?? 0);
            $tax = Dec::round(Dec::div(Dec::mul($net, $taxRate), 100), Dec::SCALE_MONEY);

            // فرق السعر مقابل تكلفة الاستلام
            $variance = Dec::of(0);
            if (! empty($line['goods_receipt_line_id'])) {
                $receiptLine = GoodsReceiptLine::findOrFail($line['goods_receipt_line_id']);
                $receiptValueForQty = Dec::round(Dec::mul($qtyBase, $receiptLine->unit_cost), Dec::SCALE_MONEY);
                $variance = Dec::sub($net, $receiptValueForQty);

                $alreadyInvoiced = Dec::of($receiptLine->invoiced_qty_base);
                if (Dec::gt(Dec::add($alreadyInvoiced, $qtyBase), $receiptLine->qty_base)) {
                    throw DomainException::make(
                        'supplier_invoice.qty_exceeds_receipt',
                        "الكمية المفوترة تتجاوز الكمية المستلمة في سطر الاستلام #{$receiptLine->id}.",
                        ['received' => (string) $receiptLine->qty_base, 'already_invoiced' => (string) $alreadyInvoiced],
                    );
                }
            }

            SupplierInvoiceLine::create([
                'supplier_invoice_id' => $invoice->id,
                'line_no' => $lineNo++,
                'goods_receipt_line_id' => $line['goods_receipt_line_id'] ?? null,
                'item_id' => $line['item_id'],
                'uom_id' => $line['uom_id'],
                'uom_factor' => (string) $factor,
                'qty_uom' => (string) $qtyUom,
                'qty_base' => (string) $qtyBase,
                'unit_price' => (string) $unitPrice,
                'discount_amount' => (string) $discount,
                'tax_code_id' => $line['tax_code_id'] ?? null,
                'tax_rate' => (string) $taxRate,
                'tax_amount' => (string) $tax,
                'line_total' => (string) $net,
                'price_variance' => (string) Dec::round($variance, Dec::SCALE_MONEY),
            ]);

            $subtotal = Dec::add($subtotal, $gross);
            $discountTotal = Dec::add($discountTotal, $discount);
            $taxTotal = Dec::add($taxTotal, $tax);
        }

        $total = Dec::add(Dec::sub($subtotal, $discountTotal), $taxTotal);

        $invoice->update([
            'subtotal' => (string) Dec::round($subtotal, Dec::SCALE_MONEY),
            'discount_amount' => (string) Dec::round($discountTotal, Dec::SCALE_MONEY),
            'tax_amount' => (string) Dec::round($taxTotal, Dec::SCALE_MONEY),
            'total_amount' => (string) Dec::round($total, Dec::SCALE_MONEY),
        ]);

        return $invoice->fresh('lines');
    }

    public function post(SupplierInvoice $invoice, ?int $userId = null): SupplierInvoice
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->post($invoice, $userId));
        }

        $invoice = SupplierInvoice::lockForUpdate()->findOrFail($invoice->id);

        if ($invoice->status !== 'draft') {
            throw DomainException::make('supplier_invoice.not_draft', "فاتورة المورد {$invoice->invoice_no} ليست مسودة.");
        }

        $companyId = (int) $invoice->company_id;
        $grniAmount = Dec::of(0);
        $varianceAmount = Dec::of(0);
        $directPurchase = Dec::of(0);

        foreach ($invoice->lines as $line) {
            if ($line->goods_receipt_line_id) {
                $receiptLine = GoodsReceiptLine::lockForUpdate()->findOrFail($line->goods_receipt_line_id);
                $grniShare = Dec::round(Dec::mul($line->qty_base, $receiptLine->unit_cost), Dec::SCALE_MONEY);
                $grniAmount = Dec::add($grniAmount, $grniShare);
                $varianceAmount = Dec::add($varianceAmount, $line->price_variance);

                $receiptLine->invoiced_qty_base = (string) Dec::add($receiptLine->invoiced_qty_base, $line->qty_base);
                $receiptLine->save();

                // فرق السعر يعدّل قيمة المخزون والمتوسط (البضاعة ما زالت مملوكة)
                if (! Dec::isZero($line->price_variance)) {
                    $this->costs->adjustValue($companyId, (int) $line->item_id, $line->price_variance, 'supplier_invoice', (int) $invoice->id);
                }
            } else {
                // فاتورة بلا استلام مسبق (خدمات أو شراء مباشر) — لا أثر مخزني هنا
                $directPurchase = Dec::add($directPurchase, $line->line_total);
            }
        }

        $entryLines = [];

        if (! Dec::isZero($grniAmount)) {
            $entryLines[] = [
                'account_id' => $this->matrix->accountId($companyId, 'supplier_invoice', 'grni'),
                'debit' => (string) Dec::round($grniAmount, Dec::SCALE_MONEY),
                'partner_type' => 'supplier',
                'partner_id' => (int) $invoice->supplier_id,
                'description' => 'تسوية بضاعة مستلمة غير مفوترة',
            ];
        }

        if (! Dec::isZero($varianceAmount)) {
            $inventoryAccount = $this->matrix->accountId($companyId, 'supplier_invoice', 'inventory');
            $entryLines[] = Dec::isPositive($varianceAmount)
                ? ['account_id' => $inventoryAccount, 'debit' => (string) Dec::round($varianceAmount, Dec::SCALE_MONEY), 'description' => 'فرق سعر الفاتورة عن الاستلام']
                : ['account_id' => $inventoryAccount, 'credit' => (string) Dec::abs(Dec::round($varianceAmount, Dec::SCALE_MONEY)), 'description' => 'فرق سعر الفاتورة عن الاستلام'];
        }

        if (! Dec::isZero($directPurchase)) {
            $entryLines[] = [
                'account_id' => $this->matrix->accountId($companyId, 'supplier_invoice', 'inventory'),
                'debit' => (string) Dec::round($directPurchase, Dec::SCALE_MONEY),
                'description' => 'مشتريات بلا استلام مخزني مسبق',
            ];
        }

        if (! Dec::isZero($invoice->tax_amount)) {
            $entryLines[] = [
                'account_id' => $this->matrix->accountId($companyId, 'supplier_invoice', 'tax_input'),
                'debit' => (string) Dec::round($invoice->tax_amount, Dec::SCALE_MONEY),
                'description' => 'ضريبة مدخلات',
            ];
        }

        $entryLines[] = [
            'account_id' => $this->matrix->accountId($companyId, 'supplier_invoice', 'ap'),
            'credit' => (string) Dec::round($invoice->total_amount, Dec::SCALE_MONEY),
            'partner_type' => 'supplier',
            'partner_id' => (int) $invoice->supplier_id,
            'due_date' => $invoice->due_date?->toDateString(),
            'description' => 'التزام تجاه المورد',
        ];

        $entry = $this->ledger->post(
            companyId: $companyId,
            entryDate: $invoice->invoice_date->toDateString(),
            sourceType: 'supplier_invoice',
            sourceId: (int) $invoice->id,
            sourceNo: $invoice->invoice_no,
            description: "فاتورة مورد — {$invoice->invoice_no}",
            lines: $entryLines,
            branchId: $invoice->branch_id,
            userId: $userId,
        );

        $invoice->status = 'posted';
        $invoice->journal_entry_id = $entry->id;
        $invoice->posted_by = $userId;
        $invoice->posted_at = now();
        $invoice->save();

        // وسم الاستلام كمفوتر
        $receiptIds = $invoice->lines()->whereNotNull('goods_receipt_line_id')->pluck('goods_receipt_line_id');
        if ($receiptIds->isNotEmpty()) {
            $grIds = DB::table('goods_receipt_lines')->whereIn('id', $receiptIds)->distinct()->pluck('goods_receipt_id');
            foreach ($grIds as $grId) {
                $fullyInvoiced = ! DB::table('goods_receipt_lines')
                    ->where('goods_receipt_id', $grId)
                    ->whereColumn('invoiced_qty_base', '<', 'qty_base')
                    ->exists();
                DB::table('goods_receipts')->where('id', $grId)->update(['is_invoiced' => $fullyInvoiced, 'updated_at' => now()]);
            }
        }

        $this->audit->log('post', 'supplier_invoice', (int) $invoice->id, $invoice->invoice_no, null, [
            'total_amount' => $invoice->total_amount,
            'journal_entry_id' => $entry->id,
        ], companyId: $companyId);

        return $invoice->fresh('lines');
    }

    private function uomFactor(int $itemId, int $uomId): \Brick\Math\BigDecimal
    {
        $factor = ItemUom::where('item_id', $itemId)->where('uom_id', $uomId)->value('factor');

        if ($factor === null) {
            throw DomainException::make('item.uom_not_defined', 'الوحدة المختارة غير معرّفة لهذا الصنف.');
        }

        return Dec::of($factor);
    }
}
