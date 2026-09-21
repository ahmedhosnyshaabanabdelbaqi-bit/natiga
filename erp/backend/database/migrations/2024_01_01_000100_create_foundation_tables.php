<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * الأساس: الشركات والفروع والمستخدمون والصلاحيات والإعدادات وترقيم المستندات وسجل المراجعة.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $t) {
            $t->id();
            $t->string('code', 30)->unique();
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            $t->string('legal_name')->nullable();
            $t->string('tax_number', 50)->nullable();
            $t->string('commercial_register', 50)->nullable();
            $t->string('logo_path')->nullable();
            $t->string('phone', 50)->nullable();
            $t->string('email')->nullable();
            $t->text('address')->nullable();
            $t->char('currency_code', 3)->default('EGP');
            $t->string('timezone', 64)->default('Africa/Cairo');
            $t->string('locale', 8)->default('ar');
            // طريقة تقييم المخزون المعتمدة. FIFO غير مفعّل حتى تنفيذه واختباره.
            $t->string('cost_method', 20)->default('moving_average');
            $t->unsignedTinyInteger('money_scale')->default(2);
            $t->unsignedTinyInteger('qty_scale')->default(3);
            $t->jsonb('settings')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('branches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 30);
            $t->string('name');
            $t->string('phone', 50)->nullable();
            $t->text('address')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('name');
            $t->string('username', 60)->unique();
            $t->string('email')->nullable()->unique();
            $t->string('phone', 50)->nullable();
            $t->timestamp('email_verified_at')->nullable();
            $t->string('password');
            $t->boolean('is_active')->default(true);
            $t->boolean('must_change_password')->default(false);
            $t->boolean('is_super_admin')->default(false);
            $t->string('locale', 8)->default('ar');
            $t->string('mfa_secret')->nullable();
            $t->boolean('mfa_enabled')->default(false);
            $t->timestamp('last_login_at')->nullable();
            $t->rememberToken();
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('password_reset_tokens', function (Blueprint $t) {
            $t->string('email')->primary();
            $t->string('token');
            $t->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->foreignId('user_id')->nullable()->index();
            $t->string('ip_address', 45)->nullable();
            $t->text('user_agent')->nullable();
            $t->longText('payload');
            $t->integer('last_activity')->index();
        });

        Schema::create('permissions', function (Blueprint $t) {
            $t->id();
            $t->string('code', 100)->unique();     // مثال: sales.invoice.post
            $t->string('module', 50);
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            $t->boolean('is_sensitive')->default(false);
            $t->timestamps();
        });

        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('code', 60);
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            $t->boolean('is_system')->default(false);
            $t->text('description')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('permission_role', function (Blueprint $t) {
            $t->id();
            $t->foreignId('role_id')->constrained()->cascadeOnDelete();
            $t->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $t->unique(['role_id', 'permission_id']);
        });

        Schema::create('role_user', function (Blueprint $t) {
            $t->id();
            $t->foreignId('role_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->unique(['role_id', 'user_id']);
        });

        // نطاق الوصول على مستوى السجل: فرع / مخزن / منطقة
        Schema::create('user_scopes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('scope_type', 30);   // branch | warehouse | region | cash_box
            $t->unsignedBigInteger('scope_id');
            $t->timestamps();
            $t->unique(['user_id', 'scope_type', 'scope_id']);
        });

        Schema::create('settings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('key', 120);
            $t->jsonb('value')->nullable();
            $t->string('group', 60)->default('general');
            $t->text('description')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'key']);
        });

        Schema::create('document_sequences', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('doc_type', 50);
            $t->string('prefix', 20)->default('');
            $t->unsignedBigInteger('next_no')->default(1);
            $t->unsignedTinyInteger('padding')->default(6);
            $t->string('reset_period', 20)->default('never'); // never|yearly|monthly
            $t->string('period_key', 20)->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'branch_id', 'doc_type']);
        });

        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('user_label')->nullable();  // يبقى حتى لو حُذف المستخدم
            $t->string('action', 60);              // create|update|post|unpost|approve|export|login|reopen
            $t->string('entity_type', 80);
            $t->unsignedBigInteger('entity_id')->nullable();
            $t->string('entity_no', 60)->nullable();
            $t->jsonb('before')->nullable();
            $t->jsonb('after')->nullable();
            $t->text('reason')->nullable();
            $t->string('ip_address', 45)->nullable();
            $t->string('user_agent', 500)->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['entity_type', 'entity_id']);
            $t->index(['company_id', 'created_at']);
        });

        Schema::create('attachments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('entity_type', 80);
            $t->unsignedBigInteger('entity_id');
            $t->string('disk', 30)->default('local');
            $t->string('path');
            $t->string('original_name');
            $t->string('mime_type', 120)->nullable();
            $t->unsignedBigInteger('size_bytes')->default(0);
            $t->string('sha256', 64)->nullable();
            $t->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['entity_type', 'entity_id']);
        });
    }

    public function down(): void
    {
        foreach ([
            'attachments', 'audit_logs', 'document_sequences', 'settings', 'user_scopes',
            'role_user', 'permission_role', 'roles', 'permissions',
            'sessions', 'password_reset_tokens', 'users', 'branches', 'companies',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
