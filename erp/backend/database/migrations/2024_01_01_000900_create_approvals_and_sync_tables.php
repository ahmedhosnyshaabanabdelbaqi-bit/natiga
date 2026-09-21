<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * الموافقات متعددة المستويات، الأجهزة والمزامنة والحصص الأوفلاين، والتكاملات.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_rules', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 60);
            $t->string('name');
            $t->string('doc_type', 60);   // sales_order|stock_adjustment|expense|credit_override|...
            $t->decimal('min_amount', 18, 4)->default(0);
            $t->decimal('max_amount', 18, 4)->nullable();
            $t->jsonb('conditions')->nullable();
            // يمنع أن يعتمد المنشئ عمليته الحساسة
            $t->boolean('require_different_approver')->default(true);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'doc_type']);
        });

        Schema::create('approval_rule_steps', function (Blueprint $t) {
            $t->id();
            $t->foreignId('approval_rule_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('step_no');
            $t->foreignId('role_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('permission_code', 100)->nullable();
            $t->timestamps();
            $t->unique(['approval_rule_id', 'step_no']);
        });

        Schema::create('approval_requests', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('approval_rule_id')->nullable()->constrained()->nullOnDelete();
            $t->string('doc_type', 60);
            $t->unsignedBigInteger('doc_id');
            $t->string('doc_no', 60)->nullable();
            $t->decimal('amount', 18, 4)->default(0);
            // pending | approved | rejected | cancelled
            $t->string('status', 20)->default('pending');
            $t->unsignedSmallInteger('current_step')->default(1);
            $t->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('request_reason')->nullable();
            $t->timestamp('resolved_at')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'status']);
            $t->unique(['company_id', 'doc_type', 'doc_id']);
        });

        Schema::create('approval_steps', function (Blueprint $t) {
            $t->id();
            $t->foreignId('approval_request_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('step_no');
            $t->foreignId('approver_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('status', 20)->default('pending'); // pending|approved|rejected|skipped
            $t->text('comment')->nullable();
            $t->timestamp('acted_at')->nullable();
            $t->timestamps();
            $t->unique(['approval_request_id', 'step_no']);
        });

        Schema::create('devices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->string('device_uid', 100);
            $t->string('label')->nullable();
            $t->string('platform', 30)->default('android');
            $t->string('app_version', 30)->nullable();
            $t->boolean('is_active')->default(true);
            $t->text('deactivation_reason')->nullable();
            // تفويض العمل دون اتصال: محدود المدة
            $t->timestamp('offline_authorized_until')->nullable();
            $t->unsignedInteger('offline_max_ops')->default(200);
            $t->timestamp('last_sync_at')->nullable();
            $t->unsignedBigInteger('last_server_seq')->default(0);
            $t->string('push_token')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'device_uid']);
        });

        Schema::create('sync_operations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->constrained()->cascadeOnDelete();
            $t->uuid('operation_uuid');
            // مفتاح عدم التكرار — إعادة الإرسال لا تنشئ مستندًا ثانيًا
            $t->string('idempotency_key', 120);
            $t->unsignedBigInteger('device_seq');
            $t->string('op_type', 60);   // sales_invoice|customer_receipt|sales_return|visit|expense|...
            $t->jsonb('payload');
            $t->string('payload_hash', 64)->nullable();
            // received | processing | applied | rejected | conflict | superseded
            $t->string('status', 20)->default('received');
            $t->string('server_doc_type', 60)->nullable();
            $t->unsignedBigInteger('server_doc_id')->nullable();
            $t->string('server_doc_no', 60)->nullable();
            $t->text('error_code')->nullable();
            $t->text('error_message')->nullable();
            $t->jsonb('conflict_details')->nullable();
            $t->unsignedSmallInteger('attempts')->default(0);
            $t->timestamp('received_at')->useCurrent();
            $t->timestamp('processed_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'idempotency_key']);
            $t->unique(['company_id', 'operation_uuid']);
            $t->index(['device_id', 'status']);
        });

        // حصة مخزون مخصصة لجهاز لا يستطيع جهاز آخر إنفاقها
        Schema::create('offline_stock_quotas', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->constrained()->cascadeOnDelete();
            $t->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->decimal('qty_base', 20, 6);
            $t->decimal('consumed_qty_base', 20, 6)->default(0);
            $t->timestamp('expires_at')->nullable();
            $t->string('status', 20)->default('active'); // active|expired|released
            $t->timestamps();
            $t->unique(['device_id', 'warehouse_id', 'item_id']);
        });

        // حصة ائتمان محجوزة للعميل على جهاز محدد، تُحتسب ضمن التعرض المركزي
        Schema::create('offline_credit_quotas', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->decimal('amount', 18, 4);
            $t->decimal('consumed_amount', 18, 4)->default(0);
            $t->timestamp('expires_at')->nullable();
            $t->string('status', 20)->default('active');
            $t->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['device_id', 'customer_id']);
        });

        // إصدار الأسعار المسلّم للجهاز
        Schema::create('price_snapshots', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('price_list_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('version');
            $t->string('hash', 64);
            $t->timestamp('effective_at');
            $t->timestamp('expires_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'price_list_id', 'version']);
        });

        Schema::create('integration_settings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            // sms|email|whatsapp|maps|payment_gateway|etax|ereceipt|b2b_portal
            $t->string('provider', 40);
            $t->boolean('is_enabled')->default(false);
            $t->boolean('is_configured')->default(false);
            // المفاتيح الحساسة تُقرأ من متغيرات البيئة عبر هذه الأسماء، ولا تُخزَّن هنا
            $t->jsonb('config')->nullable();
            $t->jsonb('secret_env_keys')->nullable();
            $t->timestamp('last_health_check_at')->nullable();
            $t->string('last_health_status', 30)->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'provider']);
        });

        Schema::create('import_batches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('batch_no', 40);
            $t->string('entity_type', 60); // customers|suppliers|items|prices|opening_stock|opening_balances
            $t->string('file_name');
            $t->string('file_hash', 64)->nullable();  // يمنع الاستيراد المكرر بصمت
            // uploaded | previewed | validated | applied | failed | cancelled
            $t->string('status', 20)->default('uploaded');
            $t->unsignedInteger('total_rows')->default(0);
            $t->unsignedInteger('valid_rows')->default(0);
            $t->unsignedInteger('error_rows')->default(0);
            $t->unsignedInteger('applied_rows')->default(0);
            $t->jsonb('errors')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('applied_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'batch_no']);
            $t->unique(['company_id', 'entity_type', 'file_hash']);
        });

        Schema::create('report_jobs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('report_key', 60);
            $t->jsonb('filters')->nullable();
            $t->string('format', 10)->default('xlsx'); // xlsx|pdf|csv
            $t->string('status', 20)->default('queued'); // queued|running|done|failed
            $t->unsignedTinyInteger('progress')->default(0);
            $t->string('file_path')->nullable();
            $t->string('download_token', 64)->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->text('error')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'user_id', 'status']);
        });

        Schema::create('notifications_outbox', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('channel', 20);  // sms|email|whatsapp|push
            $t->string('recipient', 190);
            $t->string('subject')->nullable();
            $t->text('body');
            $t->jsonb('meta')->nullable();
            $t->string('status', 20)->default('queued'); // queued|sent|failed|skipped_not_configured
            $t->unsignedSmallInteger('attempts')->default(0);
            $t->text('last_error')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->timestamps();
        });

        // مركز الاستثناءات — إشارات للمراجعة وليست اتهامات
        Schema::create('exception_signals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            // low_margin|repeated_discount|high_returns|late_deposit|bank_change|count_variance
            $t->string('signal_type', 40);
            $t->string('severity', 20)->default('info'); // info|warning|high
            $t->string('subject_type', 40)->nullable();
            $t->unsignedBigInteger('subject_id')->nullable();
            $t->string('source_type', 60)->nullable();
            $t->unsignedBigInteger('source_id')->nullable();
            $t->date('signal_date');
            $t->decimal('metric_value', 18, 4)->nullable();
            $t->decimal('threshold_value', 18, 4)->nullable();
            $t->text('description')->nullable();
            // open | under_review | dismissed | actioned
            $t->string('status', 20)->default('open');
            $t->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('review_note')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'signal_type', 'status']);
        });

        Schema::create('backup_runs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $t->string('kind', 20)->default('full');
            $t->string('status', 20)->default('running'); // running|success|failed
            $t->string('file_path')->nullable();
            $t->unsignedBigInteger('size_bytes')->nullable();
            $t->string('sha256', 64)->nullable();
            $t->boolean('is_encrypted')->default(true);
            $t->boolean('offsite_copied')->default(false);
            // اختبار الاستعادة الفعلي — وجود الملف ليس دليلًا على نجاح الاستعادة
            $t->timestamp('restore_tested_at')->nullable();
            $t->string('restore_test_result', 20)->nullable();
            $t->text('error')->nullable();
            $t->timestamp('started_at')->nullable();
            $t->timestamp('finished_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach ([
            'backup_runs', 'exception_signals', 'notifications_outbox', 'report_jobs', 'import_batches',
            'integration_settings', 'price_snapshots', 'offline_credit_quotas', 'offline_stock_quotas',
            'sync_operations', 'devices', 'approval_steps', 'approval_requests',
            'approval_rule_steps', 'approval_rules',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
