<?php

namespace App\Domain\Field;

use App\Domain\Accounting\LedgerPoster;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\BankAccount;
use App\Models\CashBox;
use App\Models\CashDeposit;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * توريد عهدة المندوب إلى خزنة الشركة أو البنك.
 *
 * القيد: من ح/ خزنة الشركة (أو البنك) إلى ح/ عهدة المحصل.
 * لا يُنشأ إيراد جديد عند الإيداع — النقدية تنتقل فقط بين حسابين.
 */
class CashDepositService
{
    public function __construct(
        private readonly LedgerPoster $ledger,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function createAndPost(array $data): CashDeposit
    {
        return DB::transaction(function () use ($data) {
            $deposit = $this->create($data);

            return $this->post($deposit, $data['user_id'] ?? null);
        });
    }

    public function create(array $data): CashDeposit
    {
        $companyId = (int) $data['company_id'];
        $amount = Dec::round($data['amount'], Dec::SCALE_MONEY);

        if (! $amount->isPositive()) {
            throw DomainException::make('deposit.invalid_amount', 'مبلغ الإيداع يجب أن يكون موجبًا.');
        }

        $hasCashBox = ! empty($data['to_cash_box_id']);
        $hasBank = ! empty($data['to_bank_account_id']);

        if ($hasCashBox === $hasBank) {
            throw DomainException::make('deposit.one_destination', 'حدد وجهة واحدة للإيداع: خزنة أو بنك.');
        }

        return CashDeposit::create([
            'company_id' => $companyId,
            'branch_id' => $data['branch_id'] ?? null,
            'deposit_no' => $data['deposit_no'] ?? $this->numbers->next($companyId, 'cash_deposit', $data['branch_id'] ?? null, $data['deposit_date']),
            'deposit_date' => $data['deposit_date'],
            'salesman_id' => $data['salesman_id'] ?? null,
            'from_cash_box_id' => $data['from_cash_box_id'],
            'to_cash_box_id' => $data['to_cash_box_id'] ?? null,
            'to_bank_account_id' => $data['to_bank_account_id'] ?? null,
            'amount' => (string) $amount,
            'reference_no' => $data['reference_no'] ?? null,
            'status' => 'draft',
            'notes' => $data['notes'] ?? null,
            'created_by' => $data['user_id'] ?? null,
        ]);
    }

    public function post(CashDeposit $deposit, ?int $userId = null, ?int $approvedBy = null): CashDeposit
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->post($deposit, $userId, $approvedBy));
        }

        $deposit = CashDeposit::lockForUpdate()->findOrFail($deposit->id);

        if (! in_array($deposit->status, ['draft', 'pending_approval'], true)) {
            throw DomainException::make('deposit.not_draft', "الإيداع {$deposit->deposit_no} ليس في حالة قابلة للترحيل.");
        }

        $companyId = (int) $deposit->company_id;

        $fromBox = CashBox::findOrFail($deposit->from_cash_box_id);

        $toAccountId = $deposit->to_cash_box_id
            ? (int) CashBox::findOrFail($deposit->to_cash_box_id)->account_id
            : (int) BankAccount::findOrFail($deposit->to_bank_account_id)->account_id;

        if ((int) $fromBox->account_id === $toAccountId) {
            throw DomainException::make('deposit.same_account', 'لا يمكن الإيداع من وإلى نفس الحساب.');
        }

        $entry = $this->ledger->post(
            companyId: $companyId,
            entryDate: $deposit->deposit_date->toDateString(),
            sourceType: 'cash_deposit',
            sourceId: (int) $deposit->id,
            sourceNo: $deposit->deposit_no,
            description: "توريد عهدة نقدية — {$deposit->deposit_no}",
            lines: [
                [
                    'account_id' => $toAccountId,
                    'debit' => (string) Dec::round($deposit->amount, Dec::SCALE_MONEY),
                    'description' => 'استلام النقدية بالخزنة/البنك',
                ],
                [
                    'account_id' => (int) $fromBox->account_id,
                    'credit' => (string) Dec::round($deposit->amount, Dec::SCALE_MONEY),
                    'partner_type' => $deposit->salesman_id ? 'salesman' : null,
                    'partner_id' => $deposit->salesman_id,
                    'description' => 'تخفيض عهدة المحصل',
                ],
            ],
            branchId: $deposit->branch_id,
            userId: $userId,
        );

        $deposit->status = 'posted';
        $deposit->journal_entry_id = $entry->id;
        $deposit->approved_by = $approvedBy ?? $userId;
        $deposit->posted_at = now();
        $deposit->save();

        $this->audit->log('post', 'cash_deposit', (int) $deposit->id, $deposit->deposit_no, null, [
            'amount' => $deposit->amount,
        ], companyId: $companyId);

        return $deposit;
    }
}
