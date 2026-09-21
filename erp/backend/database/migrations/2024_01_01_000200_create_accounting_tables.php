<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * الحسابات: دليل الحسابات، الفترات، القيود، مراكز التكلفة، الخزن والبنوك والشيكات.
 * كل المبالغ NUMERIC(18,4) — لا يُستخدم Float في أي نتيجة مالية.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cost_centers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('cost_centers')->nullOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->string('type', 30)->default('general'); // branch|project|vehicle|region|general
            $t->unsignedBigInteger('ref_id')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('accounts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('accounts')->nullOnDelete();
            $t->string('code', 40);
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            // asset | liability | equity | revenue | expense
            $t->string('type', 20);
            // debit | credit  (الطبيعة)
            $t->string('nature', 10);
            $t->boolean('is_leaf')->default(true);
            $t->boolean('is_active')->default(true);
            // حساب رقابي: customers|suppliers|cash|bank|inventory|custody_cash|tax|none
            $t->string('control_type', 30)->default('none');
            $t->boolean('require_cost_center')->default(false);
            $t->unsignedSmallInteger('level')->default(1);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'control_type']);
        });

        Schema::create('fiscal_years', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('name', 40);
            $t->date('start_date');
            $t->date('end_date');
            $t->string('status', 20)->default('open'); // open|closed
            $t->timestamps();
            $t->unique(['company_id', 'name']);
        });

        Schema::create('fiscal_periods', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('fiscal_year_id')->constrained()->cascadeOnDelete();
            $t->string('name', 40);
            $t->date('start_date');
            $t->date('end_date');
            $t->string('status', 20)->default('open'); // open|closed|locked
            $t->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('closed_at')->nullable();
            $t->text('reopen_reason')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'start_date', 'end_date']);
        });

        Schema::create('journal_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('fiscal_period_id')->nullable()->constrained()->nullOnDelete();
            $t->string('entry_no', 40);
            $t->date('entry_date');
            $t->date('doc_date')->nullable();
            $t->string('source_type', 60)->nullable();   // نوع المستند المصدر
            $t->unsignedBigInteger('source_id')->nullable();
            $t->string('source_no', 60)->nullable();
            $t->string('entry_type', 30)->default('normal'); // normal|reversal|opening|closing|adjustment
            $t->foreignId('reverses_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $t->decimal('total_debit', 18, 4)->default(0);
            $t->decimal('total_credit', 18, 4)->default(0);
            $t->char('currency_code', 3)->default('EGP');
            $t->text('description')->nullable();
            $t->string('status', 20)->default('posted'); // draft|posted|reversed
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'entry_no']);
            // قيد واحد فقط لكل مستند مصدر من نفس النوع (منع الترحيل المزدوج)
            $t->unique(['company_id', 'source_type', 'source_id', 'entry_type'], 'je_source_unique');
            $t->index(['company_id', 'entry_date']);
        });

        Schema::create('journal_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('journal_entry_id')->constrained()->cascadeOnDelete();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('account_id')->constrained()->restrictOnDelete();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('debit', 18, 4)->default(0);
            $t->decimal('credit', 18, 4)->default(0);
            // الطرف المقابل للحسابات الرقابية
            $t->string('partner_type', 30)->nullable(); // customer|supplier|salesman|cash_box|bank|employee
            $t->unsignedBigInteger('partner_id')->nullable();
            $t->date('due_date')->nullable();
            $t->text('description')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'account_id']);
            $t->index(['partner_type', 'partner_id']);
        });

        Schema::create('cash_boxes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('account_id')->constrained()->restrictOnDelete();
            $t->string('code', 30);
            $t->string('name');
            $t->char('currency_code', 3)->default('EGP');
            $t->string('type', 20)->default('company'); // company|custody (عهدة مندوب)
            $t->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('bank_accounts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('account_id')->constrained()->restrictOnDelete();
            $t->string('code', 30);
            $t->string('name');
            $t->string('bank_name')->nullable();
            $t->string('account_number', 60)->nullable();
            $t->string('iban', 60)->nullable();
            $t->char('currency_code', 3)->default('EGP');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('cheques', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('direction', 10); // in | out
            $t->string('cheque_no', 60);
            $t->string('bank_name')->nullable();
            $t->decimal('amount', 18, 4);
            $t->date('issue_date');
            $t->date('due_date');
            $t->string('partner_type', 30)->nullable();
            $t->unsignedBigInteger('partner_id')->nullable();
            $t->foreignId('bank_account_id')->nullable()->constrained()->nullOnDelete();
            // received|deposited|cleared|bounced|returned|cancelled
            $t->string('status', 20)->default('received');
            $t->string('source_type', 60)->nullable();
            $t->unsignedBigInteger('source_id')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'direction', 'cheque_no']);
        });

        Schema::create('cheque_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cheque_id')->constrained()->cascadeOnDelete();
            $t->string('from_status', 20)->nullable();
            $t->string('to_status', 20);
            $t->date('event_date');
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('tax_codes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 30);
            $t->string('name_ar');
            $t->decimal('rate', 9, 6)->default(0);     // نسبة مؤرخة يراجعها المحاسب
            $t->boolean('is_inclusive')->default(false);
            $t->date('valid_from');
            $t->date('valid_to')->nullable();
            $t->foreignId('output_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $t->foreignId('input_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code', 'valid_from']);
        });

        // مصفوفة الترحيل: تعريف الحسابات لكل نوع مستند — يراجعها المحاسب قبل التشغيل
        Schema::create('posting_rules', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('doc_type', 60);
            $t->string('role_key', 60);   // inventory|cogs|revenue|ar|ap|tax_output|...
            $t->foreignId('account_id')->constrained()->restrictOnDelete();
            $t->text('notes')->nullable();
            $t->boolean('is_reviewed')->default(false);
            $t->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reviewed_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'doc_type', 'role_key']);
        });
    }

    public function down(): void
    {
        foreach ([
            'posting_rules', 'tax_codes', 'cheque_events', 'cheques', 'bank_accounts', 'cash_boxes',
            'journal_lines', 'journal_entries', 'fiscal_periods', 'fiscal_years', 'accounts', 'cost_centers',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
