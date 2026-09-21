<?php

namespace App\Domain\Sales;

use App\Domain\Accounting\LedgerPoster;
use App\Domain\Accounting\PostingMatrix;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\CashBox;
use App\Models\Cheque;
use App\Models\CustomerReceipt;
use App\Models\CustomerReceiptAllocation;
use App\Models\Salesman;
use App\Models\SalesInvoice;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * تحصيل العميل.
 *
 * قاعدة أساسية: المبالغ التي يستلمها المندوب ليست مودعة بخزنة الشركة.
 * تُقيَّد أولًا على عهدته النقدية (خزنة من نوع custody)، ثم تنتقل للخزنة أو البنك
 * بإيداع معتمد منفصل — والإيداع لا ينشئ إيرادًا جديدًا.
 *
 * القيد: من ح/ عهدة المحصل (أو الخزنة/البنك مباشرة) إلى ح/ العملاء.
 *
 * الشيك غير المحصل ليس نقدية مؤكدة: يُقيَّد على ح/ أوراق قبض وله دورة منفصلة.
 */
class CustomerReceiptService
{
    public function __construct(
        private readonly LedgerPoster $ledger,
        private readonly PostingMatrix $matrix,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function createAndPost(array $data): CustomerReceipt
    {
        return DB::transaction(function () use ($data) {
            $receipt = $this->create($data);

            return $this->post($receipt, $data['user_id'] ?? null);
        });
    }

    public function create(array $data): CustomerReceipt
    {
        $companyId = (int) $data['company_id'];
        $amount = Dec::round($data['amount'], Dec::SCALE_MONEY);

        if (! $amount->isPositive()) {
            throw DomainException::make('receipt.invalid_amount', 'مبلغ التحصيل يجب أن يكون موجبًا.');
        }

        $method = $data['payment_method'] ?? 'cash';
        $salesmanId = $data['salesman_id'] ?? null;
        $cashBoxId = $data['cash_box_id'] ?? null;

        // التحصيل النقدي عبر مندوب يذهب إلى عهدته النقدية، لا إلى خزنة الشركة
        if ($method === 'cash' && $salesmanId !== null && $cashBoxId === null) {
            $cashBoxId = $this->custodyCashBoxId($companyId, (int) $salesmanId);
        }

        $chequeId = $data['cheque_id'] ?? null;
        if ($method === 'cheque' && $chequeId === null && ! empty($data['cheque'])) {
            $chequeId = Cheque::create([
                'company_id' => $companyId,
                'direction' => 'in',
                'cheque_no' => $data['cheque']['cheque_no'],
                'bank_name' => $data['cheque']['bank_name'] ?? null,
                'amount' => (string) $amount,
                'issue_date' => $data['cheque']['issue_date'] ?? $data['receipt_date'],
                'due_date' => $data['cheque']['due_date'],
                'partner_type' => 'customer',
                'partner_id' => $data['customer_id'],
                'status' => 'received',
                'source_type' => 'customer_receipt',
            ])->id;
        }

        $receipt = CustomerReceipt::create([
            'company_id' => $companyId,
            'branch_id' => $data['branch_id'] ?? null,
            'voucher_no' => $data['voucher_no'] ?? $this->numbers->next($companyId, 'customer_receipt', $data['branch_id'] ?? null, $data['receipt_date']),
            'field_no' => $data['field_no'] ?? null,
            'receipt_date' => $data['receipt_date'],
            'customer_id' => $data['customer_id'],
            'salesman_id' => $salesmanId,
            'payment_method' => $method,
            'cash_box_id' => $cashBoxId,
            'bank_account_id' => $data['bank_account_id'] ?? null,
            'cheque_id' => $chequeId,
            'amount' => (string) $amount,
            'status' => $data['status'] ?? 'draft',
            'notes' => $data['notes'] ?? null,
            'created_by' => $data['user_id'] ?? null,
        ]);

        if (! empty($data['allocations'])) {
            $this->allocate($receipt, $data['allocations']);
        }

        return $receipt->fresh('allocations');
    }

    /**
     * توزيع مبلغ واحد على عدة فواتير، ويمكن سداد الفاتورة بأكثر من دفعة.
     *
     * @param  array<int, array{sales_invoice_id:int, amount:mixed}>  $allocations
     */
    public function allocate(CustomerReceipt $receipt, array $allocations): CustomerReceipt
    {
        $allocated = Dec::of($receipt->allocated_amount);

        foreach ($allocations as $allocation) {
            $invoice = SalesInvoice::lockForUpdate()->findOrFail($allocation['sales_invoice_id']);

            if ((int) $invoice->company_id !== (int) $receipt->company_id) {
                throw DomainException::make('receipt.cross_company', 'لا يُسمح بتوزيع تحصيل على فاتورة شركة أخرى.');
            }

            if ((int) $invoice->customer_id !== (int) $receipt->customer_id) {
                throw DomainException::make('receipt.customer_mismatch', 'الفاتورة لا تخص نفس العميل.');
            }

            $amount = Dec::round($allocation['amount'], Dec::SCALE_MONEY);
            $outstanding = Dec::sub(Dec::sub($invoice->total_amount, $invoice->paid_amount), $invoice->returned_amount);

            if (Dec::gt($amount, $outstanding)) {
                throw DomainException::make(
                    'receipt.over_allocation',
                    "المبلغ الموزَّع ({$amount}) يتجاوز المتبقي على الفاتورة {$invoice->invoice_no} ({$outstanding}).",
                    ['invoice_no' => $invoice->invoice_no, 'outstanding' => (string) $outstanding],
                );
            }

            CustomerReceiptAllocation::updateOrCreate(
                ['customer_receipt_id' => $receipt->id, 'sales_invoice_id' => $invoice->id],
                ['amount' => (string) $amount],
            );

            $allocated = Dec::add($allocated, $amount);
        }

        if (Dec::gt($allocated, $receipt->amount)) {
            throw DomainException::make(
                'receipt.allocation_exceeds_amount',
                "إجمالي التوزيع ({$allocated}) يتجاوز مبلغ السند ({$receipt->amount}).",
            );
        }

        $receipt->allocated_amount = (string) Dec::round($allocated, Dec::SCALE_MONEY);
        $receipt->save();

        return $receipt;
    }

    public function post(CustomerReceipt $receipt, ?int $userId = null): CustomerReceipt
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->post($receipt, $userId));
        }

        $receipt = CustomerReceipt::lockForUpdate()->findOrFail($receipt->id);
        $receipt->load('allocations');

        if (! in_array($receipt->status, ['draft', 'pending_sync'], true)) {
            throw DomainException::make('receipt.not_draft', "سند القبض {$receipt->voucher_no} ليس في حالة قابلة للترحيل.");
        }

        $companyId = (int) $receipt->company_id;

        $debitAccountId = match ($receipt->payment_method) {
            'cash' => $receipt->cash_box_id
                ? (int) CashBox::findOrFail($receipt->cash_box_id)->account_id
                : $this->matrix->accountId($companyId, 'customer_receipt', 'cash'),
            'bank_transfer', 'card' => $receipt->bank_account_id
                ? (int) \App\Models\BankAccount::findOrFail($receipt->bank_account_id)->account_id
                : $this->matrix->accountId($companyId, 'customer_receipt', 'bank'),
            // الشيك ليس نقدية مؤكدة حتى التحصيل
            'cheque' => $this->matrix->accountId($companyId, 'customer_receipt', 'cheque_receivable'),
            default => throw DomainException::make('receipt.unknown_method', 'طريقة دفع غير معروفة.'),
        };

        $entry = $this->ledger->post(
            companyId: $companyId,
            entryDate: $receipt->receipt_date->toDateString(),
            sourceType: 'customer_receipt',
            sourceId: (int) $receipt->id,
            sourceNo: $receipt->voucher_no,
            description: "تحصيل من عميل — {$receipt->voucher_no}",
            lines: [
                [
                    'account_id' => $debitAccountId,
                    'debit' => (string) Dec::round($receipt->amount, Dec::SCALE_MONEY),
                    'partner_type' => $receipt->salesman_id ? 'salesman' : null,
                    'partner_id' => $receipt->salesman_id,
                    'description' => $receipt->salesman_id && $receipt->payment_method === 'cash'
                        ? 'عهدة نقدية لدى المندوب'
                        : 'متحصلات',
                ],
                [
                    'account_id' => $this->matrix->accountId($companyId, 'customer_receipt', 'ar'),
                    'credit' => (string) Dec::round($receipt->amount, Dec::SCALE_MONEY),
                    'partner_type' => 'customer',
                    'partner_id' => (int) $receipt->customer_id,
                    'description' => 'تخفيض مديونية العميل',
                ],
            ],
            branchId: $receipt->branch_id,
            userId: $userId,
        );

        // تحديث الفواتير المسدد عنها
        foreach ($receipt->allocations as $allocation) {
            $invoice = SalesInvoice::lockForUpdate()->findOrFail($allocation->sales_invoice_id);
            $invoice->paid_amount = (string) Dec::round(Dec::add($invoice->paid_amount, $allocation->amount), Dec::SCALE_MONEY);

            $outstanding = Dec::sub(Dec::sub($invoice->total_amount, $invoice->paid_amount), $invoice->returned_amount);
            $invoice->status = Dec::lte($outstanding, 0) ? 'paid' : 'partially_paid';
            $invoice->save();
        }

        $receipt->status = 'posted';
        $receipt->journal_entry_id = $entry->id;
        $receipt->posted_at = now();
        $receipt->save();

        $this->audit->log('post', 'customer_receipt', (int) $receipt->id, $receipt->voucher_no, null, [
            'amount' => $receipt->amount,
            'method' => $receipt->payment_method,
        ], companyId: $companyId);

        return $receipt->fresh('allocations');
    }

    /** خزنة العهدة النقدية للمندوب — تُنشأ تلقائيًا مرتبطة بحساب العهد. */
    public function custodyCashBoxId(int $companyId, int $salesmanId): int
    {
        $salesman = Salesman::findOrFail($salesmanId);

        if ($salesman->custody_cash_box_id) {
            return (int) $salesman->custody_cash_box_id;
        }

        $box = CashBox::create([
            'company_id' => $companyId,
            'branch_id' => $salesman->branch_id,
            'account_id' => $this->matrix->accountId($companyId, 'customer_receipt', 'custody_cash'),
            'code' => 'CUST-'.$salesman->code,
            'name' => "عهدة نقدية — {$salesman->name}",
            'type' => 'custody',
            'owner_user_id' => $salesman->user_id,
        ]);

        $salesman->custody_cash_box_id = $box->id;
        $salesman->save();

        return (int) $box->id;
    }
}
