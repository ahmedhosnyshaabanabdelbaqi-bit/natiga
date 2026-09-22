<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /*
         * Exactly-once semantics for money-moving requests. The unique key is
         * claimed in its own committed transaction BEFORE the business work
         * starts, so a duplicate request loses the race instead of creating a
         * second invoice.
         */
        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->string('key', 120);
            $table->string('scope', 40)->default('sale'); // sale|return|collection|...
            // Hash of the semantic request body: same key + different body = error.
            $table->string('request_hash', 64);
            // in_progress | completed | failed
            $table->string('status', 20)->default('in_progress');
            $table->string('resource_type', 80)->nullable();
            $table->unsignedBigInteger('resource_id')->nullable();
            $table->jsonb('response')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->text('error')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('expires_at')->nullable();

            $table->unique(['scope', 'key']);
            $table->index('expires_at');
        });

        /* Operations captured on a terminal while the server was unreachable. */
        Schema::create('offline_operations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('terminal_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 40); // sale|cash_movement|...
            $table->jsonb('payload');
            $table->string('payload_hash', 64);
            // pending | applied | conflict | rejected | resolved
            $table->string('status', 20)->default('pending');
            $table->jsonb('conflicts')->nullable();
            $table->string('resource_type', 80)->nullable();
            $table->unsignedBigInteger('resource_id')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('resolution_note')->nullable();
            $table->timestamp('client_created_at')->nullable();
            $table->timestamp('received_at')->useCurrent();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'terminal_id']);
        });

        /*
         * Side effects (printing, notifications, e-invoice, webhooks) are queued
         * AFTER the money transaction commits, never inside it.
         */
        Schema::create('outbox_messages', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('topic', 60);
            $table->jsonb('payload');
            $table->string('status', 20)->default('pending'); // pending|sent|failed|dead
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('available_at')->useCurrent();
            $table->text('last_error')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'available_at']);
            $table->index('topic');
        });

        /* A failed print never voids or repeats a committed sale. */
        Schema::create('print_jobs', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('type', 30); // receipt|invoice_a4|label|shift_report
            $table->foreignId('print_template_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->string('source_type', 80)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->jsonb('payload')->nullable();
            $table->string('status', 20)->default('pending'); // pending|printed|failed|cancelled
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedSmallInteger('copies')->default(1);
            $table->boolean('is_reprint')->default(false);
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('last_error')->nullable();
            $table->timestamp('printed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'terminal_id']);
            $table->index(['source_type', 'source_id']);
        });

        Schema::create('device_sync_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('terminal_id')->constrained()->cascadeOnDelete();
            $table->timestamp('last_pull_at')->nullable();
            $table->timestamp('last_push_at')->nullable();
            $table->unsignedInteger('pending_operations')->default(0);
            $table->string('catalog_version', 40)->nullable();
            $table->timestamps();

            $table->unique('terminal_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_sync_states');
        Schema::dropIfExists('print_jobs');
        Schema::dropIfExists('outbox_messages');
        Schema::dropIfExists('offline_operations');
        Schema::dropIfExists('idempotency_keys');
    }
};
