<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Every QR / card verification attempt against a resolvable membership (server-side log).
        Schema::create('membership_verifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('membership_id')->constrained('memberships')->restrictOnDelete();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete(); // null = public/anonymous scan
            $table->string('purpose', 20);                    // membership|offer|event|pickup|booking|public
            $table->string('context_type', 120)->nullable();  // morph class of the related entity (offer, event, delivery...)
            $table->unsignedBigInteger('context_id')->nullable();
            $table->string('result', 20);                     // valid|invalid|expired|not_active
            $table->string('ip_address', 45)->nullable();
            $table->timestampTz('created_at');

            $table->index(['membership_id', 'created_at']);
            $table->index(['purpose', 'created_at']);
            $table->index(['context_type', 'context_id']);
        });

        // "Delete my personal data" requests. Processing anonymises the user but never destroys
        // memberships, ledgers, orders or audit rows.
        Schema::create('account_deletion_requests', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('status', 20)->default('requested'); // requested|under_review|completed|rejected
            $table->text('reason')->nullable();
            $table->timestampTz('requested_at');
            $table->timestampTz('processed_at')->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();                  // staff notes (outcome, retention decisions)
            $table->timestampsTz();

            $table->index(['user_id', 'status']);
            $table->index(['status', 'requested_at']);
        });

        // Internal staff notes with history (replaces the free-text memberships.notes column, kept unused).
        Schema::create('member_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('membership_id')->constrained('memberships')->restrictOnDelete();
            $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->boolean('is_pinned')->default(false);
            $table->timestampTz('created_at');

            $table->index(['membership_id', 'is_pinned', 'created_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE membership_verifications ADD CONSTRAINT membership_verifications_purpose_check CHECK (purpose IN ('membership','offer','event','pickup','booking','public'))");
            DB::statement("ALTER TABLE membership_verifications ADD CONSTRAINT membership_verifications_result_check CHECK (result IN ('valid','invalid','expired','not_active'))");
            DB::statement("ALTER TABLE account_deletion_requests ADD CONSTRAINT account_deletion_requests_status_check CHECK (status IN ('requested','under_review','completed','rejected'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('member_notes');
        Schema::dropIfExists('account_deletion_requests');
        Schema::dropIfExists('membership_verifications');
    }
};
