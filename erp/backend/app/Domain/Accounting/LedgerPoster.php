<?php

namespace App\Domain\Accounting;

use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\Account;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * محرك الترحيل بالقيد المزدوج.
 *
 * ضمانات:
 *  - كل قيد متوازن (مجموع المدين = مجموع الدائن) وإلا يُرفض.
 *  - قيد واحد فقط لكل (مستند مصدر × نوع قيد) — قيد فريد في قاعدة البيانات يمنع الترحيل المزدوج.
 *  - يُستدعى داخل معاملة المستند نفسها، فإما تنجح الحركة كلها أو تتراجع كلها.
 *  - لا يُعدَّل قيد مرحل؛ التصحيح بقيد عكسي موثق.
 */
class LedgerPoster
{
    public function __construct(
        private readonly PeriodGuard $periodGuard,
        private readonly DocumentNumberService $numbers,
    ) {}

    /**
     * @param  array<int, array{account_id:int, debit?:mixed, credit?:mixed, partner_type?:string|null,
     *                           partner_id?:int|null, cost_center_id?:int|null, description?:string|null,
     *                           due_date?:string|null}>  $lines
     */
    public function post(
        int $companyId,
        string $entryDate,
        string $sourceType,
        int $sourceId,
        ?string $sourceNo,
        string $description,
        array $lines,
        ?int $branchId = null,
        string $entryType = 'normal',
        ?string $docDate = null,
        ?int $userId = null,
        string $currencyCode = 'EGP',
    ): JournalEntry {
        if (! DB::transactionLevel()) {
            throw DomainException::make(
                'ledger.no_transaction',
                'الترحيل المحاسبي يجب أن يتم داخل معاملة قاعدة بيانات واحدة مع أثر المستند.',
            );
        }

        $normalized = $this->normalize($companyId, $lines);

        if ($normalized === []) {
            throw DomainException::make('ledger.empty', 'لا يمكن ترحيل قيد بلا أسطر.');
        }

        $totalDebit = Dec::round(Dec::sum(array_column($normalized, 'debit')), Dec::SCALE_MONEY);
        $totalCredit = Dec::round(Dec::sum(array_column($normalized, 'credit')), Dec::SCALE_MONEY);

        if (! Dec::eq($totalDebit, $totalCredit)) {
            throw DomainException::make(
                'ledger.unbalanced',
                "القيد غير متوازن: مدين {$totalDebit} مقابل دائن {$totalCredit}.",
                ['source_type' => $sourceType, 'source_id' => $sourceId],
            );
        }

        if (Dec::isZero($totalDebit)) {
            throw DomainException::make('ledger.zero_amount', 'لا يمكن ترحيل قيد بقيمة صفر.');
        }

        $period = $this->periodGuard->resolveOpenPeriod($companyId, $entryDate);

        // منع الترحيل المزدوج لنفس المستند
        $existing = JournalEntry::query()
            ->where('company_id', $companyId)
            ->where('source_type', $sourceType)
            ->where('source_id', $sourceId)
            ->where('entry_type', $entryType)
            ->first();

        if ($existing) {
            throw DomainException::make(
                'ledger.already_posted',
                "المستند {$sourceType}#{$sourceId} مُرحَّل بالفعل بالقيد {$existing->entry_no}.",
                ['journal_entry_id' => $existing->id],
            );
        }

        $entry = JournalEntry::create([
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'fiscal_period_id' => $period->id,
            'entry_no' => $this->numbers->next($companyId, 'journal_entry', null, $entryDate),
            'entry_date' => $entryDate,
            'doc_date' => $docDate ?? $entryDate,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'source_no' => $sourceNo,
            'entry_type' => $entryType,
            'total_debit' => (string) $totalDebit,
            'total_credit' => (string) $totalCredit,
            'currency_code' => $currencyCode,
            'description' => $description,
            'status' => 'posted',
            'created_by' => $userId,
            'posted_at' => now(),
        ]);

        $lineNo = 1;
        foreach ($normalized as $line) {
            JournalLine::create([
                'journal_entry_id' => $entry->id,
                'company_id' => $companyId,
                'line_no' => $lineNo++,
                'account_id' => $line['account_id'],
                'cost_center_id' => $line['cost_center_id'],
                'debit' => $line['debit'],
                'credit' => $line['credit'],
                'partner_type' => $line['partner_type'],
                'partner_id' => $line['partner_id'],
                'due_date' => $line['due_date'],
                'description' => $line['description'] ?? $description,
            ]);
        }

        return $entry;
    }

