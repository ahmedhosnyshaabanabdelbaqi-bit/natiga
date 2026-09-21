<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Offline sync, targets and commissions, integrations, and import/export jobs.
 *
 * Sync contract: the device sends OPERATIONS, never results. Each operation has
 * a client-generated UUID and an idempotency key that is unique per company.
 * Re-sending after a lost response returns the original receipt instead of
 * creating a second document.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_operations', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('idempotency_key', 128);
            $t->unsignedBigInteger('client_seq');
            $t->string('op_type', 48); // sales_order.create|sales_invoice.create|receipt.create|…
            $t->jsonb('payload');
            $t->uuid('depends_on')->nullable();  // ordering that does not rely on arrival order
            $t->string('status', 16)->default('pending'); // pending|applied|rejected|conflict
            $t->string('server_doc_type', 48)->nullable();
            $t->unsignedBigInteger('server_doc_id')->nullable();
            $t->string('server_doc_code', 48)->nullable();
            $t->string('error_code', 64)->nullable();
            $t->text('error_message')->nullable();
            $t->unsignedSmallInteger('attempts')->default(0);
            $t->timestamp('client_created_at')->nullable();
            $t->timestamp('received_at')->useCurrent();
            $t->timestamp('processed_at')->nullable();
            $t->string('app_version', 24)->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'idempotency_key']);
            $t->index(['company_id', 'device_id', 'client_seq']);
            $t->index(['company_id', 'status']);
        });

        Schema::create('sync_conflicts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->uuid('sync_operation_id');
            $t->string('kind', 48); // stock_shortage|credit_exceeded|price_version|balance_mismatch
            $t->jsonb('details')->default('{}');
            $t->string('status', 16)->default('open'); // open|resolved|dismissed
            $t->string('resolution', 48)->nullable();
            $t->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('resolved_at')->nullable();
            $t->text('note')->nullable();
            $t->timestamps();
            $t->foreign('sync_operation_id')->references('id')->on('sync_operations')->cascadeOnDelete();
            $t->index(['company_id', 'status']);
        });

        /**
         * A credit slice carved out for one device. It counts inside the customer's
         * central exposure and is invisible to every other device until it expires
         * or is consumed — so two reps cannot spend the same credit headroom.
         */
        Schema::create('credit_reservations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('rep_id')->constrained('users')->cascadeOnDelete();
            $t->decimal('amount', 18, 2);
            $t->decimal('consumed_amount', 18, 2)->default(0);
            $t->timestamp('expires_at');
            $t->string('status', 16)->default('active'); // active|consumed|released|expired
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['company_id', 'customer_id', 'status']);
            $t->index(['company_id', 'device_id', 'status']);
        });

        /** Time- and value-bounded authority to sell offline from a given device. */
        Schema::create('offline_grants', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->constrained()->cascadeOnDelete();
            $t->foreignId('rep_id')->constrained('users')->cascadeOnDelete();
            $t->timestamp('valid_from');
            $t->timestamp('valid_to');
            $t->decimal('max_doc_value', 18, 2)->default(0);
            $t->decimal('max_daily_value', 18, 2)->default(0);
            $t->boolean('allow_credit_sales')->default(false);
            $t->unsignedBigInteger('price_version')->default(0);
            $t->string('status', 16)->default('active'); // active|revoked|expired
            $t->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['company_id', 'device_id', 'status']);
        });

        Schema::create('targets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('subject_type', 24); // rep|supervisor|region|branch
            $t->unsignedBigInteger('subject_id');
            $t->date('period_from');
            $t->date('period_to');
            $t->string('metric', 32); // value|qty|profit|collection|active_customers|productive_visits
            $t->decimal('target_value', 18, 2);
            $t->jsonb('scope')->default('{}'); // item/category/brand filters
            $t->timestamps();
            $t->index(['company_id', 'subject_type', 'subject_id', 'period_from']);
        });

        Schema::create('commission_rules', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->unsignedSmallInteger('version')->default(1);
            $t->string('role_scope', 24)->default('sales'); // sales|collector|delivery|supervisor
            $t->string('basis', 32)->default('net_sales');  // net_sales|collections|realized_profit
            $t->decimal('split_pct', 9, 4)->default(100);   // share of the commission for this scope
            $t->jsonb('conditions')->default('{}');
            $t->date('valid_from');
            $t->date('valid_to')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code', 'version']);
        });

        Schema::create('commission_rule_tiers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('commission_rule_id')->constrained()->cascadeOnDelete();
            $t->decimal('from_value', 18, 2)->default(0);
            $t->decimal('to_value', 18, 2)->nullable();
            $t->decimal('percent', 9, 4)->default(0);
            $t->decimal('fixed_amount', 18, 2)->default(0);
            $t->decimal('min_margin_pct', 9, 4)->nullable();
            $t->timestamps();
        });

        Schema::create('commission_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('commission_rule_id')->nullable()->constrained()->nullOnDelete();
            $t->unsignedSmallInteger('rule_version')->default(1);
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('role_scope', 24)->default('sales');
            $t->date('period_from');
            $t->date('period_to');
            $t->string('source_type', 48)->nullable();
            $t->unsignedBigInteger('source_id')->nullable();
            $t->decimal('basis_amount', 18, 2)->default(0);
            $t->decimal('percent', 9, 4)->default(0);
            $t->decimal('amount', 18, 2)->default(0);
            /** Estimated ≠ due. Due only once the basis is realised (e.g. collected). */
            $t->string('status', 16)->default('estimated'); // estimated|due|paid|cancelled
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->boolean('is_settlement')->default(false);
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'user_id', 'period_from']);
            $t->index(['source_type', 'source_id']);
        });

        Schema::create('integration_settings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('provider', 48); // sms|email|whatsapp|maps|payment|eta_einvoice|…
            $t->jsonb('config')->default('{}');   // secrets live in env, never here
            $t->boolean('is_enabled')->default(false);
            $t->string('status', 24)->default('not_configured'); // not_configured|configured|healthy|failing
            $t->timestamp('last_checked_at')->nullable();
            $t->text('last_error')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'provider']);
        });

        Schema::create('import_jobs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 48); // customers|suppliers|items|prices|opening_stock|opening_balances
            $t->string('file_path');
            $t->string('status', 16)->default('pending'); // pending|validating|previewed|importing|done|failed
            $t->unsignedInteger('total_rows')->default(0);
            $t->unsignedInteger('ok_rows')->default(0);
            $t->unsignedInteger('error_rows')->default(0);
            $t->jsonb('preview')->nullable();
            $t->string('report_path')->nullable();
            $t->string('content_hash', 64)->nullable(); // blocks a silent second import
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['company_id', 'kind', 'status']);
        });

        Schema::create('export_jobs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('report_key', 64);
            $t->jsonb('params')->default('{}');
            $t->string('format', 8)->default('xlsx'); // xlsx|pdf|csv
            $t->string('status', 16)->default('queued'); // queued|running|done|failed
            $t->unsignedTinyInteger('progress')->default(0);
            $t->string('file_path')->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->text('error')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['company_id', 'created_by', 'status']);
        });
    }

    public function down(): void
    {
        foreach (['export_jobs', 'import_jobs', 'integration_settings', 'commission_entries',
            'commission_rule_tiers', 'commission_rules', 'targets', 'offline_grants',
            'credit_reservations', 'sync_conflicts', 'sync_operations'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
