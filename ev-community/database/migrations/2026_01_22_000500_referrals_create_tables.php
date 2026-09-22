<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per referred membership. Created at registration (status registered), flipped to
        // approved when the referred membership is approved. No monetary rewards are ever computed here.
        Schema::create('member_referrals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referrer_membership_id')->constrained('memberships')->restrictOnDelete();
            $table->foreignId('referred_membership_id')->unique()->constrained('memberships')->restrictOnDelete();
            $table->string('referral_code_used', 16);
            $table->string('status', 20)->default('registered'); // invited|registered|approved
            $table->timestampTz('created_at');
            $table->timestampTz('approved_at')->nullable();

            $table->index(['referrer_membership_id', 'status']);
            $table->index(['status', 'created_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE member_referrals ADD CONSTRAINT member_referrals_status_check CHECK (status IN ('invited','registered','approved'))");
            DB::statement('ALTER TABLE member_referrals ADD CONSTRAINT member_referrals_no_self_referral CHECK (referrer_membership_id <> referred_membership_id)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('member_referrals');
    }
};
