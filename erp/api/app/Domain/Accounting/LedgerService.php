<?php

namespace App\Domain\Accounting;

use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\FiscalPeriod;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * The only writer of journal_entries and journal_lines.
 *
 * Three rules it enforces, in this order:
 *   1. The draft must balance (checked in PHP before any write, so the error is
 *      readable; the database trigger is the backstop).
 *   2. The entry date must fall in an open fiscal period.
 *   3. One source document produces at most one entry per purpose. A retried
 *      post returns the existing entry instead of creating a second one.
 */
class LedgerService
{
    public function __construct(
        private readonly AccountResolver $accounts,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * Post a draft. Must run inside the caller's transaction so the document,
     * its stock movements and its entry commit or roll back together.
     */
    public function post(JournalDraft $draft, ?int $postedBy = null): JournalEntry
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('LedgerService::post must run inside a database transaction.');
        }

        if ($draft->isEmpty()) {
            throw DomainException::make('gl.empty_entry',
                'لا يمكن ترحيل قيد بدون سطور.',
                ['source_type' => $draft->sourceType, 'source_id' => $draft->sourceId]);
        }

        $draft->assertBalanced();

        if ($existing = $this->existingEntry($draft->sourceType, $draft->sourceId, $draft->purpose)) {
            return $existing;
        }

        $period = $this->openPeriodFor($draft->entryDate);
        $this->assertAccountsPostable($draft);

        $entry = JournalEntry::create([
            'company_id' => CompanyContext::idOrFail(),
            'entry_no' => $this->numbering->next('journal_entry', null, new \DateTimeImmutable($draft->entryDate)),
            'entry_date' => $draft->entryDate,
            'fiscal_period_id' => $period?->id,
            'source_type' => $draft->sourceType,
            'source_id' => $draft->sourceId,
            'purpose' => $draft->purpose,
            'status' => 'posted',
            'total_debit' => $draft->totalDebit(),
            'total_credit' => $draft->totalCredit(),
            'memo' => $draft->memo,
            'posted_at' => now(),
            'posted_by' => $postedBy ?? auth()->id(),
        ]);

        $lineNo = 1;
        foreach ($draft->lines() as $line) {
            JournalLine::create([
                'journal_entry_id' => $entry->id,
                'line_no' => $lineNo++,
                'account_id' => $line['account_id'],
                'debit' => $line['debit'],
                'credit' => $line['credit'],
                'memo' => $line['memo'],
                'partner_type' => $line['partner_type'],
                'partner_id' => $line['partner_id'],
                'cost_center_id' => $line['cost_center_id'],
            ]);
        }

        return $entry->load('lines');
    }

    /**
     * Reverse a posted entry with a mirror entry on a given date.
     *
     * The original is never edited or deleted — it stays in the ledger and is
     * marked as reversed, which is what an audit trail requires.
     */
    public function reverse(JournalEntry $entry, ?string $date = null, ?string $memo = null): JournalEntry
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('LedgerService::reverse must run inside a database transaction.');
        }

        if ($entry->status !== 'posted') {
            throw DomainException::make('gl.not_reversible',
                'لا يمكن عكس قيد غير مرحّل.', ['entry_id' => $entry->id, 'status' => $entry->status]);
        }

        if ($entry->reversed_by_id) {
            throw DomainException::make('gl.already_reversed',
                "القيد {$entry->entry_no} معكوس بالفعل.",
                ['entry_id' => $entry->id, 'reversal_id' => $entry->reversed_by_id]);
        }

        $date ??= now()->toDateString();
        $this->openPeriodFor($date);

        $draft = new JournalDraft(
            sourceType: $entry->source_type ?? 'journal_entry',
            sourceId: $entry->source_id ?? $entry->id,
            entryDate: $date,
            memo: $memo ?? "عكس القيد {$entry->entry_no}",
            purpose: 'reversal:'.$entry->id,
        );

        foreach ($entry->lines as $line) {
            if (Num::isPositive($line->debit, Num::MONEY_SCALE)) {
                $draft->credit($line->account_id, $line->debit, $line->memo,
                    $line->partner_type, $line->partner_id, $line->cost_center_id);
            } else {
                $draft->debit($line->account_id, $line->credit, $line->memo,
                    $line->partner_type, $line->partner_id, $line->cost_center_id);
            }
        }

        $reversal = $this->post($draft);
        $reversal->forceFill(['reversal_of_id' => $entry->id])->save();

        /**
         * The original stays 'posted'. Both entries remain in every balance
         * query and net to zero, which is what reversal means in double entry —
         * hiding the original would leave only the reversal and misstate the
         * account. Pointing reversed_by_id at the reversal frees the
         * source-uniqueness slot so a corrected document can be posted.
         */
        $entry->forceFill(['reversed_by_id' => $reversal->id])->save();

        return $reversal;
    }

    /** The entry already posted for this document, if any. */
    public function existingEntry(string $sourceType, int $sourceId, string $purpose = 'main'): ?JournalEntry
    {
        return JournalEntry::query()
            ->where('source_type', $sourceType)
            ->where('source_id', $sourceId)
            ->where('purpose', $purpose)
            ->whereNull('reversed_by_id')
            ->first();
    }

    public function draftFor(
        string $sourceType,
        int $sourceId,
        string $entryDate,
        string $memo = '',
        string $purpose = 'main',
    ): JournalDraft {
        return new JournalDraft($sourceType, $sourceId, $entryDate, $memo, $purpose);
    }

    public function accounts(): AccountResolver
    {
        return $this->accounts;
    }

    /**
     * Fiscal period guard.
     *
     * A company with no periods defined at all is allowed to post — that is the
     * state a fresh install is in. But an entry dated inside a period that has
     * been closed is refused.
     */
    protected function openPeriodFor(string $date): ?FiscalPeriod
    {
        $period = FiscalPeriod::query()
            ->where('start_date', '<=', $date)
            ->where('end_date', '>=', $date)
            ->first();

        if ($period && $period->status !== 'open') {
            throw DomainException::make('gl.period_closed',
                "الفترة المالية «{$period->code}» مقفلة ولا يمكن الترحيل فيها بتاريخ {$date}.",
                ['period' => $period->code, 'date' => $date]);
        }

        if (! $period && FiscalPeriod::query()->exists()) {
            throw DomainException::make('gl.no_period',
                "لا توجد فترة مالية تغطي التاريخ {$date}.", ['date' => $date]);
        }

        return $period;
    }

    protected function assertAccountsPostable(JournalDraft $draft): void
    {
        $ids = collect($draft->lines())->pluck('account_id')->unique()->values();

        $bad = DB::table('accounts')
            ->whereIn('id', $ids)
            ->where(fn ($q) => $q->where('is_postable', false)->orWhere('is_active', false))
            ->pluck('code');

        if ($bad->isNotEmpty()) {
            throw DomainException::make('gl.account_not_postable',
                'حسابات غير قابلة للترحيل: '.$bad->implode('، '),
                ['accounts' => $bad->all()]);
        }
    }
}
