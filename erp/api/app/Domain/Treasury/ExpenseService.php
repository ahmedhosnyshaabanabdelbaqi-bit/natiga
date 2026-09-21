<?php

namespace App\Domain\Treasury;

use App\Domain\Accounting\LedgerService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Approval;
use App\Models\ApprovalFlow;
use App\Models\Expense;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Operating expenses — fuel, maintenance, loading, rent, road costs.
 *
 *   Dr  Expense account       net
 *   Dr  Input VAT             recoverable tax
 *     Cr  Cash box / Bank / Rep custody
 *
 * An expense paid from a rep's custody reduces the cash they are accountable
 * for, which is exactly how it shows up in the day-close cash equation.
 */
class ExpenseService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly DocumentNumbering $numbering,
    ) {}

    public function create(array $header): Expense
    {
        $amount = Num::money($header['amount']);

        if (! Num::isPositive($amount, Num::MONEY_SCALE)) {
            throw DomainException::make('treasury.invalid_amount',
                'قيمة المصروف يجب أن تكون أكبر من صفر.', ['amount' => $amount]);
        }

        return DB::transaction(function () use ($header, $amount) {
            $expense = Expense::create([
                'company_id' => CompanyContext::idOrFail(),
                'branch_id' => $header['branch_id'] ?? null,
                'code' => $this->numbering->next('expense', $header['branch_id'] ?? null),
                'expense_date' => $header['expense_date'] ?? now()->toDateString(),
                'account_id' => $header['account_id'],
                'amount' => $amount,
                'tax_amount' => Num::money($header['tax_amount'] ?? '0'),
                'cost_center_id' => $header['cost_center_id'] ?? null,
                'vehicle_id' => $header['vehicle_id'] ?? null,
                'paid_from_kind' => $header['paid_from_kind'] ?? 'cash_box',
                'paid_from_id' => $header['paid_from_id'] ?? null,
                'supplier_id' => $header['supplier_id'] ?? null,
                'status' => 'draft',
                'attachment_path' => $header['attachment_path'] ?? null,
                'is_recurring' => $header['is_recurring'] ?? false,
                'recurrence' => $header['recurrence'] ?? null,
                'created_by' => auth()->id(),
                'description' => $header['description'] ?? null,
            ]);

            // Raise an approval request when the amount crosses a configured threshold.
            $flow = ApprovalFlow::query()
                ->where('doc_type', 'expense')
                ->where('is_active', true)
                ->where('min_amount', '<=', $amount)
                ->where(fn ($q) => $q->whereNull('max_amount')->orWhere('max_amount', '>=', $amount))
                ->orderBy('level')
                ->first();

            if ($flow) {
                $expense->forceFill(['status' => 'pending_approval'])->save();

                Approval::create([
                    'company_id' => $expense->company_id,
                    'doc_type' => 'expense',
                    'doc_id' => $expense->id,
                    'level' => $flow->level,
                    'status' => 'pending',
                    'reason_code' => 'expense_threshold',
                    'amount' => $amount,
                    'requested_by' => auth()->id(),
                ]);
            }

            return $expense;
        });
    }

    public function post(Expense $expense): Expense
    {
        return DB::transaction(function () use ($expense) {
            $expense = Expense::lockForUpdate()->findOrFail($expense->id);

            if ($expense->status === 'posted') {
                return $expense;
            }
            if ($expense->status === 'pending_approval') {
                throw DomainException::make('treasury.expense_needs_approval',
                    "المصروف «{$expense->code}» ينتظر الاعتماد.", ['expense_id' => $expense->id]);
            }
            if ($expense->status === 'rejected') {
                throw DomainException::make('treasury.expense_rejected',
                    "المصروف «{$expense->code}» مرفوض.", ['expense_id' => $expense->id]);
            }

            $accounts = $this->ledger->accounts();
            $net = Num::sub($expense->amount, $expense->tax_amount, Num::MONEY_SCALE);

            $draft = $this->ledger->draftFor(
                'expense', $expense->id, $expense->expense_date->toDateString(),
                "مصروف {$expense->code}".($expense->description ? " — {$expense->description}" : '')
            );

            $draft->debit($expense->account_id, $net, $expense->description,
                null, null, $expense->cost_center_id);

            if (Num::isPositive($expense->tax_amount, Num::MONEY_SCALE)) {
                $draft->debit($accounts->key('vat_input'), $expense->tax_amount, 'ضريبة مدخلات');
            }

            $draft->credit(
                $accounts->forTreasury($expense->paid_from_kind, $expense->paid_from_id),
                $expense->amount,
                'سداد المصروف',
                $expense->paid_from_kind === 'custody' ? 'user' : null,
                $expense->paid_from_kind === 'custody' ? $expense->paid_from_id : null,
            );

            $entry = $this->ledger->post($draft);

            $expense->forceFill([
                'status' => 'posted',
                'journal_entry_id' => $entry->id,
            ])->save();

            return $expense;
        });
    }

    public function approve(Expense $expense, ?string $note = null): Expense
    {
        return DB::transaction(function () use ($expense, $note) {
            $approval = Approval::query()
                ->where('doc_type', 'expense')
                ->where('doc_id', $expense->id)
                ->where('status', 'pending')
                ->first();

            // Whoever raised it may not also approve it.
            if ($approval && $approval->requested_by === auth()->id()) {
                $flow = ApprovalFlow::query()
                    ->where('doc_type', 'expense')
                    ->where('level', $approval->level)
                    ->first();

                if (! $flow || $flow->block_self_approval) {
                    throw DomainException::make('approval.self_approval_blocked',
                        'لا يجوز اعتماد مصروف أنشأته بنفسك.', ['expense_id' => $expense->id]);
                }
            }

            $approval?->forceFill([
                'status' => 'approved',
                'decided_by' => auth()->id(),
                'decided_at' => now(),
                'note' => $note,
            ])->save();

            $expense->forceFill([
                'status' => 'approved',
                'approved_by' => auth()->id(),
            ])->save();

            return $this->post($expense);
        });
    }
}
