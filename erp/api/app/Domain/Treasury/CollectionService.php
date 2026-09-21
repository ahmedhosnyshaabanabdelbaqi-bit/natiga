<?php

namespace App\Domain\Treasury;

use App\Domain\Accounting\LedgerService;
use App\Domain\Sales\InvoiceService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Cheque;
use App\Models\Customer;
use App\Models\Receipt;
use App\Models\ReceiptAllocation;
use App\Models\SalesInvoice;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Customer collections.
 *
 * The rule this class exists to hold: money a rep takes in the field is NOT in
 * the company safe. It is debited to that rep's own custody account and stays
 * there until an approved deposit moves it. Nothing here credits revenue —
 * revenue was recognised on the invoice; a receipt only settles a receivable.
 *
 * Posting:
 *   Dr  Rep custody / Cash box / Bank / Cheques receivable   amount
 *     Cr  Customer                                              amount
 *
 * A cheque is booked to a cheques-receivable account, never to cash, until it
 * clears.
 */
class CollectionService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly InvoiceService $invoices,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * @param  array<int, array{sales_invoice_id: int, amount: string}>  $allocations
     */
    public function create(array $header, array $allocations = []): Receipt
    {
        return DB::transaction(function () use ($header, $allocations) {
            $customer = Customer::findOrFail($header['customer_id']);
            $amount = Num::money($header['amount']);

            if (! Num::isPositive($amount, Num::MONEY_SCALE)) {
                throw DomainException::make('treasury.invalid_amount',
                    'قيمة التحصيل يجب أن تكون أكبر من صفر.', ['amount' => $amount]);
            }

            $method = $header['method'] ?? 'cash';
            $destination = $header['destination'] ?? ($header['rep_id'] ? 'custody' : 'cash_box');

            $this->assertDestinationIsCoherent($method, $destination, $header);

            $chequeId = null;
            if ($method === 'cheque') {
                $chequeId = $this->createCheque($customer, $header, $amount);
            }

            $receipt = Receipt::create([
                'company_id' => CompanyContext::idOrFail(),
                'branch_id' => $header['branch_id'] ?? null,
                'code' => $this->numbering->next('receipt', $header['branch_id'] ?? null),
                'receipt_date' => $header['receipt_date'] ?? now()->toDateString(),
                'customer_id' => $customer->id,
                'rep_id' => $header['rep_id'] ?? null,
                'method' => $method,
                'amount' => $amount,
                'destination' => $destination,
                'custody_user_id' => $destination === 'custody'
                    ? ($header['custody_user_id'] ?? $header['rep_id']) : null,
                'cash_box_id' => $destination === 'cash_box' ? ($header['cash_box_id'] ?? null) : null,
                'bank_id' => $destination === 'bank' ? ($header['bank_id'] ?? null) : null,
                'cheque_id' => $chequeId,
                'status' => 'draft',
                'source' => $header['source'] ?? 'web',
                'device_id' => $header['device_id'] ?? null,
                'client_uuid' => $header['client_uuid'] ?? null,
                'field_no' => $header['field_no'] ?? null,
                'visit_id' => $header['visit_id'] ?? null,
                'created_by' => auth()->id(),
                'notes' => $header['notes'] ?? null,
            ]);

            if ($allocations !== []) {
                $this->allocate($receipt, $allocations);
            } elseif ($header['auto_allocate'] ?? false) {
                $this->autoAllocateOldestFirst($receipt);
            }

            return $receipt->fresh(['allocations']);
        });
    }

    /**
     * Spread a receipt across specific invoices.
     *
     * Over-allocating an invoice or the receipt itself is refused; leftover
     * money stays as an unallocated credit rather than being forced somewhere.
     */
    public function allocate(Receipt $receipt, array $allocations): Receipt
    {
        return DB::transaction(function () use ($receipt, $allocations) {
            $receipt = Receipt::with('allocations')->lockForUpdate()->findOrFail($receipt->id);

            $total = '0';

            foreach ($allocations as $input) {
                $invoice = SalesInvoice::lockForUpdate()->findOrFail($input['sales_invoice_id']);

                if ($invoice->customer_id !== $receipt->customer_id) {
                    throw DomainException::make('treasury.allocation_customer_mismatch',
                        "الفاتورة «{$invoice->code}» تخص عميلًا آخر.",
                        ['invoice_id' => $invoice->id]);
                }
                if ($invoice->status !== 'posted') {
                    throw DomainException::make('treasury.allocation_invoice_unposted',
                        "لا يمكن تحصيل فاتورة غير مرحّلة «{$invoice->code}».",
                        ['invoice_id' => $invoice->id]);
                }

                $amount = Num::money($input['amount']);
                $outstanding = $invoice->outstandingAmount();

                if (Num::cmp($amount, $outstanding, Num::MONEY_SCALE) > 0) {
                    throw DomainException::make('treasury.over_allocation', sprintf(
                        'المبلغ الموزع على الفاتورة «%s» (%s) يتجاوز المتبقي عليها (%s).',
                        $invoice->code, $amount, $outstanding
                    ), ['invoice_id' => $invoice->id, 'outstanding' => $outstanding]);
                }

                ReceiptAllocation::updateOrCreate(
                    ['receipt_id' => $receipt->id, 'sales_invoice_id' => $invoice->id],
                    ['amount' => $amount]
                );

                $total = Num::add($total, $amount, Num::MONEY_SCALE);
            }

            if (Num::cmp($total, $receipt->amount, Num::MONEY_SCALE) > 0) {
                throw DomainException::make('treasury.allocation_exceeds_receipt', sprintf(
                    'إجمالي التوزيع (%s) يتجاوز قيمة السند (%s).', $total, $receipt->amount
                ), ['receipt_id' => $receipt->id]);
            }

            $receipt->forceFill(['allocated_amount' => Num::money($total)])->save();

            if ($receipt->status === 'posted') {
                foreach ($receipt->allocations as $allocation) {
                    $this->invoices->refreshPaymentStatus($allocation->salesInvoice);
                }
            }

            return $receipt->fresh(['allocations']);
        });
    }

    /** Apply a receipt to the customer's oldest open invoices first. */
    public function autoAllocateOldestFirst(Receipt $receipt): Receipt
    {
        $remaining = Num::money($receipt->amount);
        $allocations = [];

        $invoices = SalesInvoice::query()
            ->where('customer_id', $receipt->customer_id)
            ->where('status', 'posted')
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->orderBy('due_date')
            ->orderBy('invoice_date')
            ->get();

        foreach ($invoices as $invoice) {
            if (! Num::isPositive($remaining, Num::MONEY_SCALE)) {
                break;
            }

            $take = Num::min($invoice->outstandingAmount(), $remaining);

            if (Num::isPositive($take, Num::MONEY_SCALE)) {
                $allocations[] = ['sales_invoice_id' => $invoice->id, 'amount' => $take];
                $remaining = Num::sub($remaining, $take, Num::MONEY_SCALE);
            }
        }

        return $allocations === [] ? $receipt : $this->allocate($receipt, $allocations);
    }

    public function post(Receipt $receipt): Receipt
    {
        return DB::transaction(function () use ($receipt) {
            $receipt = Receipt::with(['allocations.salesInvoice', 'customer'])
                ->lockForUpdate()->findOrFail($receipt->id);

            if ($receipt->status === 'posted') {
                return $receipt;
            }
            if ($receipt->status === 'cancelled') {
                throw DomainException::make('treasury.receipt_cancelled',
                    "سند القبض «{$receipt->code}» ملغي.", ['receipt_id' => $receipt->id]);
            }

            $accounts = $this->ledger->accounts();
            $draft = $this->ledger->draftFor(
                'receipt', $receipt->id, $receipt->receipt_date->toDateString(),
                "سند قبض {$receipt->code} — {$receipt->customer->name}"
            );

            $debitAccount = match (true) {
                // A cheque is a claim, not cash — even when a rep is holding it.
                $receipt->method === 'cheque' => $accounts->forCustody(
                    $receipt->custody_user_id ?? $receipt->rep_id ?? auth()->id(), 'cheque'
                ),
                $receipt->destination === 'custody' => $accounts->forCustody(
                    $receipt->custody_user_id ?? $receipt->rep_id
                ),
                $receipt->destination === 'cash_box' => $accounts->forCashBox($receipt->cash_box_id),
                $receipt->destination === 'bank' => $accounts->forBank($receipt->bank_id),
                default => throw DomainException::make('treasury.unknown_destination',
                    'وجهة التحصيل غير معروفة.', ['destination' => $receipt->destination]),
            };

            $draft->debit($debitAccount, $receipt->amount,
                "تحصيل {$receipt->method}", 'customer', $receipt->customer_id);

            $draft->credit($accounts->forCustomer($receipt->customer), $receipt->amount,
                'سداد من العميل', 'customer', $receipt->customer_id);

            $entry = $this->ledger->post($draft);

            $receipt->forceFill([
                'status' => 'posted',
                'journal_entry_id' => $entry->id,
                'posted_at' => now(),
            ])->save();

            foreach ($receipt->allocations as $allocation) {
                $this->invoices->refreshPaymentStatus($allocation->salesInvoice);
            }

            return $receipt->fresh(['allocations']);
        });
    }

    public function cancel(Receipt $receipt, string $reason): Receipt
    {
        return DB::transaction(function () use ($receipt, $reason) {
            $receipt = Receipt::with('allocations.salesInvoice')->lockForUpdate()->findOrFail($receipt->id);

            if ($receipt->status === 'cancelled') {
                return $receipt;
            }

            if ($receipt->status === 'posted' && $receipt->journalEntry) {
                $this->ledger->reverse($receipt->journalEntry, now()->toDateString(),
                    "إلغاء سند القبض {$receipt->code}: {$reason}");
            }

            $invoices = $receipt->allocations->map->salesInvoice->filter();
            $receipt->allocations()->delete();

            $receipt->forceFill([
                'status' => 'cancelled',
                'allocated_amount' => '0',
                'notes' => trim(($receipt->notes ?? '')."\nسبب الإلغاء: {$reason}"),
            ])->save();

            foreach ($invoices as $invoice) {
                $this->invoices->refreshPaymentStatus($invoice);
            }

            return $receipt;
        });
    }

    protected function createCheque(Customer $customer, array $header, string $amount): int
    {
        if (empty($header['cheque_no']) || empty($header['cheque_due_date'])) {
            throw DomainException::make('treasury.cheque_details_required',
                'رقم الشيك وتاريخ الاستحقاق مطلوبان.', []);
        }

        return Cheque::create([
            'company_id' => CompanyContext::idOrFail(),
            'code' => $this->numbering->next('cheque'),
            'direction' => 'in',
            'customer_id' => $customer->id,
            'drawer_bank' => $header['drawer_bank'] ?? null,
            'cheque_no' => $header['cheque_no'],
            'issue_date' => $header['cheque_issue_date'] ?? null,
            'due_date' => $header['cheque_due_date'],
            'amount' => $amount,
            'status' => 'received',
        ])->id;
    }

    /** Catch destinations that would misstate where the money is. */
    protected function assertDestinationIsCoherent(string $method, string $destination, array $header): void
    {
        if ($destination === 'cash_box' && empty($header['cash_box_id'])) {
            throw DomainException::make('treasury.cash_box_required',
                'يجب تحديد الخزنة عند التوريد المباشر لها.');
        }
        if ($destination === 'bank' && empty($header['bank_id'])) {
            throw DomainException::make('treasury.bank_required',
                'يجب تحديد البنك عند التحويل البنكي المباشر.');
        }
        if ($destination === 'custody' && empty($header['custody_user_id']) && empty($header['rep_id'])) {
            throw DomainException::make('treasury.custody_user_required',
                'يجب تحديد صاحب العهدة عند التحصيل الميداني.');
        }
        if ($method === 'bank' && $destination === 'custody') {
            throw DomainException::make('treasury.bank_transfer_not_custody',
                'التحويل البنكي لا يُضاف إلى عهدة المندوب النقدية.');
        }
    }
}