    /**
     * قيد عكسي موثق — الطريقة الوحيدة لإلغاء أثر قيد مرحل.
     */
    public function reverse(JournalEntry $entry, string $reversalDate, string $reason, ?int $userId = null): JournalEntry
    {
        if ($entry->status === 'reversed') {
            throw DomainException::make('ledger.already_reversed', "القيد {$entry->entry_no} معكوس بالفعل.");
        }

        $lines = $entry->lines->map(fn (JournalLine $l) => [
            'account_id' => $l->account_id,
            'debit' => $l->credit,
            'credit' => $l->debit,
            'partner_type' => $l->partner_type,
            'partner_id' => $l->partner_id,
            'cost_center_id' => $l->cost_center_id,
            'description' => $l->description,
        ])->all();

        $reversal = $this->post(
            companyId: (int) $entry->company_id,
            entryDate: $reversalDate,
            sourceType: $entry->source_type,
            sourceId: (int) $entry->source_id,
            sourceNo: $entry->source_no,
            description: "عكس القيد {$entry->entry_no}: {$reason}",
            lines: $lines,
            branchId: $entry->branch_id,
            entryType: 'reversal',
            userId: $userId,
        );

        $reversal->reverses_entry_id = $entry->id;
        $reversal->save();

        $entry->status = 'reversed';
        $entry->save();

        return $reversal;
    }

    /**
     * دمج الأسطر المتكررة وتنظيف الأصفار، مع التحقق من صلاحية الحساب.
     */
    private function normalize(int $companyId, array $lines): array
    {
        $accounts = [];
        $result = [];

        foreach ($lines as $line) {
            $debit = Dec::round($line['debit'] ?? 0, Dec::SCALE_MONEY);
            $credit = Dec::round($line['credit'] ?? 0, Dec::SCALE_MONEY);

            if (Dec::isNegative($debit) || Dec::isNegative($credit)) {
                throw DomainException::make('ledger.negative_amount', 'لا يُسمح بمبالغ سالبة في أسطر القيد؛ استخدم الجانب المقابل.');
            }

            if (Dec::isZero($debit) && Dec::isZero($credit)) {
                continue;
            }

            if (! Dec::isZero($debit) && ! Dec::isZero($credit)) {
                throw DomainException::make('ledger.both_sides', 'السطر لا يكون مدينًا ودائنًا في الوقت نفسه.');
            }

            $accountId = (int) $line['account_id'];

            if (! isset($accounts[$accountId])) {
                $account = Account::find($accountId);
                if (! $account || (int) $account->company_id !== $companyId) {
                    throw DomainException::make(
                        'ledger.invalid_account',
                        "الحساب #{$accountId} غير موجود أو لا يتبع هذه الشركة — لا يُسمح بربط مستندات شركات مختلفة.",
                    );
                }
                if (! $account->is_leaf) {
                    throw DomainException::make('ledger.not_leaf', "الحساب {$account->code} حساب تجميعي ولا يقبل الترحيل المباشر.");
                }
                if (! $account->is_active) {
                    throw DomainException::make('ledger.inactive_account', "الحساب {$account->code} غير نشط.");
                }
                if ($account->require_cost_center && empty($line['cost_center_id'])) {
                    throw DomainException::make('ledger.cost_center_required', "الحساب {$account->code} يتطلب مركز تكلفة.");
                }
                $accounts[$accountId] = $account;
            }

            $result[] = [
                'account_id' => $accountId,
                'debit' => (string) $debit,
                'credit' => (string) $credit,
                'partner_type' => $line['partner_type'] ?? null,
                'partner_id' => $line['partner_id'] ?? null,
                'cost_center_id' => $line['cost_center_id'] ?? null,
                'description' => $line['description'] ?? null,
                'due_date' => $line['due_date'] ?? null,
            ];
        }

        return $result;
    }
}
