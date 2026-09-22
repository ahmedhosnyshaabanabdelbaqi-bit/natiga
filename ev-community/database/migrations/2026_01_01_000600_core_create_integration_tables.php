<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('integration_providers', function (Blueprint $table) {
            $table->string('key', 40)->primary();          // payment|map|email|sms|whatsapp|shipping|charging|exchange_rate|storage|search
            $table->string('driver', 60)->default('none');
            $table->string('status', 20)->default('not_configured'); // not_configured|operational|degraded|unavailable
            $table->timestampTz('last_checked_at')->nullable();
            $table->timestampTz('last_success_at')->nullable();
            $table->text('last_error')->nullable();
            $table->jsonb('public_config')->nullable();      // non-sensitive config visible in admin
            $table->timestampsTz();
        });

        Schema::create('webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 40);
            $table->string('event_type', 80)->nullable();
            $table->string('external_event_id', 191)->nullable();
            $table->string('fingerprint', 64);               // sha256 of provider+event id (or payload) for idempotency
            $table->jsonb('headers')->nullable();
            $table->jsonb('payload')->nullable();
            $table->boolean('signature_valid')->nullable();
            $table->string('status', 20)->default('received'); // received|processing|processed|failed|ignored
            $table->unsignedSmallInteger('retry_count')->default(0);
            $table->text('error')->nullable();
            $table->timestampTz('received_at');
            $table->timestampTz('processed_at')->nullable();

            $table->unique(['provider', 'fingerprint']);
            $table->index(['provider', 'status', 'received_at']);
        });

        Schema::create('integration_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 40);
            $table->string('direction', 10);                 // outbound|inbound
            $table->string('operation', 80);
            $table->string('reference', 191)->nullable();    // our entity reference
            $table->string('status', 20);                    // success|failed|timeout
            $table->unsignedInteger('duration_ms')->nullable();
            $table->text('error')->nullable();
            $table->jsonb('meta')->nullable();               // sanitized; never secrets
            $table->timestampTz('created_at');

            $table->index(['provider', 'created_at']);
            $table->index('reference');
        });

        Schema::create('integration_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 40);
            $table->string('job', 80);
            $table->timestampTz('started_at');
            $table->timestampTz('finished_at')->nullable();
            $table->string('status', 20);                    // running|success|partial|failed
            $table->unsignedInteger('records_processed')->default(0);
            $table->unsignedInteger('records_failed')->default(0);
            $table->text('summary')->nullable();

            $table->index(['provider', 'started_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('integration_sync_logs');
        Schema::dropIfExists('integration_events');
        Schema::dropIfExists('webhook_events');
        Schema::dropIfExists('integration_providers');
    }
};
