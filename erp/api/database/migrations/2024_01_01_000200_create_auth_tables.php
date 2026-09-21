<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Users, roles, granular permissions, record-level scopes, devices, approvals
 * and the audit trail.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 32)->nullable();
            $t->string('name');
            $t->string('email')->unique();
            $t->string('phone', 32)->nullable();
            $t->timestamp('email_verified_at')->nullable();
            $t->string('password');
            $t->string('locale', 8)->default('ar');
            $t->string('job_title')->nullable();
            $t->boolean('is_active')->default(true);
            $t->boolean('must_change_password')->default(false);
            $t->boolean('is_super_admin')->default(false);
            $t->timestamp('last_login_at')->nullable();
            $t->rememberToken();
            $t->timestamps();
            $t->index(['company_id', 'is_active']);
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
            $t->string('code', 96)->unique();   // e.g. sales.invoice.post
            $t->string('module', 48);
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            $t->boolean('is_sensitive')->default(false);
            $t->timestamps();
            $t->index('module');
        });

        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->string('name');
            $t->text('description')->nullable();
            $t->boolean('is_system')->default(false);
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

        /** Record-level reach: which branches / warehouses / regions a user may touch. */
        Schema::create('user_scopes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('scope_type', 24); // branch|warehouse|region|cash_box|bank
            $t->unsignedBigInteger('scope_id');
            $t->timestamps();
            $t->unique(['user_id', 'scope_type', 'scope_id']);
        });

        Schema::create('devices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('device_uid', 128);
            $t->string('label')->nullable();
            $t->string('platform', 24)->default('android');
            $t->string('app_version', 24)->nullable();
            $t->string('status', 16)->default('active'); // active|blocked|retired
            $t->string('push_token')->nullable();
            $t->timestamp('last_seen_at')->nullable();
            $t->timestamp('last_sync_at')->nullable();
            $t->unsignedBigInteger('last_client_seq')->default(0);
            $t->timestamps();
            $t->unique(['company_id', 'device_uid']);
        });

        Schema::create('approval_flows', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('doc_type', 48);
            $t->unsignedTinyInteger('level')->default(1);
            $t->decimal('min_amount', 18, 2)->default(0);
            $t->decimal('max_amount', 18, 2)->nullable();
            $t->foreignId('role_id')->constrained()->cascadeOnDelete();
            $t->boolean('block_self_approval')->default(true);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->index(['company_id', 'doc_type', 'level']);
        });

        Schema::create('approvals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('doc_type', 48);
            $t->unsignedBigInteger('doc_id');
            $t->unsignedTinyInteger('level')->default(1);
            $t->string('status', 16)->default('pending'); // pending|approved|rejected
            $t->string('reason_code', 48)->nullable();     // credit_limit|discount_override|…
            $t->decimal('amount', 18, 2)->nullable();
            $t->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('decided_at')->nullable();
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'doc_type', 'doc_id']);
            $t->index(['company_id', 'status']);
        });

        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('action', 48);
            $t->string('auditable_type', 96)->nullable();
            $t->unsignedBigInteger('auditable_id')->nullable();
            $t->jsonb('before')->nullable();
            $t->jsonb('after')->nullable();
            $t->string('ip', 45)->nullable();
            $t->string('user_agent')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['auditable_type', 'auditable_id']);
            $t->index(['company_id', 'created_at']);
        });
    }

    public function down(): void
    {
        foreach (['audit_logs', 'approvals', 'approval_flows', 'devices', 'user_scopes',
            'role_user', 'permission_role', 'roles', 'permissions', 'sessions',
            'password_reset_tokens', 'users'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
