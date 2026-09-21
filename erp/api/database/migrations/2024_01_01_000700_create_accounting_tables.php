<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Double-entry general ledger.
 *
 * Two guarantees are enforced by PostgreSQL itself, not by application code:
 *   1. A posted entry must balance — a DEFERRED constraint trigger checks
 *      debit/credit totals at COMMIT time.
 *   2. One source document produces at most one entry per purpose — a unique
 *      index on (company_id, source_type, source_id, purpose) makes a duplicate
 *      posting impossible even under a retried request.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('accounts')->nullOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->string('name_en')->nullable();
            $t->string('type', 16); // asset|liability|equity|revenue|expense
            $t->string('subtype', 32)->nullable();
            $t->boolean('is_postable')->default(true);
            $t->char('currency_code', 3)->nullable();
            $t->boolean('requires_cost_center')->default(false);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'type']);
        });

        /** Named hooks the posting engine resolves, e.g. "inventory" → 1310. */
        Schema::create('account_mappings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('key', 64);
            $t->foreignId('account_id')->constrained()->restrictOnDelete();
            $t->text('description')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'key']);
        });

        Schema::create('fiscal_years', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 16);
            $t->date('start_date');
            $t->date('end_date');
            $t->string('status', 16)->default('open'); // open|closed
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('fiscal_periods', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('fiscal_year_id')->constrained()->cascadeOnDelete();
            $t->string('code', 16);
            $t->date('start_date');
            $t->date('end_date');
            $t->string('status', 16)->default('open'); // open|closed
            $t->timestamp('closed_at')->nullable();
            $t->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'start_date', 'end_date']);
        });

        Schema::create('journal_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('entry_no', 48);
            $t->date('entry_date');
            $t->foreignId('fiscal_period_id')->nullable()->constrained()->nullOnDelete();
            $t->string('source_type', 48)->nullable();
            $t->unsignedBigInteger('source_id')->nullable();
            $t->string('purpose', 32)->default('main'); // main|cogs|reversal|landed_cost|…
            $t->string('status', 16)->default('posted'); // draft|posted|reversed
            $t->decimal('total_debit', 18, 2)->default(0);
            $t->decimal('total_credit', 18, 2)->default(0);
            $t->text('memo')->nullable();
            $t->foreignId('reversal_of_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['company_id', 'entry_no']);
            $t->index(['company_id', 'entry_date']);
            $t->index(['source_type', 'source_id']);
        });

        DB::statement('CREATE UNIQUE INDEX journal_entries_source_uniq ON journal_entries
            (company_id, source_type, source_id, purpose)
            WHERE source_type IS NOT NULL AND status <> \'reversed\'');

        Schema::create('journal_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('journal_entry_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no')->default(1);
            $t->foreignId('account_id')->constrained()->restrictOnDelete();
            $t->decimal('debit', 18, 2)->default(0);
            $t->decimal('credit', 18, 2)->default(0);
            $t->char('currency_code', 3)->nullable();
            $t->decimal('fx_rate', 18, 8)->default(1);
            $t->decimal('foreign_amount', 18, 2)->nullable();
            $t->string('partner_type', 24)->nullable(); // customer|supplier|user
            $t->unsignedBigInteger('partner_id')->nullable();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $t->text('memo')->nullable();
            $t->timestamps();
            $t->index('journal_entry_id');
            $t->index(['account_id']);
            $t->index(['partner_type', 'partner_id']);
        });

        DB::statement('ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_one_side
            CHECK ((debit >= 0 AND credit >= 0) AND NOT (debit > 0 AND credit > 0))');

        // Deferred balance check: evaluated at COMMIT, after all lines are inserted.
        DB::unprepared(<<<'SQL'
        CREATE OR REPLACE FUNCTION erp_assert_entry_balanced() RETURNS trigger AS $$
        DECLARE
            v_entry_id BIGINT;
            v_debit NUMERIC(18,2);
            v_credit NUMERIC(18,2);
            v_status TEXT;
        BEGIN
            v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

            SELECT status INTO v_status FROM journal_entries WHERE id = v_entry_id;
            IF v_status IS NULL OR v_status = 'draft' THEN
                RETURN NULL;
            END IF;

            SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
              INTO v_debit, v_credit
              FROM journal_lines WHERE journal_entry_id = v_entry_id;

            IF v_debit <> v_credit THEN
                RAISE EXCEPTION
                    'Journal entry % is not balanced: debit=% credit=%',
                    v_entry_id, v_debit, v_credit
                    USING ERRCODE = 'check_violation';
            END IF;

            IF v_debit = 0 THEN
                RAISE EXCEPTION 'Journal entry % has no amounts', v_entry_id
                    USING ERRCODE = 'check_violation';
            END IF;

            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;

        CREATE CONSTRAINT TRIGGER journal_lines_balanced
            AFTER INSERT OR UPDATE OR DELETE ON journal_lines
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION erp_assert_entry_balanced();
        SQL);

        // A posted line may not be mutated in place — corrections go through a reversal.
        DB::unprepared(<<<'SQL'
        CREATE OR REPLACE FUNCTION erp_block_posted_line_edit() RETURNS trigger AS $$
        DECLARE v_status TEXT;
        BEGIN
            SELECT status INTO v_status FROM journal_entries
             WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
            IF v_status = 'posted' AND current_setting('erp.allow_gl_edit', true) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION 'Posted journal lines are immutable; reverse the entry instead'
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER journal_lines_immutable
            BEFORE UPDATE OR DELETE ON journal_lines
            FOR EACH ROW EXECUTE FUNCTION erp_block_posted_line_edit();
        SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS journal_lines_immutable ON journal_lines');
        DB::unprepared('DROP TRIGGER IF EXISTS journal_lines_balanced ON journal_lines');
        DB::unprepared('DROP FUNCTION IF EXISTS erp_block_posted_line_edit()');
        DB::unprepared('DROP FUNCTION IF EXISTS erp_assert_entry_balanced()');
        foreach (['journal_lines', 'journal_entries', 'fiscal_periods', 'fiscal_years',
            'account_mappings', 'accounts'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
