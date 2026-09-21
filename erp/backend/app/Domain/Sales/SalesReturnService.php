<?php

namespace App\Domain\Sales;

use App\Domain\Accounting\LedgerPoster;
use App\Domain\Accounting\PostingMatrix;
use App\Domain\Inventory\StockLedger;
use App\Domain\Inventory\StockPoster;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\ItemUom;
use App\Models\SalesInvoice;
use App\Models\SalesInvoiceLine;
use App\Models\SalesReturn;
use App\Models\SalesReturnLine;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * مرتجع العميل.
 *
 * - مرتبط بالفاتورة الأصلية والبند والكمية والسعر والخصم والضريبة.
 * - يُمنع تجاوز الكمية المباعة بعد خصم المرتجعات السابقة (فحص في الخدمة + قيد CHECK في القاعدة).
 * - الاستلام الفعلي منفصل عن الاعتماد المالي: receive() ثم post().
 * - لا تعود كل المرتجعات تلقائيًا للمخزون المتاح؛ الحالة تحدد المخزن/الدلو الهدف.
 * - يعود بتكلفة البيع الأصلية المحفوظة في سطر الفاتورة.
 */
class SalesReturnService
{
    public function __construct(
        private readonly StockPoster $stock,
        private readonly LedgerPoster $ledger,
        private readonly PostingMatrix $matrix,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function createReceiveAndPost(array $data): SalesReturn
    {
        return DB::transaction(function () use ($data) {
            $return = $this->create($data);
            $return = $this->receive($return, $data['user_id'] ?? null);

            return $this->post($return, $data['user_id'] ?? null);
        });
    }

    public function create(array $data): SalesReturn
    {
        $companyId = (int) $data['company_id'];

        if (empty($data['lines'])) {
            throw DomainException::make('return.no_lines', 'لا يمكن إنشاء مرتجع بلا أصناف.');
        }

        $withoutInvoice = empty($data['sales_invoice_id']);

        if ($withoutInvoice && empty($data['exception_approved_by'])) {
            throw DomainException::make(
                'return.without_invoice_needs_approval',
                'المرتجع بلا فاتورة استثناء يحتاج اعتمادًا مسجلًا من مخوّل مع بيان السبب.',
            );
        }

        $invoice = $withoutInvoice ? null : SalesInvoice::where('company_id', $companyId)->findOrFail($data['sales_invoice_id']);

        if ($invoice && $invoice->status === 'cancelled') {
            throw DomainException::make('return.invoice_cancelled', 'لا يمكن عمل مرتجع على فاتورة ملغاة.');
        }

        $return = SalesReturn::create([
            'company_id' => $companyId,
            'branch_id' => $data['branch_id'] ?? $invoice?->branch_id,
            'return_no' => $data['return_no'] ?? $this->numbers->next($companyId, 'sales_return', $data['branch_id'] ?? null, $data['return_date']),
            'field_no' => $data['field_no'] ?? null,
            'return_date' => $data['return_date'],
            'customer_id' => $data['customer_id'] ?? $invoice?->customer_id,
            'sales_invoice_id' => $invoice?->id,
            'salesman_id' => $data['salesman_id'] ?? $invoice?->salesman_id,
            'warehouse_id' => $data['warehouse_id'],
            'without_invoice' => $withoutInvoice,
            'exception_approved_by' => $data['exception_approved_by'] ?? null,
            'exception_reason' => $data['exception_reason'] ?? null,
            'settlement_type' => $data['settlement_type'] ?? 'credit_note',
            'refund_approved_by' => $data['refund_approved_by'] ?? null,
            'status' => 'draft',
            'reason' => $data['reason'] ?? null,
            'created_by' => $data['user_id'] ?? null,
        ]);

        if (($return->settlement_type === 'cash_refund') && empty($return->refund_approved_by)) {
            throw DomainException::make(
                'return.refund_needs_approval',
                'الاسترداد النقدي يحتاج موافقة منفصلة مسجلة.',
            );
        }

        $subtotal = Dec::of(0);
        $discountTotal = Dec::of(0);
        $taxTotal = Dec::of(0);
        $lineNo = 1;

        foreach ($data['lines'] as $line) {
            $invoiceLine = null;

            if (! empty($line['sales_invoice_line_id'])) {
                $invoiceLine = SalesInvoiceLine::lockForUpdate()->findOrFail($line['sales_invoice_line_id']);

                if ((int) $invoiceLine->sales_invoice_id !== (int) $invoice?->id) {
                    throw DomainException::make('return.line_mismatch', 'سطر المرتجع لا يتبع الفاتورة المحددة.');
                }
            }

            $factor = $invoiceLine
                ? Dec::of($invoiceLine->uom_factor)   // معامل التحويل كما كان وقت البيع
                : $this->uomFactor((int) $line['item_id'], (int) $line['uom_id']);

            $qtyUom = Dec::round($line['qty_uom'], Dec::SCALE_QTY);
            $qtyBase = Dec::round(Dec::mul($qtyUom, $factor), Dec::SCALE_QTY);

            if (! $qtyBase->isPositive()) {
                throw DomainException::make('return.invalid_qty', 'كمية المرتجع يجب أن تكون موجبة.');
            }

            if ($invoiceLine) {
                $remaining = Dec::sub($invoiceLine->qty_base, $invoiceLine->returned_qty_base);

                if (Dec::gt($qtyBase, $remaining)) {
                    throw DomainException::make(
                        'return.exceeds_sold',
                        sprintf(
                            'كمية المرتجع (%s) تتجاوز المتبقي القابل للإرجاع (%s) بعد خصم المرتجعات السابقة (%s من %s).',
                            Dec::qty($qtyBase),
                            Dec::qty($remaining),
                            Dec::qty($invoiceLine->returned_qty_base),
                            Dec::qty($invoiceLine->qty_base),
                        ),
                        [
                            'sales_invoice_line_id' => $invoiceLine->id,
                            'sold' => (string) $invoiceLine->qty_base,
                            'already_returned' => (string) $invoiceLine->returned_qty_base,
                            'remaining' => (string) $remaining,
                        ],
                    );
                }
            }

            // السعر والخصم والضريبة كما كانت في الفاتورة الأصلية
            $unitPrice = $invoiceLine ? Dec::of($invoiceLine->unit_price) : Dec::round($line['unit_price'] ?? 0, Dec::SCALE_MONEY);
            $gross = Dec::round(Dec::mul($qtyUom, $unitPrice), Dec::SCALE_MONEY);

            $discountAmount = Dec::of(0);
            if ($invoiceLine && Dec::isPositive($invoiceLine->qty_uom)) {
                $discountAmount = Dec::round(
                    Dec::mul(Dec::div($invoiceLine->discount_amount, $invoiceLine->qty_uom), $qtyUom),
                    Dec::SCALE_MONEY,
                );
            }

            $net = Dec::sub($gross, $discountAmount);
            $taxRate = $invoiceLine ? Dec::of($invoiceLine->tax_rate) : Dec::of($line['tax_rate'] ?? 0);
            $tax = Dec::round(Dec::div(Dec::mul($net, $taxRate), 100), Dec::SCALE_MONEY);

            // التكلفة الأصلية للبيع — لا يُعاد حسابها بآخر سعر شراء
            $unitCost = $invoiceLine
                ? Dec::of($invoiceLine->unit_cost)
                : Dec::round($line['unit_cost'] ?? 0, Dec::SCALE_COST);

            $condition = $line['condition'] ?? 'saleable';

            SalesReturnLine::create([
                'sales_return_id' => $return->id,
                'line_no' => $lineNo++,
                'sales_invoice_line_id' => $invoiceLine?->id,
                'item_id' => $invoiceLine?->item_id ?? $line['item_id'],
                'uom_id' => $invoiceLine?->uom_id ?? $line['uom_id'],
                'uom_factor' => (string) $factor,
                'batch_id' => $line['batch_id'] ?? $invoiceLine?->batch_id,
                'qty_uom' => (string) $qtyUom,
                'qty_base' => (string) $qtyBase,
                'unit_price' => (string) $unitPrice,
                'discount_amount' => (string) $discountAmount,
                'tax_rate' => (string) $taxRate,
                'tax_amount' => (string) $tax,
                'line_total' => (string) $net,
                'unit_cost' => (string) $unitCost,
                'total_cost' => (string) Dec::round(Dec::mul($qtyBase, $unitCost), Dec::SCALE_MONEY),
                'condition' => $condition,
                'target_status_bucket' => $this->bucketForCondition($condition),
            ]);

            $subtotal = Dec::add($subtotal, $gross);
            $discountTotal = Dec::add($discountTotal, $discountAmount);
            $taxTotal = Dec::add($taxTotal, $tax);
        }

        $return->update([
            'subtotal' => (string) Dec::round($subtotal, Dec::SCALE_MONEY),
            'discount_amount' => (string) Dec::round($discountTotal, Dec::SCALE_MONEY),
            'tax_amount' => (string) Dec::round($taxTotal, Dec::SCALE_MONEY),
            'total_amount' => (string) Dec::round(Dec::add(Dec::sub($subtotal, $discountTotal), $taxTotal), Dec::SCALE_MONEY),
        ]);

        return $return->fresh('lines');
    }

    /** الاستلام الفعلي للبضاعة — منفصل عن الاعتماد المالي. */
    public function receive(SalesReturn $return, ?int $userId = null): SalesReturn
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->receive($return, $userId));
        }

        $return = SalesReturn::lockForUpdate()->findOrFail($return->id);
        $return->load('lines');

        if ($return->status !== 'draft') {
            throw DomainException::make('return.not_draft', "المرتجع {$return->return_no} ليس في حالة مسودة.");
        }

        $totalCost = Dec::of(0);

        foreach ($return->lines as $line) {
            $this->stock->returnIn([
                'company_id' => (int) $return->company_id,
                'item_id' => (int) $line->item_id,
                'warehouse_id' => (int) $return->warehouse_id,
                'batch_id' => $line->batch_id,
                // الحالة تحدد أين تدخل البضاعة: صالح للبيع / تحت الفحص / تالف
                'status_bucket' => $line->target_status_bucket,
                'doc_type' => 'sales_return',
                'doc_id' => (int) $return->id,
                'doc_line_id' => (int) $line->id,
                'doc_no' => $return->return_no,
                'qty_base' => $line->qty_base,
                'uom_id' => (int) $line->uom_id,
                'uom_factor' => $line->uom_factor,
                'qty_in_uom' => $line->qty_uom,
                'movement_date' => $return->return_date->toDateString(),
                'created_by' => $userId,
            ], $line->unit_cost);

            $totalCost = Dec::add($totalCost, $line->total_cost);
        }

        $return->status = 'received';
        $return->received_at = now();
        $return->received_by = $userId;
        $return->total_cost = (string) Dec::round($totalCost, Dec::SCALE_MONEY);
        $return->save();

        $this->audit->log('receive', 'sales_return', (int) $return->id, $return->return_no, companyId: (int) $return->company_id);

        return $return->fresh('lines');
    }

    /** الاعتماد المالي: يحدّث مديونية العميل والفاتورة والضريبة والتكلفة. */
    public function post(SalesReturn $return, ?int $userId = null): SalesReturn
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->post($return, $userId));
        }

        $return = SalesReturn::lockForUpdate()->findOrFail($return->id);
        $return->load('lines');

        if ($return->status !== 'received') {
            throw DomainException::make(
                'return.not_received',
                "المرتجع {$return->return_no} لم يُستلم فعليًا بعد (الحالة: {$return->status}). الاستلام يسبق الاعتماد المالي.",
            );
        }

        $companyId = (int) $return->company_id;
        $invoice = $return->salesInvoice;
        $isCashRefund = $return->settlement_type === 'cash_refund';

        $netReturn = Dec::sub($return->subtotal, $return->discount_amount);

        $lines = [
            [
                'account_id' => $this->matrix->accountId($companyId, 'sales_return', 'sales_returns'),
                'debit' => (string) Dec::round($netReturn, Dec::SCALE_MONEY),
                'description' => 'مردودات مبيعات',
            ],
        ];

        if (! Dec::isZero($return->tax_amount)) {
            $lines[] = [
                'account_id' => $this->matrix->accountId($companyId, 'sales_return', 'tax_output'),
                'debit' => (string) Dec::round($return->tax_amount, Dec::SCALE_MONEY),
                'description' => 'عكس ضريبة المخرجات',
            ];
        }

        $lines[] = $isCashRefund
            ? [
                'account_id' => $this->matrix->accountId($companyId, 'sales_return', 'cash'),
                'credit' => (string) Dec::round($return->total_amount, Dec::SCALE_MONEY),
                'description' => 'استرداد نقدي',
            ]
            : [
                'account_id' => $this->matrix->accountId($companyId, 'sales_return', 'ar'),
                'credit' => (string) Dec::round($return->total_amount, Dec::SCALE_MONEY),
                'partner_type' => 'customer',
                'partner_id' => (int) $return->customer_id,
                'description' => 'تخفيض مديونية العميل',
            ];

        $entry = $this->ledger->post(
            companyId: $companyId,
            entryDate: $return->return_date->toDateString(),
            sourceType: 'sales_return',
            sourceId: (int) $return->id,
            sourceNo: $return->return_no,
            description: "مرتجع مبيعات — {$return->return_no}",
            lines: $lines,
            branchId: $return->branch_id,
            userId: $userId,
        );

        // عكس تكلفة المبيعات بالتكلفة الأصلية
        $cogsEntry = null;
        if (! Dec::isZero($return->total_cost)) {
            $cogsEntry = $this->ledger->post(
                companyId: $companyId,
                entryDate: $return->return_date->toDateString(),
                sourceType: 'sales_return_cogs',
                sourceId: (int) $return->id,
                sourceNo: $return->return_no,
                description: "عكس تكلفة مرتجع — {$return->return_no}",
                lines: [
                    [
                        'account_id' => $this->matrix->accountId($companyId, 'sales_return_cogs', 'inventory'),
                        'debit' => (string) Dec::round($return->total_cost, Dec::SCALE_MONEY),
                        'description' => 'إعادة البضاعة للمخزون',
                    ],
                    [
                        'account_id' => $this->matrix->accountId($companyId, 'sales_return_cogs', 'cogs'),
                        'credit' => (string) Dec::round($return->total_cost, Dec::SCALE_MONEY),
                        'description' => 'تخفيض تكلفة المبيعات',
                    ],
                ],
                branchId: $return->branch_id,
                userId: $userId,
            );
        }

        // تحديث سطور الفاتورة الأصلية ورصيدها — دون تكرار الأثر
        foreach ($return->lines as $line) {
            if ($line->sales_invoice_line_id) {
                DB::table('sales_invoice_lines')
                    ->where('id', $line->sales_invoice_line_id)
                    ->update(['returned_qty_base' => DB::raw('returned_qty_base + '.$line->qty_base)]);
            }
        }

        if ($invoice) {
            $invoice = SalesInvoice::lockForUpdate()->findOrFail($invoice->id);
            $invoice->returned_amount = (string) Dec::round(Dec::add($invoice->returned_amount, $return->total_amount), Dec::SCALE_MONEY);
            $invoice->save();
        }

        $return->status = 'posted';
        $return->journal_entry_id = $entry->id;
        $return->cogs_journal_entry_id = $cogsEntry?->id;
        $return->posted_by = $userId;
        $return->posted_at = now();
        $return->save();

        $this->audit->log('post', 'sales_return', (int) $return->id, $return->return_no, null, [
            'total_amount' => $return->total_amount,
            'total_cost' => $return->total_cost,
        ], companyId: $companyId);

        return $return->fresh('lines');
    }

    private function bucketForCondition(string $condition): string
    {
        return match ($condition) {
            'saleable' => StockLedger::BUCKET_AVAILABLE,
            'inspection' => StockLedger::BUCKET_INSPECTION,
            'damaged' => StockLedger::BUCKET_DAMAGED,
            'to_supplier' => StockLedger::BUCKET_QUARANTINE,
            default => StockLedger::BUCKET_INSPECTION,
        };
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
