<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_type', 20)->default('user');   // user|system|job|webhook
            $table->string('action', 80);                        // e.g. payments.approved
            $table->string('entity_type', 120)->nullable();      // morph class
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->string('entity_label')->nullable();          // human readable reference (order number, receipt number)
            $table->jsonb('old_values')->nullable();
            $table->jsonb('new_values')->nullable();
            $table->text('reason')->nullable();
            $table->string('request_id', 40)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestampTz('created_at');

            $table->index(['entity_type', 'entity_id']);
            $table->index(['actor_id', 'created_at']);
            $table->index(['action', 'created_at']);
            $table->index('created_at');
            $table->index('request_id');
        });

        Schema::create('user_security_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event_type', 50);                    // login_failed|login_succeeded|password_changed|mfa_enabled|mfa_disabled|role_changed|...
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->jsonb('meta')->nullable();
            $table->string('severity', 10)->default('info');     // info|warning|critical
            $table->timestampTz('created_at');

            $table->index(['user_id', 'created_at']);
            $table->index(['event_type', 'created_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            // Audit rows are immutable at the database level. Retention jobs must use a dedicated
            // maintenance role/session that disables the trigger explicitly (documented in docs/OPERATIONS.md).
            DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION ev_prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
    IF current_setting('ev.allow_audit_maintenance', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    RAISE EXCEPTION 'audit_logs are immutable (operation % blocked)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION ev_prevent_audit_mutation();
SQL);
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared('DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs; DROP FUNCTION IF EXISTS ev_prevent_audit_mutation();');
        }
        Schema::dropIfExists('user_security_events');
        Schema::dropIfExists('audit_logs');
    }
};
