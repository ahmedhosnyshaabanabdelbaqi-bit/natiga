<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Server-side payloads for opaque QR tokens (App\Support\Qr\QrService).
        // The token handed to the client carries only token_id + HMAC signature, never PII.
        Schema::create('qr_tokens', function (Blueprint $table) {
            $table->id();
            $table->ulid('token_id')->unique();
            $table->string('purpose', 60);              // e.g. membership_card, event_checkin, pickup_authorization
            $table->jsonb('payload');
            $table->timestampTz('expires_at')->nullable();
            $table->boolean('single_use')->default(false);
            $table->timestampTz('used_at')->nullable();
            $table->foreignId('used_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('created_at');

            $table->index(['purpose', 'expires_at']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qr_tokens');
    }
};
