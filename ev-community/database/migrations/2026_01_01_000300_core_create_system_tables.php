<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('group', 50);               // general|branding|finance|orders|inventory|maintenance|charging|notifications|security|modules|...
            $table->string('key', 120)->unique();       // dotted key e.g. branding.site_name
            $table->jsonb('value')->nullable();
            $table->string('type', 20)->default('string'); // string|text|int|decimal|bool|json|image|select
            $table->boolean('is_public')->default(false);  // safe to send to the browser
            $table->boolean('is_sensitive')->default(false); // never displayed back in full
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->index('group');
        });

        Schema::create('module_settings', function (Blueprint $table) {
            $table->string('key', 50)->primary();
            $table->boolean('enabled')->default(true);
            $table->jsonb('settings')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();
        });

        Schema::create('feature_flags', function (Blueprint $table) {
            $table->string('key', 80)->primary();
            $table->boolean('enabled')->default(false);
            $table->jsonb('rules')->nullable();        // optional rollout rules (percentage, member ids)
            $table->string('description')->nullable();
            $table->timestampsTz();
        });

        Schema::create('number_sequences', function (Blueprint $table) {
            $table->string('key', 40);
            $table->unsignedInteger('year');             // 0 = not yearly
            $table->string('prefix', 12);
            $table->unsignedBigInteger('next_value')->default(1);
            $table->unsignedTinyInteger('padding')->default(6);
            $table->timestampsTz();

            $table->primary(['key', 'year']);
        });

        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 80);
            $table->string('key', 191);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('request_hash', 64)->nullable();
            $table->string('status', 20)->default('processing'); // processing|completed|failed
            $table->string('response_type', 120)->nullable();
            $table->string('response_reference', 191)->nullable();
            $table->jsonb('response_payload')->nullable();
            $table->timestampTz('expires_at')->nullable();
            $table->timestampsTz();

            $table->unique(['scope', 'key']);
            $table->index('expires_at');
        });

        Schema::create('currencies', function (Blueprint $table) {
            $table->string('code', 3)->primary();
            $table->string('name_ar', 60);
            $table->string('name_en', 60);
            $table->string('symbol', 8)->nullable();
            $table->unsignedTinyInteger('minor_units')->default(2);
            $table->boolean('is_base')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestampsTz();
        });

        Schema::create('exchange_rates', function (Blueprint $table) {
            $table->id();
            $table->string('base_currency', 3);
            $table->string('quote_currency', 3);
            $table->decimal('rate', 18, 8);              // 1 base = rate quote
            $table->string('source', 60);                // manual|provider:<name>
            $table->string('source_reference')->nullable();
            $table->date('rate_date');
            $table->text('reason')->nullable();
            $table->foreignId('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->foreign('base_currency')->references('code')->on('currencies');
            $table->foreign('quote_currency')->references('code')->on('currencies');
            $table->unique(['base_currency', 'quote_currency', 'rate_date', 'source']);
            $table->index(['base_currency', 'quote_currency', 'rate_date']);
        });

        Schema::create('countries', function (Blueprint $table) {
            $table->string('code', 2)->primary();
            $table->string('name_ar', 80);
            $table->string('name_en', 80);
            $table->string('dial_code', 6)->nullable();
            $table->boolean('is_active')->default(true);
        });

        Schema::create('governorates', function (Blueprint $table) {
            $table->id();
            $table->string('country_code', 2)->default('EG');
            $table->string('code', 10)->unique();
            $table->string('name_ar', 80);
            $table->string('name_en', 80);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);

            $table->foreign('country_code')->references('code')->on('countries');
        });

        Schema::create('areas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('governorate_id')->constrained('governorates')->restrictOnDelete();
            $table->string('name_ar', 100);
            $table->string('name_en', 100);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampsTz();

            $table->unique(['governorate_id', 'name_en']);
        });

        Schema::table('memberships', function (Blueprint $table) {
            $table->foreign('governorate_id')->references('id')->on('governorates')->nullOnDelete();
        });

        Schema::create('policy_versions', function (Blueprint $table) {
            $table->id();
            $table->string('type', 30);                  // terms|privacy|marketing|cancellation|warranty
            $table->string('version', 20);
            $table->text('content_ar');
            $table->text('content_en');
            $table->string('summary_ar')->nullable();
            $table->string('summary_en')->nullable();
            $table->boolean('requires_reacceptance')->default(false);
            $table->timestampTz('published_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->unique(['type', 'version']);
            $table->index(['type', 'published_at']);
        });

        Schema::create('consent_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('consent_type', 30);          // terms|privacy|marketing_email|marketing_sms|marketing_whatsapp
            $table->string('version', 20)->nullable();
            $table->timestampTz('accepted_at')->nullable();
            $table->timestampTz('withdrawn_at')->nullable();
            $table->string('source', 40)->default('web'); // web|admin|import|api
            $table->string('ip_address', 45)->nullable();
            $table->timestampTz('created_at');

            $table->index(['user_id', 'consent_type', 'created_at']);
        });

        Schema::create('status_banners', function (Blueprint $table) {
            $table->id();
            $table->string('level', 20);                 // information|warning|major
            $table->string('message_ar');
            $table->string('message_en');
            $table->jsonb('targets');                    // ["public","member","partner"]
            $table->boolean('is_active')->default(true);
            $table->timestampTz('starts_at')->nullable();
            $table->timestampTz('ends_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->index(['is_active', 'starts_at', 'ends_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_rate_positive CHECK (rate > 0)');
            DB::statement("ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_status_check CHECK (status IN ('processing','completed','failed'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('status_banners');
        Schema::dropIfExists('consent_logs');
        Schema::dropIfExists('policy_versions');
        Schema::table('memberships', fn (Blueprint $t) => $t->dropForeign(['governorate_id']));
        Schema::dropIfExists('areas');
        Schema::dropIfExists('governorates');
        Schema::dropIfExists('countries');
        Schema::dropIfExists('exchange_rates');
        Schema::dropIfExists('currencies');
        Schema::dropIfExists('idempotency_keys');
        Schema::dropIfExists('number_sequences');
        Schema::dropIfExists('feature_flags');
        Schema::dropIfExists('module_settings');
        Schema::dropIfExists('system_settings');
    }
};
