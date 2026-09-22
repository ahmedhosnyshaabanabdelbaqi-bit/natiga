<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('category', 30);                  // orders|payments|shipping|pickup|maintenance|warranty|charging|offers|support|system
            $table->string('key', 120);                      // e.g. orders.confirmed
            $table->string('title', 255);
            $table->text('body');
            $table->string('url', 2048)->nullable();
            $table->jsonb('data')->nullable();               // variables passed by the sending module (no secrets)
            $table->boolean('is_transactional')->default(true);
            $table->string('dedup_key', 191)->nullable();    // retries never duplicate: unique per user
            $table->timestampTz('read_at')->nullable();
            $table->timestampTz('created_at');

            $table->index(['user_id', 'read_at']);
            $table->index(['user_id', 'created_at']);
            $table->index(['category', 'created_at']);
            $table->index('key');
        });

        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('category', 30);                  // a notification category or the pseudo-category `marketing`
            $table->string('channel', 20);                   // in_app|email|sms|whatsapp
            $table->boolean('enabled')->default(true);
            $table->timestampsTz();

            $table->unique(['user_id', 'category', 'channel']);
        });

        Schema::create('notification_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('notification_id')->constrained('notifications')->cascadeOnDelete();
            $table->string('channel', 20);                   // in_app|email|sms|whatsapp
            $table->string('status', 20)->default('queued'); // queued|sent|delivered|failed|skipped|read
            $table->string('provider', 60)->nullable();      // mail driver / sms provider key
            $table->string('provider_message_id', 191)->nullable();
            $table->text('error')->nullable();               // failure message or skip reason (not_configured|preference_disabled|no_consent|no_email|no_mobile)
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestampTz('queued_at')->nullable();
            $table->timestampTz('sent_at')->nullable();
            $table->timestampTz('delivered_at')->nullable();
            $table->timestampsTz();

            $table->index(['status', 'queued_at']);
            $table->index(['notification_id', 'channel']);
            $table->index(['channel', 'status', 'updated_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE UNIQUE INDEX notifications_user_dedup_unique ON notifications (user_id, dedup_key) WHERE dedup_key IS NOT NULL');
            DB::statement("ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (category IN ('orders','payments','shipping','pickup','maintenance','warranty','charging','offers','support','system'))");
            DB::statement("ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_channel_check CHECK (channel IN ('in_app','email','sms','whatsapp'))");
            DB::statement("ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('in_app','email','sms','whatsapp'))");
            DB::statement("ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_status_check CHECK (status IN ('queued','sent','delivered','failed','skipped','read'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_deliveries');
        Schema::dropIfExists('notification_preferences');
        Schema::dropIfExists('notifications');
    }
};
