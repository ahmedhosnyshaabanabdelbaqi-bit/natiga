<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Single establishment per deployment (branches live below it).
        Schema::create('stores', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('legal_name')->nullable();
            $table->string('business_profile', 40)->default('general_retail');
            $table->string('currency', 3)->default('EGP');
            $table->string('timezone', 64)->default('Africa/Cairo');
            $table->string('locale', 5)->default('ar');
            $table->string('phone', 32)->nullable();
            $table->string('email')->nullable();
            $table->string('website')->nullable();
            $table->text('address')->nullable();
            $table->string('tax_number', 64)->nullable();
            $table->string('logo_path')->nullable();
            $table->boolean('setup_completed')->default(false);
            $table->timestamp('setup_completed_at')->nullable();
            $table->jsonb('social')->nullable();
            $table->timestamps();
        });

        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name');
            $table->string('phone', 32)->nullable();
            $table->text('address')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('settings')->nullable();
            $table->timestamps();
        });

        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->string('code', 32)->unique();
            $table->string('name');
            // sales  = sellable stock, returns/damaged = quarantined, transit = in-transfer
            $table->string('type', 20)->default('sales');
            $table->boolean('is_sellable')->default(true);
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['branch_id', 'is_active']);
        });

        // Cash registers / POS devices.
        Schema::create('terminals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $table->string('code', 32)->unique();
            $table->string('name');
            $table->string('device_token_hash', 128)->nullable();
            $table->string('printer_profile', 40)->nullable();
            // Offline selling is an explicit, per-device authorisation.
            $table->boolean('offline_allowed')->default(false);
            $table->integer('offline_max_hours')->default(12);
            $table->decimal('offline_max_sale_amount', 18, 4)->default(0);
            $table->timestamp('offline_authorized_until')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_seen_at')->nullable();
            $table->jsonb('settings')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'is_active']);
        });

        // Generic runtime settings; scope lets a branch/terminal override a global key.
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 120);
            $table->string('scope', 20)->default('global'); // global|branch|terminal|user
            $table->unsignedBigInteger('scope_id')->nullable();
            $table->jsonb('value')->nullable();
            $table->timestamps();

            $table->unique(['key', 'scope', 'scope_id']);
        });

        // Gap-free-ish document numbering, incremented under row lock.
        Schema::create('document_sequences', function (Blueprint $table) {
            $table->id();
            $table->string('document_type', 40);
            $table->string('scope_key', 60)->default('global');
            $table->string('prefix', 20)->default('');
            $table->unsignedBigInteger('next_number')->default(1);
            $table->unsignedSmallInteger('padding')->default(6);
            $table->timestamps();

            $table->unique(['document_type', 'scope_key']);
        });

        Schema::create('print_templates', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name');
            $table->string('type', 30);   // receipt|invoice_a4|label|shift_report
            $table->string('paper', 10);  // 58mm|80mm|a4|label
            $table->boolean('is_default')->default(false);
            $table->jsonb('options')->nullable();
            $table->text('body')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('print_templates');
        Schema::dropIfExists('document_sequences');
        Schema::dropIfExists('settings');
        Schema::dropIfExists('terminals');
        Schema::dropIfExists('warehouses');
        Schema::dropIfExists('branches');
        Schema::dropIfExists('stores');
    }
};
