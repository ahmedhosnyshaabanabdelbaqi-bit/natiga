<?php

namespace Tests\Feature\Domain;

use App\Domain\Accounting\LedgerService;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Account;
use App\Models\FiscalPeriod;
use App\Models\JournalEntry;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class LedgerTest extends TestCase
{
    private LedgerService $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ledger = app(LedgerService::class);
    }

    private function accountId(string $code): int
    {
        return Account::where('code', $code)->value('id');
    }

    #[Test]
    public function a_balanced_entry_posts_with_its_lines(): void
    {
        $entry = DB::transaction(function () {
            $draft = $this->ledger->draftFor('test_doc', 1, now()->toDateString(), 'اختبار');
            $draft->debit($this->accountId('1200'), '1000.00');
            $draft->credit($this->accountId('4100'), '1000.00');

            return $this->ledger->post($draft);
        });

        $this->assertSame('posted', $entry->status);
        $this->assertCount(2, $entry->lines);
        $this->assertTrue($entry->isBalanced());
    }

    #[Test]
    public function an_unbalanced_entry_is_refused_before_it_reaches_the_database(): void
    {
        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/غير متوازن/');

        DB::transaction(function () {
            $draft = $this->ledger->draftFor('test_doc', 2, now()->toDateString());
            $draft->debit($this->accountId('1200'), '1000.00');
            $draft->credit($this->accountId('4100'), '999.99');

            $this->ledger->post($draft);
        });

        $this->assertDatabaseCount('journal_entries', 0);
    }

    #[Test]
    public function the_database_itself_rejects_an_unbalanced_posted_entry(): void
    {
        // Belt and braces: even if the application guard were bypassed, the
        // constraint trigger rejects the entry.
        //
        // The trigger is DEFERRED so that a normal posting can insert its lines
        // one at a time. A deferred trigger fires at the outermost COMMIT, which
        // never arrives inside a test wrapped by RefreshDatabase — so the
        // constraint is switched to IMMEDIATE here to make it fire at the
        // statement. That is the same check, evaluated earlier.
        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::transaction(function () {
            DB::statement('SET CONSTRAINTS journal_lines_balanced IMMEDIATE');

            $entry = JournalEntry::create([
                'company_id' => $this->company->id,
                'entry_no' => 'RAW-1',
                'entry_date' => now()->toDateString(),
                'status' => 'posted',
                'total_debit' => '100.00',
                'total_credit' => '100.00',
            ]);

            DB::table('journal_lines')->insert([
                'journal_entry_id' => $entry->id, 'line_no' => 1,
                'account_id' => $this->accountId('1200'),
                'debit' => 100, 'credit' => 0, 'fx_rate' => 1,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            // Deliberately no matching credit line.
        });
    }

    #[Test]
    public function one_document_cannot_be_posted_twice(): void
    {
        $post = fn () => DB::transaction(function () {
            $draft = $this->ledger->draftFor('sales_invoice', 99, now()->toDateString());
            $draft->debit($this->accountId('1200'), '500.00');
            $draft->credit($this->accountId('4100'), '500.00');

            return $this->ledger->post($draft);
        });

        $first = $post();
        $second = $post();   // a retried request, e.g. after a lost response

        $this->assertSame($first->id, $second->id, 'A replay must return the original entry');
        $this->assertSame(1, JournalEntry::where('source_type', 'sales_invoice')
            ->where('source_id', 99)->count());
    }

    #[Test]
    public function a_posted_line_cannot_be_edited_in_place(): void
    {
        $entry = DB::transaction(function () {
            $draft = $this->ledger->draftFor('test_doc', 3, now()->toDateString());
            $draft->debit($this->accountId('1200'), '100.00');
            $draft->credit($this->accountId('4100'), '100.00');

            return $this->ledger->post($draft);
        });

        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::table('journal_lines')
            ->where('journal_entry_id', $entry->id)
            ->limit(1)
            ->update(['debit' => 999]);
    }

    #[Test]
    public function reversing_keeps_both_entries_on_the_books_and_nets_to_zero(): void
    {
        $entry = DB::transaction(function () {
            $draft = $this->ledger->draftFor('test_doc', 4, now()->toDateString());
            $draft->debit($this->accountId('1200'), '250.00');
            $draft->credit($this->accountId('4100'), '250.00');

            return $this->ledger->post($draft);
        });

        $reversal = DB::transaction(fn () => $this->ledger->reverse($entry, now()->toDateString(), 'خطأ'));

        // The original is NOT hidden — it stays posted and stays in the balance.
        // Hiding it would leave only the reversal and misstate the account.
        $this->assertSame('posted', $entry->fresh()->status);
        $this->assertTrue($entry->fresh()->isReversed());
        $this->assertSame($entry->id, $reversal->reversal_of_id);
        $this->assertSame($reversal->id, $entry->fresh()->reversed_by_id);

        $net = Account::find($this->accountId('4100'))->balance();
        $this->assertSame(0, Num::cmp($net, '0'), 'The pair must net to nothing');
    }

    #[Test]
    public function reversing_frees_the_source_slot_for_a_corrected_posting(): void
    {
        $post = fn () => DB::transaction(function () {
            $draft = $this->ledger->draftFor('sales_invoice', 77, now()->toDateString());
            $draft->debit($this->accountId('1200'), '300.00');
            $draft->credit($this->accountId('4100'), '300.00');

            return $this->ledger->post($draft);
        });

        $original = $post();
        DB::transaction(fn () => $this->ledger->reverse($original, now()->toDateString(), 'تصحيح'));

        $corrected = $post();

        $this->assertNotSame($original->id, $corrected->id,
            'After a reversal the document may be posted afresh');
        $this->assertSame(3, JournalEntry::where('source_id', 77)->count(),
            'Original, reversal and correction all remain in the ledger');
    }

    #[Test]
    public function an_entry_cannot_be_reversed_twice(): void
    {
        $entry = DB::transaction(function () {
            $draft = $this->ledger->draftFor('test_doc', 8, now()->toDateString());
            $draft->debit($this->accountId('1200'), '50.00');
            $draft->credit($this->accountId('4100'), '50.00');

            return $this->ledger->post($draft);
        });

        DB::transaction(fn () => $this->ledger->reverse($entry));

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/معكوس بالفعل/');

        DB::transaction(fn () => $this->ledger->reverse($entry->fresh()));
    }

    #[Test]
    public function posting_into_a_closed_period_is_refused(): void
    {
        FiscalPeriod::query()
            ->where('start_date', '<=', now()->toDateString())
            ->where('end_date', '>=', now()->toDateString())
            ->update(['status' => 'closed']);

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/مقفلة/');

        DB::transaction(function () {
            $draft = $this->ledger->draftFor('test_doc', 5, now()->toDateString());
            $draft->debit($this->accountId('1200'), '10.00');
            $draft->credit($this->accountId('4100'), '10.00');

            $this->ledger->post($draft);
        });
    }

    #[Test]
    public function posting_to_a_non_postable_header_account_is_refused(): void
    {
        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/غير قابلة للترحيل/');

        DB::transaction(function () {
            $draft = $this->ledger->draftFor('test_doc', 6, now()->toDateString());
            $draft->debit($this->accountId('1'), '10.00');   // "الأصول" — a header
            $draft->credit($this->accountId('4100'), '10.00');

            $this->ledger->post($draft);
        });
    }

    #[Test]
    public function a_missing_account_mapping_blocks_posting_with_a_clear_message(): void
    {
        DB::table('account_mappings')->where('key', 'cogs')->delete();
        $this->ledger->accounts()->flushCache();

        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/مصفوفة الترحيل/');

        $this->ledger->accounts()->key('cogs');
    }

    #[Test]
    public function the_signed_helper_flips_sides_for_a_negative_amount(): void
    {
        $entry = DB::transaction(function () {
            $draft = $this->ledger->draftFor('test_doc', 7, now()->toDateString());
            // A negative "debit" is really a credit — used by reversals and
            // variance postings so callers avoid sign gymnastics.
            $draft->signed($this->accountId('1310'), '-75.00', 'debit');
            $draft->debit($this->accountId('5100'), '75.00');

            return $this->ledger->post($draft);
        });

        $inventoryLine = $entry->lines->firstWhere('account_id', $this->accountId('1310'));

        $this->assertSame(0, Num::cmp($inventoryLine->credit, '75.00'));
        $this->assertSame(0, Num::cmp($inventoryLine->debit, '0'));
    }
}
