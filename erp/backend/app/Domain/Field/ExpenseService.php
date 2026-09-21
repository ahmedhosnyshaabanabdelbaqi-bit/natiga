<?php

namespace App\Domain\Field;

use App\Domain\Accounting\LedgerPoster;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\BankAccount;
use App\Models\CashBox;
use App\Models\Expense;
use App\Models\Salesman;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * المصروفات التشغيلية (وقود، صيانة، تحميل، نقل، طريق، إيجارات...).
 *
 * المصروف المدفوع من عهدة المندوب يُخصم من عهدته النقدية:
 *   من ح/ المصروف  إلى ح/ عهدة المحصل.
 *
 * لا يُرحَّل مصروف قبل اعتماده.
 */
class ExpenseService
{
    public function __construct(
        private readonly LedgerPoster $ledger,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function createApproveAndPost(array $data): Expense
    {
        return DB::transaction(function () use ($data) {
            $expense = $this->create($data);
            $expense = $this->approve($expense, $data['approved_by'] ?? $data['user_id'] ?? null);

            return $this->post($expense, $data['user_id'] ?? null);
        });
    }

    public function create(array $data): Expense
    {
        $companyId = (int) $data['company_id'];
        $amount = Dec::round($data['amount'], Dec::SCALE_MONEY);

        if (! $amount->isPositive()) {
            throw DomainException::make('expense.invalid_amount', 'مبلغ المصروف يجب أن يكون موجبًا.');
        }

        $paidFrom = $data['paid_from'] ?? 'cash_box';
        $cashBoxId = $data['cash_box_id'] ?? null;

        if ($paidFrom === 'salesman_custody') {
            if (empty($data['salesman_id'])) {
                throw DomainException::make('expense.salesman_required', 'المصروف من عهدة المندوب يتطلب تحديد المندوب.');
            }
            $cashBoxId ??= Salesman::findOrFail($data['salesman_id'])->custody_cash_box_id;

            if ($cashBoxId === null) {
                throw DomainException::make('expense.no_custody_box', 'لا توجد خزنة عهدة لهذا المندوب بعد.');
            }
        }

        return Expense::create([
            'company_id' => $companyId,
            'branch_id' => $data['branch_id'] ?? null,
            'expense_no' => $data['expense_no'] ?? $this->numbers->next($companyId, 'expense', $data['branch_id'] ?? null, $data['expense_date']),
            'expense_date' => $data['expense_date'],
            'account_id' => $data['account_id'],
            'cost_center_id' => $data['cost_center_id'] ?? null,
            'category' => $data['category'] ?? 'other',
            'amount' => (string) $amount,
            'paid_from' => $paidFrom,
            'cash_box_id' => $cashBoxId,
            'bank_account_id' => $data['bank_account_id'] ?? null,
            'salesman_id' => $data['salesman_id'] ?? null,
            'vehicle_id' => $data['vehicle_id'] ?? null,
            'day_closure_id' => $data['day_closure_id'] ?? null,
            'status' => 'draft',
            'description' => $data['description'] ?? null,
            'created_by' => $data['user_id'] ?? null,
        ]);
    }

    public function approve(Expense $expense, ?int $approverId): Expense
    {
        $expense = Expense::lockForUpdate()->findOrFail($expense->id);

        if (! in_array($expense->status, ['draft', 'pending_approval'], true)) {
            throw DomainException::make('expense.not_approvable', "المصروف {$expense->expense_no} ليس في حالة قابلة للاعتماد.");
        }

        $expense->status = 'approved';
        $expense->approved_by = $approverId;
        $expense->approved_at = now();
        $expense->save();

        return $expense;
    }

    public function post(Expense $expense, ?int $userId = null): Expense
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->post($expense, $userId));
        }

        $expense = Expense::lockForUpdate()->findOrFail($expense->id);

        if ($expense->status !== 'approved') {
            throw DomainException::make(
                'expense.not_approved',
                "المصروف {$expense->expense_no} غير معتمد. الاعتماد يسبق الترحيل.",
            );
        }

        $companyId = (int) $expense->company_id;

        $creditAccountId = match ($expense->paid_from) {
            'cash_box', 'salesman_custody' => (int) CashBox::findOrFail($expense->cash_box_id)->account_id,
            'bank' => (int) BankAccount::findOrFail($expense->bank_account_id)->account_id,
            default => throw DomainException::make('expense.unknown_source', 'مصدر دفع غير معروف.'),
        };

        $entry = $this->ledger->post(
            companyId: $companyId,
            entryDate: $expense->expense_date->toDateString(),
            sourceType: 'expense',
            sourceId: (int) $expense->id,
            sourceNo: $expense->expense_no,
            description: "مصروف {$expense->category} — {$expense->expense_no}",
            lines: [
                [
                    'account_id' => (int) $expense->account_id,
                    'debit' => (string) Dec::round($expense->amount, Dec::SCALE_MONEY),
                    'cost_center_id' => $expense->cost_center_id,
                    'description' => $expense->description ?? 'مصروف تشغيلي',
                ],
                [
                    'account_id' => $creditAccountId,
                    'credit' => (string) Dec::round($expense->amount, Dec::SCALE_MONEY),
                    'partner_type' => $expense->paid_from === 'salesman_custody' ? 'salesman' : null,
                    'partner_id' => $expense->paid_from === 'salesman_custody' ? $expense->salesman_id : null,
                    'description' => $expense->paid_from === 'salesman_custody' ? 'مدفوع من عهدة المندوب' : 'مدفوع من الخزنة/البنك',
                ],
            ],
            branchId: $expense->branch_id,
            userId: $userId,
        );

        $expense->status = 'posted';
        $expense->journal_entry_id = $entry->id;
        $expense->posted_at = now();
        $expense->save();

        $this->audit->log('post', 'expense', (int) $expense->id, $expense->expense_no, null, [
            'amount' => $expense->amount,
            'paid_from' => $expense->paid_from,
        ], companyId: $companyId);

        return $expense;
    }
}
