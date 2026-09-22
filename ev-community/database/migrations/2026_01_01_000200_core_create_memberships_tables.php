<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('memberships', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->foreignId('user_id')->unique()->constrained('users')->restrictOnDelete();
            $table->string('member_number', 20)->unique();      // EV-000001
            $table->string('status', 20)->default('pending');    // pending|active|suspended|rejected|expired
            $table->foreignId('governorate_id')->nullable();     // FK added after governorates exist (core system migration)
            $table->timestampTz('joined_at')->nullable();
            $table->timestampTz('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('suspended_at')->nullable();
            $table->timestampTz('expires_at')->nullable();
            $table->string('referral_code', 16)->unique();
            $table->foreignId('referred_by')->nullable()->constrained('memberships')->nullOnDelete();
            $table->string('referral_source', 100)->nullable(); // free text: how did you hear about us
            $table->string('verification_token', 64)->unique(); // opaque token embedded in the membership QR
            $table->timestampTz('verification_token_rotated_at')->nullable();
            $table->text('notes')->nullable();                   // internal admin notes
            $table->timestampsTz();

            $table->index('status');
            $table->index(['status', 'created_at']);
        });

        Schema::create('membership_status_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('membership_id')->constrained('memberships')->restrictOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestampTz('created_at');

            $table->index(['membership_id', 'created_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE memberships ADD CONSTRAINT memberships_status_check CHECK (status IN ('pending','active','suspended','rejected','expired'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('membership_status_history');
        Schema::dropIfExists('memberships');
    }
};
