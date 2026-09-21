<?php

namespace App\Domain\Sales;

use App\Domain\Accounting\LedgerPoster;
use App\Domain\Accounting\PostingMatrix;
use App\Domain\Credit\CreditService;
use App\Domain\Inventory\ReservationService;
use App\Domain\Inventory\StockLedger;
use App\Domain\Inventory\StockPoster;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\Customer;
use App\Models\ItemUom;
use App\Models\SalesInvoice;
use App\Models\SalesInvoiceLine;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * فاتورة البيع.
 *
 * مالك حركة البضاعة:
 *  - البيع المباشر (من المخزن أو من سيارة المندوب): الفاتورة هي المالك (is_stock_owner = true).
 *  - البيع بإذن تسليم: إذن التسليم هو المالك، والفاتورة لا تخصم المخزون مرة ثانية.
 *
 * قيدان منفصلان:
 *  1. الإيراد:  من ح/ العملاء (أو الخزنة) إلى ح/ المبيعات + ح/ ضريبة المخرجات.
 *  2. التكلفة:  من ح/ تكلفة المبيعات إلى ح/ المخزون.
 *
 * كل ذلك داخل معاملة واحدة: إما تنجح كلها أو تتراجع كلها.
 */
class SalesInvoiceService
{
    public function __construct(
        private readonly StockPoster $stock,
        private readonly LedgerPoster $ledger,
        private readonly PostingMatrix $matrix,
        private readonly CreditService $credit,
        private readonly ReservationService $reservations,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function createAndPost(array $data): SalesInvoice
    {
        return DB::transaction(function () use ($data) {
            $invoice = $this->create($data);

            return $this->post($invoice, $data['user_id'] ?? null);
        });
    }

    public function create(array $data): SalesInvoice
    {
        $companyId = (int) $data['company_id'];

        if (empty($data['lines'])) {
            throw DomainException::make('invoice.no_lines', 'لا يمكن إنشاء فاتورة بلا أصناف.');
        }

        $customer = Customer::where('company_id', $companyId)->findOrFail($data['customer_id']);
        $paymentType = $data['payment_type'] ?? 'credit';
        $termDays = (int) ($data['payment_term_days'] ?? $customer->payment_term_days);

        $invoice = SalesInvoice::create([
            'company_id' => $companyId,
            'branch_id' => $data['branch_id'] ?? null,
            'invoice_no' => $data['invoice_no'] ?? $this->numbers->next($companyId, 'sales_invoice', $data['branch_id'] ?? null, $data['invoice_date']),
            'field_no' => $data['field_no'] ?? null,
            'invoice_date' => $data['invoice_date'],
            'due_date' => $data['due_date'] ?? now()->parse($data['invoice_date'])->addDays($termDays)->toDateString(),
            'customer_id' => $customer->id,
            'salesman_id' => $data['salesman_id'] ?? $customer->salesman_id,
            'warehouse_id' => $data['warehouse_id'],
            'sales_order_id' => $data['sales_order_id'] ?? null,
            'delivery_note_id' => $data['delivery_note_id'] ?? null,
            'cost_center_id' => $data['cost_center_id'] ?? null,
            'price_list_id' => $data['price_list_id'] ?? $customer->price_list_id,
            'channel' => $data['channel'] ?? 'presale',
            'payment_type' => $paymentType,
            'status' => 'draft',
            // إذا كانت مرتبطة بإذن تسليم فالإذن هو مالك حركة المخزون
            'is_stock_owner' => $data['is_stock_owner'] ?? empty($data['delivery_note_id']),
            'delivery_fee' => (string) Dec::round($data['delivery_fee'] ?? 0, Dec::SCALE_MONEY),
            'notes' => $data['notes'] ?? null,
            'created_by' => $data['user_id'] ?? null,
        ]);

        $subtotal = Dec::of(0);
        $lineDiscount = Dec::of(0);
        $taxTotal = Dec::of(0);
        $lineNo = 1;

        foreach ($data['lines'] as $line) {
            $factor = $this->uomFactor((int) $line['item_id'], (int) $line['uom_id']);
            $qtyUom = Dec::round($line['qty_uom'], Dec::SCALE_QTY);
            $qtyBase = Dec::round(Dec::mul($qtyUom, $factor), Dec::SCALE_QTY);

            if (! $qtyBase->isPositive()) {
                throw DomainException::make('invoice.invalid_qty', 'كمية السطر يجب أن تكون موجبة.');
            }

            $isFree = (bool) ($line['is_free'] ?? false);
            $unitPrice = $isFree ? Dec::of(0) : Dec::round($line['unit_price'], Dec::SCALE_MONEY);
            $gross = Dec::round(Dec::mul($qtyUom, $unitPrice), Dec::SCALE_MONEY);

            $discountPct = Dec::of($line['discount_pct'] ?? 0);
            $discountAmount = isset($line['discount_amount'])
                ? Dec::round($line['discount_amount'], Dec::SCALE_MONEY)
                : Dec::round(Dec::div(Dec::mul($gross, $discountPct), 100), Dec::SCALE_MONEY);

            $net = Dec::sub($gross, $discountAmount);
            $taxRate = Dec::of($line['tax_rate'] ?? 0);
            $tax = Dec::round(Dec::div(Dec::mul($net, $taxRate), 100), Dec::SCALE_MONEY);

            SalesInvoiceLine::create([
                'sales_invoice_id' => $invoice->id,
                'line_no' => $lineNo++,
                'sales_order_line_id' => $line['sales_order_line_id'] ?? null,
                'delivery_note_line_id' => $line['delivery_note_line_id'] ?? null,
                'item_id' => $line['item_id'],
                'uom_id' => $line['uom_id'],
                'uom_factor' => (string) $factor,
                'batch_id' => $line['batch_id'] ?? null,
                'qty_uom' => (string) $qtyUom,
                'qty_base' => (string) $qtyBase,
                'unit_price' => (string) $unitPrice,
                'discount_pct' => (string) $discountPct,
                'discount_amount' => (string) $discountAmount,
                'tax_code_id' => $line['tax_code_id'] ?? null,
                'tax_rate' => (string) $taxRate,
                'tax_amount' => (string) $tax,
                'line_total' => (string) $net,
                'is_free' => $isFree,
                'promotion_id' => $line['promotion_id'] ?? null,
            ]);

            $subtotal = Dec::add($subtotal, $gross);
            $lineDiscount = Dec::add($lineDiscount, $discountAmount);
            $taxTotal = Dec::add($taxTotal, $tax);
        }

        $headerDiscount = Dec::round($data['header_discount_amount'] ?? 0, Dec::SCALE_MONEY);
        $total = Dec::add(
            Dec::sub(Dec::sub($subtotal, $lineDiscount), $headerDiscount),
            Dec::add($taxTotal, $invoice->delivery_fee),
        );

        $invoice->update([
            'subtotal' => (string) Dec::round($subtotal, Dec::SCALE_MONEY),
            'line_discount_amount' => (string) Dec::round($lineDiscount, Dec::SCALE_MONEY),
            'header_discount_amount' => (string) $headerDiscount,
            'tax_amount' => (string) Dec::round($taxTotal, Dec::SCALE_MONEY),
            'total_amount' => (string) Dec::round($total, Dec::SCALE_MONEY),
        ]);

        return $invoice->fresh('lines');
    }

    public function post(SalesInvoice $invoice, ?int $userId = null): SalesInvoice
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->post($invoice, $userId));
        }

        $invoice = SalesInvoice::lockForUpdate()->findOrFail($invoice->id);
        $invoice->load('lines');

        if ($invoice->status !== 'draft') {
            throw DomainException::make('invoice.not_draft', "الفاتورة {$invoice->invoice_no} ليست في حالة مسودة (الحالة: {$invoice->status}).");
        }

        $companyId = (int) $invoice->company_id;
        $isCredit = $invoice->payment_type !== 'cash';

        // مراقبة الائتمان قبل الاعتماد
        $this->credit->assertCanSell(
            companyId: $companyId,
            customerId: (int) $invoice->customer_id,
            additionalAmount: $invoice->total_amount,
            isCredit: $isCredit,
            hasOverride: (bool) ($invoice->salesOrder?->credit_override ?? false),
            overrideReason: $invoice->salesOrder?->credit_override_reason,
        );

        $totalCost = Dec::of(0);

        foreach ($invoice->lines as $line) {
            if ($invoice->is_stock_owner) {
                $result = $this->stock->issueAllocated([
                    'company_id' => $companyId,
                    'item_id' => (int) $line->item_id,
                    'warehouse_id' => (int) $invoice->warehouse_id,
                    'batch_id' => $line->batch_id,
                    'status_bucket' => StockLedger::BUCKET_AVAILABLE,
                    'doc_type' => 'sales_invoice',
                    'doc_id' => (int) $invoice->id,
                    'doc_line_id' => (int) $line->id,
                    'doc_no' => $invoice->invoice_no,
                    'qty_base' => $line->qty_base,
                    'uom_id' => (int) $line->uom_id,
                    'uom_factor' => $line->uom_factor,
                    'qty_in_uom' => $line->qty_uom,
                    'movement_date' => $invoice->invoice_date->toDateString(),
                    'created_by' => $userId,
                ]);
            } else {
                // البضاعة خرجت بإذن التسليم — التكلفة مأخوذة من سطر الإذن
                $deliveryCost = $line->deliveryLine?->unit_cost ?? '0';
                $result = [
                    'unit_cost' => (string) Dec::round($deliveryCost, Dec::SCALE_COST),
                    'total_cost' => (string) Dec::round(Dec::mul($line->qty_base, $deliveryCost), Dec::SCALE_MONEY),
                ];
            }

            $line->unit_cost = $result['unit_cost'];
            $line->total_cost = $result['total_cost'];

            // حفظ الدفعة المصروفة عند تغطية السطر من دفعة واحدة، لربط المرتجع بها
            if (empty($line->batch_id) && isset($result['allocation']) && count($result['allocation']) === 1) {
                $line->batch_id = $result['allocation'][0]['batch_id'];
            }

            $line->save();

            $totalCost = Dec::add($totalCost, $result['total_cost']);

            if ($line->sales_order_line_id) {
                DB::table('sales_order_lines')
                    ->where('id', $line->sales_order_line_id)
                    ->update(['invoiced_qty_base' => DB::raw('invoiced_qty_base + '.$line->qty_base)]);
            }
        }

        // 1) قيد الإيراد
        $netRevenue = Dec::sub(
            Dec::sub($invoice->subtotal, $invoice->line_discount_amount),
            $invoice->header_discount_amount,
        );

        $revenueLines = [];
        $debitAccount = $isCredit
            ? $this->matrix->accountId($companyId, 'sales_invoice', 'ar')
            : $this->matrix->accountId($companyId, 'sales_invoice', 'cash');

        $revenueLines[] = [
            'account_id' => $debitAccount,
            'debit' => (string) Dec::round($invoice->total_amount, Dec::SCALE_MONEY),
            'partner_type' => $isCredit ? 'customer' : null,
            'partner_id' => $isCredit ? (int) $invoice->customer_id : null,
            'cost_center_id' => $invoice->cost_center_id,
            'due_date' => $invoice->due_date?->toDateString(),
            'description' => 'قيمة الفاتورة',
        ];

        $revenueLines[] = [
            'account_id' => $this->matrix->accountId($companyId, 'sales_invoice', 'revenue'),
            'credit' => (string) Dec::round($netRevenue, Dec::SCALE_MONEY),
            'cost_center_id' => $invoice->cost_center_id,
            'description' => 'صافي المبيعات',
        ];

        if (! Dec::isZero($invoice->tax_amount)) {
            $revenueLines[] = [
                'account_id' => $this->matrix->accountId($companyId, 'sales_invoice', 'tax_output'),
                'credit' => (string) Dec::round($invoice->tax_amount, Dec::SCALE_MONEY),
                'description' => 'ضريبة مخرجات',
            ];
        }

        if (! Dec::isZero($invoice->delivery_fee)) {
            $revenueLines[] = [
                'account_id' => $this->matrix->accountId($companyId, 'sales_invoice', 'delivery_income'),
                'credit' => (string) Dec::round($invoice->delivery_fee, Dec::SCALE_MONEY),
                'description' => 'مصاريف توصيل',
            ];
        }

        $revenueEntry = $this->ledger->post(
            companyId: $companyId,
            entryDate: $invoice->invoice_date->toDateString(),
            sourceType: 'sales_invoice',
            sourceId: (int) $invoice->id,
            sourceNo: $invoice->invoice_no,
            description: "فاتورة بيع — {$invoice->invoice_no}",
            lines: $revenueLines,
            branchId: $invoice->branch_id,
            userId: $userId,
        );

        // 2) قيد تكلفة المبيعات (فقط إذا كانت الفاتورة هي مالكة حركة المخزون)
        $cogsEntry = null;
        if ($invoice->is_stock_owner && ! Dec::isZero($totalCost)) {
            $cogsEntry = $this->ledger->post(
                companyId: $companyId,
                entryDate: $invoice->invoice_date->toDateString(),
                sourceType: 'sales_invoice_cogs',
                sourceId: (int) $invoice->id,
                sourceNo: $invoice->invoice_no,
                description: "تكلفة مبيعات الفاتورة — {$invoice->invoice_no}",
                lines: [
                    [
                        'account_id' => $this->matrix->accountId($companyId, 'sales_invoice_cogs', 'cogs'),
                        'debit' => (string) Dec::round($totalCost, Dec::SCALE_MONEY),
                        'cost_center_id' => $invoice->cost_center_id,
                        'description' => 'تكلفة البضاعة المباعة',
                    ],
                    [
                        'account_id' => $this->matrix->accountId($companyId, 'sales_invoice_cogs', 'inventory'),
                        'credit' => (string) Dec::round($totalCost, Dec::SCALE_MONEY),
                        'description' => 'إخراج من المخزون',
                    ],
                ],
                branchId: $invoice->branch_id,
                userId: $userId,
            );
        }

        // استهلاك الحجوزات المرتبطة بالطلب
        if ($invoice->sales_order_id) {
            $this->reservations->consume('sales_order', (int) $invoice->sales_order_id);
        }

        $invoice->status = 'posted';
        $invoice->total_cost = (string) Dec::round($totalCost, Dec::SCALE_MONEY);
        $invoice->journal_entry_id = $revenueEntry->id;
        $invoice->cogs_journal_entry_id = $cogsEntry?->id;
        $invoice->posted_by = $userId;
        $invoice->posted_at = now();
        $invoice->snapshot = $this->snapshot($invoice);
        $invoice->save();

        Customer::where('id', $invoice->customer_id)->update([
            'last_sale_date' => $invoice->invoice_date->toDateString(),
        ]);

        $this->refreshOrderStatuses($invoice);

        $this->audit->log('post', 'sales_invoice', (int) $invoice->id, $invoice->invoice_no, null, [
            'total_amount' => $invoice->total_amount,
            'total_cost' => $invoice->total_cost,
            'journal_entry_id' => $revenueEntry->id,
        ], companyId: $companyId);

        return $invoice->fresh('lines');
    }

    /**
     * إلغاء فاتورة مرحّلة — لا تُحذف أبدًا.
     * يُعكس القيد المالي وترتد البضاعة بنفس تكلفتها الأصلية.
     */
    public function cancel(SalesInvoice $invoice, string $reason, ?int $userId = null): SalesInvoice
    {
        return DB::transaction(function () use ($invoice, $reason, $userId) {
            $invoice = SalesInvoice::lockForUpdate()->findOrFail($invoice->id);
            $invoice->load('lines');

            if ($invoice->status === 'cancelled') {
                throw DomainException::make('invoice.already_cancelled', 'الفاتورة ملغاة بالفعل.');
            }

            if (Dec::gt($invoice->paid_amount, 0)) {
                throw DomainException::make(
                    'invoice.has_payments',
                    'لا يمكن إلغاء فاتورة عليها تحصيلات. استخدم إشعار دائن أو مرتجعًا.',
                );
            }

            if (Dec::gt($invoice->returned_amount, 0)) {
                throw DomainException::make('invoice.has_returns', 'لا يمكن إلغاء فاتورة عليها مرتجعات.');
            }

            $today = now()->toDateString();

            if ($invoice->is_stock_owner) {
                foreach ($invoice->lines as $line) {
                    $this->stock->returnIn([
                        'company_id' => (int) $invoice->company_id,
                        'item_id' => (int) $line->item_id,
                        'warehouse_id' => (int) $invoice->warehouse_id,
                        'batch_id' => $line->batch_id,
                        'status_bucket' => StockLedger::BUCKET_AVAILABLE,
                        'doc_type' => 'sales_invoice_cancel',
                        'doc_id' => (int) $invoice->id,
                        'doc_line_id' => (int) $line->id,
                        'doc_no' => $invoice->invoice_no,
                        'qty_base' => $line->qty_base,
                        'uom_id' => (int) $line->uom_id,
                        'uom_factor' => $line->uom_factor,
                        'qty_in_uom' => $line->qty_uom,
                        'movement_date' => $today,
                        'created_by' => $userId,
                    ], $line->unit_cost);
                }
            }

            if ($invoice->journalEntry) {
                $this->ledger->reverse($invoice->journalEntry, $today, "إلغاء الفاتورة: {$reason}", $userId);
            }
            if ($invoice->cogsJournalEntry) {
                $this->ledger->reverse($invoice->cogsJournalEntry, $today, "إلغاء تكلفة الفاتورة: {$reason}", $userId);
            }

            $invoice->status = 'cancelled';
            $invoice->cancelled_by = $userId;
            $invoice->cancelled_at = now();
            $invoice->cancel_reason = $reason;
            $invoice->save();

            $this->audit->log('cancel', 'sales_invoice', (int) $invoice->id, $invoice->invoice_no, null, null, $reason, (int) $invoice->company_id);

            return $invoice;
        });
    }

    /** نسخة ثابتة من بيانات المستند وشروطه وقت الاعتماد. */
    private function snapshot(SalesInvoice $invoice): array
    {
        $customer = $invoice->customer;

        return [
            'captured_at' => now()->toIso8601String(),
            'customer' => [
                'id' => $customer?->id,
                'code' => $customer?->code,
                'name' => $customer?->name,
                'tax_number' => $customer?->tax_number,
                'address' => $customer?->address,
                'payment_term_days' => $customer?->payment_term_days,
                'price_list_id' => $customer?->price_list_id,
            ],
            'totals' => [
                'subtotal' => $invoice->subtotal,
                'line_discount_amount' => $invoice->line_discount_amount,
                'header_discount_amount' => $invoice->header_discount_amount,
                'tax_amount' => $invoice->tax_amount,
                'delivery_fee' => $invoice->delivery_fee,
                'total_amount' => $invoice->total_amount,
                'total_cost' => $invoice->total_cost,
            ],
            'lines' => $invoice->lines->map(fn (SalesInvoiceLine $l) => [
                'item_id' => $l->item_id,
                'uom_id' => $l->uom_id,
                'uom_factor' => $l->uom_factor,
                'qty_uom' => $l->qty_uom,
                'qty_base' => $l->qty_base,
                'unit_price' => $l->unit_price,
                'discount_amount' => $l->discount_amount,
                'tax_rate' => $l->tax_rate,
                'tax_amount' => $l->tax_amount,
                'line_total' => $l->line_total,
                'unit_cost' => $l->unit_cost,
                'is_free' => $l->is_free,
            ])->all(),
        ];
    }

    private function refreshOrderStatuses(SalesInvoice $invoice): void
    {
        if (! $invoice->sales_order_id) {
            return;
        }

        $lines = DB::table('sales_order_lines')->where('sales_order_id', $invoice->sales_order_id)->get();
        $allInvoiced = true;
        $anyInvoiced = false;

        foreach ($lines as $line) {
            if (Dec::gt($line->invoiced_qty_base, 0)) {
                $anyInvoiced = true;
            }
            if (Dec::lt($line->invoiced_qty_base, $line->qty_base)) {
                $allInvoiced = false;
            }
        }

        DB::table('sales_orders')->where('id', $invoice->sales_order_id)->update([
            'invoice_status' => $allInvoiced ? 'invoiced' : ($anyInvoiced ? 'partial' : 'pending'),
            'updated_at' => now(),
        ]);
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
