<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cash boxes, banks, collections, payments, custody transfers, expenses and
 * cheques.
 *
 * Money a rep collects lands in THEIR custody account first. It only reaches a
 * company cash box or bank through an approved deposit, and that deposit moves
 * an asset between two accounts — it never creates revenue a second time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_boxes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $t->char('currency_code', 3)->default('EGP');
            $t->unsignedBigInteger('keeper_user_id')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('banks', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->string('branch_name')->nullable();
            $t->string('account_no', 64)->nullable();
            $t->string('iban', 64)->nullable();
            $t->string('swift', 32)->nullable();
            $t->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $t->char('currency_code', 3)->default('EGP');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        /** Per-user cash/cheque custody account, so a rep's holding is a real GL balance. */
        Schema::create('custody_accounts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 16)->default('cash'); // cash|cheque|goods
            $t->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $t->char('currency_code', 3)->default('EGP');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'user_id', 'kind']);
        });

        Schema::create('cheques', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->string('direction', 3); // in|out
            $t->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $t->string('drawer_bank')->nullable();
            $t->string('cheque_no', 64);
            $t->date('issue_date')->nullable();
            $t->date('due_date');
            $t->decimal('amount', 18, 2);
            /** A cheque is not cash until it clears. */
            $t->string('status', 24)->default('received'); // received|deposited|collected|bounced|returned|cancelled
            $t->foreignId('deposit_bank_id')->nullable()->constrained('banks')->nullOnDelete();
            $t->date('deposited_at')->nullable();
            $t->date('cleared_at')->nullable();
            $t->string('bounce_reason')->nullable();
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'status', 'due_date']);
        });

        Schema::create('receipts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 48);
            $t->date('receipt_date');
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('rep_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('method', 16)->default('cash'); // cash|cheque|bank|card
            $t->decimal('amount', 18, 2);
            $t->decimal('allocated_amount', 18, 2)->default(0);
            /** Destination is explicit: rep custody, a cash box, or straight to bank. */
            $t->string('destination', 16)->default('custody'); // custody|cash_box|bank
            $t->foreignId('custody_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('bank_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cheque_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 16)->default('draft'); // draft|posted|cancelled
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->string('source', 16)->default('web');
            $t->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $t->uuid('client_uuid')->nullable();
            $t->string('field_no', 48)->nullable();
            $t->foreignId('visit_id')->nullable();
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'customer_id', 'receipt_date']);
            $t->index(['company_id', 'rep_id', 'receipt_date']);
        });
        DB::statement('CREATE UNIQUE INDEX receipts_client_uuid_uniq ON receipts (company_id, client_uuid) WHERE client_uuid IS NOT NULL');

        /** One receipt can settle several invoices; one invoice can take several receipts. */
        Schema::create('receipt_allocations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('receipt_id')->constrained()->cascadeOnDelete();
            $t->foreignId('sales_invoice_id')->constrained()->restrictOnDelete();
            $t->decimal('amount', 18, 2);
            $t->timestamps();
            $t->index('receipt_id');
            $t->index('sales_invoice_id');
        });

        Schema::create('payments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->date('payment_date');
            $t->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $t->string('method', 16)->default('cash');
            $t->decimal('amount', 18, 2);
            $t->decimal('allocated_amount', 18, 2)->default(0);
            $t->string('source_kind', 16)->default('cash_box'); // cash_box|bank|custody
            $t->unsignedBigInteger('source_id')->nullable();
            $t->foreignId('cheque_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 16)->default('draft');
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('payment_allocations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('payment_id')->constrained()->cascadeOnDelete();
            $t->foreignId('supplier_invoice_id')->constrained()->restrictOnDelete();
            $t->decimal('amount', 18, 2);
            $t->timestamps();
        });

        /** Custody → cash box, cash box → bank, bank → bank. Asset-to-asset only. */
        Schema::create('cash_transfers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->date('transfer_date');
            $t->string('from_kind', 16); // custody|cash_box|bank
            $t->unsignedBigInteger('from_id');
            $t->string('to_kind', 16);   // cash_box|bank
            $t->unsignedBigInteger('to_id');
            $t->decimal('amount', 18, 2);
            $t->string('reference', 64)->nullable();
            $t->string('status', 16)->default('draft'); // draft|pending_approval|posted|cancelled
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'from_kind', 'from_id']);
        });

        Schema::create('expenses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 48);
            $t->date('expense_date');
            $t->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $t->decimal('amount', 18, 2);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->string('paid_from_kind', 16)->default('cash_box'); // cash_box|bank|custody
            $t->unsignedBigInteger('paid_from_id')->nullable();
            $t->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 24)->default('draft'); // draft|pending_approval|approved|posted|rejected
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->string('attachment_path')->nullable();
            $t->boolean('is_recurring')->default(false);
            $t->string('recurrence', 16)->nullable(); // monthly|weekly|yearly
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('description')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'expense_date']);
        });

        Schema::create('bank_reconciliations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('bank_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->date('statement_date');
            $t->decimal('statement_balance', 18, 2);
            $t->decimal('book_balance', 18, 2)->default(0);
            $t->decimal('difference', 18, 2)->default(0);
            $t->string('status', 16)->default('draft'); // draft|completed
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('bank_reconciliation_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('bank_reconciliation_id')->constrained()->cascadeOnDelete();
            $t->foreignId('journal_line_id')->nullable()->constrained()->nullOnDelete();
            $t->date('value_date')->nullable();
            $t->string('description')->nullable();
            $t->decimal('amount', 18, 2)->default(0);
            $t->boolean('is_matched')->default(false);
            $t->timestamps();
        });

        Schema::create('vehicle_maintenances', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('vehicle_id')->constrained()->cascadeOnDelete();
            $t->date('service_date');
            $t->string('kind', 32); // oil|tyres|periodic|repair|license|insurance
            $t->decimal('odometer', 18, 2)->nullable();
            $t->decimal('cost', 18, 2)->default(0);
            $t->foreignId('expense_id')->nullable()->constrained()->nullOnDelete();
            $t->date('next_due_date')->nullable();
            $t->decimal('next_due_odometer', 18, 2)->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'vehicle_id', 'service_date']);
        });
    }

    public function down(): void
    {
        foreach (['vehicle_maintenances', 'bank_reconciliation_lines', 'bank_reconciliations',
            'expenses', 'cash_transfers', 'payment_allocations', 'payments',
            'receipt_allocations', 'receipts', 'cheques', 'custody_accounts',
            'banks', 'cash_boxes'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
