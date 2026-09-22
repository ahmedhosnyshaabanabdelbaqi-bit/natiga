<?php

declare(strict_types=1);

namespace App\Modules\Accounting\Services;

use App\Modules\Accounting\Models\Account;
use App\Modules\Accounting\Models\AccountingPeriod;
use App\Modules\Accounting\Models\AccountMapping;
use App\Modules\Accounting\Models\JournalEntry;
use App\Modules\Accounting\Models\JournalLine;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SequenceService;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Double-entry posting behind the operational screens.
 *
 * Guarantees:
 *  - every entry balances (also enforced by a CHECK constraint);
 *  - one source document + purpose can post only once (unique index), so a
 *    retried sync can never double-post revenue;
 *  - a closed accounting period refuses new entries.
 *
 * Accounts are referenced by MAPPING KEY, never by hard-coded code, so a shop
 * can re-map its chart of accounts without touching code.
 */
class PostingService
{
    public const SALES_REVENUE = 'sales_revenue';

    public const SALES_DISCOUNT = 'sales_discount';

    public const SALES_RETURNS = 'sales_returns';

    public const COGS = 'cogs';

    public const INVENTORY = 'inventory';

    public const CASH = 'cash';

    public const ACCOUNTS_RECEIVABLE = 'accounts_receivable';

    public const ACCOUNTS_PAYABLE = 'accounts_payable';

    public const TAX_PAYABLE = 'tax_payable';

    public const CARD_CLEARING = 'card_clearing';

    public const CASH_VARIANCE = 'cash_variance';

    public const INVENTORY_VARIANCE = 'inventory_variance';

    public const EXPENSE = 'expense';

    public const ROUNDING = 'rounding';

    public function __construct(
        private readonly SequenceService $sequences,
        private readonly PosContext $context,
    ) {}

    /**
     * Post one balanced entry.
     *
     * @param  list<array{account: string, debit?: Money|string, credit?: Money|string, memo?: string}>  $lines
     *                                                                                                           `account` is a MAPPING KEY.
     */
    public function post(
        string $purpose,
        ?Model $source,
        array $lines,
        string $description,
        ?string $entryDate = null,
        ?int $branchId = null,
    ): ?JournalEntry {
        $entryDate ??= now()->toDateString();
        $branchId ??= $this->context->branchId();

        $this->assertPeriodOpen($entryDate);

        $prepared = [];
        $totalDebit = Money::zero();
        $totalCredit = Money::zero();

        foreach ($lines as $line) {
            $debit = isset($line['debit']) ? Money::of($line['debit'])->quantize() : Money::zero();
            $credit = isset($line['credit']) ? Money::of($line['credit'])->quantize() : Money::zero();

            if ($debit->isZero() && $credit->isZero()) {
                continue; // skip zero-value lines (e.g. no tax configured)
            }
            if (! $debit->isZero() && ! $credit->isZero()) {
                throw new InvalidOperationException('سطر القيد لا يمكن أن يكون مدينًا ودائنًا معًا.', 'journal_line_two_sided');
            }

            $prepared[] = [
                'account_id' => $this->accountId($line['account']),
                'debit' => $debit->toString(4),
                'credit' => $credit->toString(4),
                'branch_id' => $branchId,
                'memo' => $line['memo'] ?? null,
            ];

            $totalDebit = $totalDebit->plus($debit);
            $totalCredit = $totalCredit->plus($credit);
        }

        if ($prepared === []) {
            return null;
        }

        if (! $totalDebit->equals($totalCredit)) {
            throw new InvalidOperationException(
                'القيد غير متوازن.',
                'journal_unbalanced',
                500,
                ['debit' => $totalDebit->toString(), 'credit' => $totalCredit->toString()],
            );
        }

        // Guard against double posting BEFORE inserting: a unique violation
        // would abort the surrounding transaction in PostgreSQL. The unique
        // index on (source_type, source_id, purpose) remains the backstop.
        if ($source && JournalEntry::query()
            ->where('source_type', $source::class)
            ->where('source_id', $source->getKey())
            ->where('purpose', $purpose)
            ->exists()
        ) {
            throw new InvalidOperationException(
                'سبق ترحيل قيد لهذا المستند.',
                'journal_already_posted',
                409,
                ['purpose' => $purpose],
            );
        }

        $entry = JournalEntry::query()->create([
            'number' => $this->sequences->next('journal'),
            'entry_date' => $entryDate,
            'source_type' => $source ? $source::class : null,
            'source_id' => $source?->getKey(),
            'purpose' => $purpose,
            'description' => $description,
            'total_debit' => $totalDebit->toString(4),
            'total_credit' => $totalCredit->toString(4),
            'branch_id' => $branchId,
            'accounting_period_id' => $this->periodFor($entryDate)?->id,
            'created_by' => $this->context->userId(),
            'is_posted' => true,
            'posted_at' => now(),
        ]);

        foreach ($prepared as $line) {
            JournalLine::query()->create($line + ['journal_entry_id' => $entry->id]);
        }

        return $entry;
    }

    /** Reverse an entry with an equal, opposite one (never delete or edit). */
    public function reverse(JournalEntry $entry, string $reason): JournalEntry
    {
        $lines = [];
        foreach ($entry->lines as $line) {
            $code = Account::query()->whereKey($line->account_id)->value('code');
            $key = AccountMapping::query()
                ->where('account_id', $line->account_id)
                ->value('key') ?? $code;

            $lines[] = [
                'account' => $key,
                'debit' => Money::of($line->credit),
                'credit' => Money::of($line->debit),
                'memo' => $reason,
            ];
        }

        $reversal = $this->post(
            purpose: $entry->purpose.'_reversal',
            source: null,
            lines: $lines,
            description: 'عكس القيد '.$entry->number.' — '.$reason,
        );

        $reversal?->update(['reverses_entry_id' => $entry->id]);

        return $reversal;
    }

    public function accountId(string $mappingKey): int
    {
        $map = Cache::remember('pos.account_map', 300, fn () => AccountMapping::query()->pluck('account_id', 'key')->all());

        if (! isset($map[$mappingKey])) {
            throw new InvalidOperationException(
                'لا يوجد حساب مرتبط بالمفتاح المحاسبي المطلوب.',
                'account_mapping_missing',
                500,
                ['key' => $mappingKey],
            );
        }

        return (int) $map[$mappingKey];
    }

    public function assertPeriodOpen(string $date): void
    {
        $period = $this->periodFor($date);

        if ($period && $period->status === 'closed') {
            throw new InvalidOperationException(
                'الفترة المحاسبية مقفلة ولا تقبل قيودًا جديدة.',
                'period_closed',
                422,
                ['period' => $period->name],
            );
        }
    }

    private function periodFor(string $date): ?AccountingPeriod
    {
        return AccountingPeriod::query()
            ->where('starts_on', '<=', $date)
            ->where('ends_on', '>=', $date)
            ->first();
    }

    public function flush(): void
    {
        Cache::forget('pos.account_map');
    }
}
