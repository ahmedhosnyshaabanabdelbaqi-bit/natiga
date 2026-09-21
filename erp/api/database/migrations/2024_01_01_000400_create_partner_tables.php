<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Suppliers and customers, including rep-assignment history. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->string('name');
            $t->string('tax_id', 64)->nullable();
            $t->string('phone', 64)->nullable();
            $t->string('email')->nullable();
            $t->text('address')->nullable();
            $t->unsignedSmallInteger('payment_terms_days')->default(0);
            $t->decimal('credit_limit', 18, 2)->default(0);
            $t->unsignedBigInteger('gl_account_id')->nullable();
            $t->unsignedTinyInteger('rating')->nullable();
            $t->decimal('opening_balance', 18, 2)->default(0);
            $t->boolean('is_active')->default(true);
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->softDeletes();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('customers')->nullOnDelete();
            $t->string('code', 48);
            $t->string('name');
            $t->string('name_en')->nullable();
            $t->string('kind', 24)->default('retail'); // retail|wholesale|distributor|project|cash
            $t->string('business_type')->nullable();
            $t->string('tax_id', 64)->nullable();
            $t->string('phone', 64)->nullable();
            $t->string('email')->nullable();
            $t->text('address')->nullable();
            $t->foreignId('region_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('route_id')->nullable()->constrained()->nullOnDelete();
            $t->unsignedBigInteger('price_list_id')->nullable();
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->unsignedSmallInteger('payment_terms_days')->default(0);
            $t->decimal('credit_limit', 18, 2)->default(0);
            $t->boolean('credit_hold')->default(false);
            $t->boolean('is_cash_only')->default(false);
            $t->unsignedBigInteger('gl_account_id')->nullable();
            $t->decimal('opening_balance', 18, 2)->default(0);
            $t->decimal('latitude', 10, 7)->nullable();
            $t->decimal('longitude', 10, 7)->nullable();
            $t->string('classification', 8)->nullable(); // A|B|C|D — reviewable, not automatic
            $t->jsonb('visit_days')->default('[]');      // ["sun","tue"]
            $t->date('opened_at')->nullable();
            $t->boolean('is_active')->default(true);
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->softDeletes();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'region_id']);
            $t->index(['company_id', 'is_active']);
        });

        Schema::create('customer_addresses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->string('label')->nullable();
            $t->text('address');
            $t->decimal('latitude', 10, 7)->nullable();
            $t->decimal('longitude', 10, 7)->nullable();
            $t->string('contact_name')->nullable();
            $t->string('contact_phone', 64)->nullable();
            $t->boolean('is_default_delivery')->default(false);
            $t->timestamps();
        });

        Schema::create('customer_contacts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('position')->nullable();
            $t->string('phone', 64)->nullable();
            $t->string('email')->nullable();
            $t->boolean('is_primary')->default(false);
            $t->timestamps();
        });

        /**
         * Assignment history — a sale stays credited to the rep who owned the
         * customer on the document date, never to whoever owns them today.
         */
        Schema::create('customer_assignments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('rep_id')->constrained('users')->cascadeOnDelete();
            $t->date('from_date');
            $t->date('to_date')->nullable();
            $t->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'customer_id', 'from_date']);
            $t->index(['company_id', 'rep_id']);
        });

        Schema::create('customer_documents', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 48);
            $t->string('path');
            $t->date('expires_at')->nullable();
            $t->timestamps();
        });

        Schema::create('item_suppliers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $t->string('supplier_item_code', 64)->nullable();
            $t->decimal('last_price', 18, 4)->nullable();
            $t->unsignedSmallInteger('lead_time_days')->default(0);
            $t->boolean('is_preferred')->default(false);
            $t->timestamps();
            $t->unique(['item_id', 'supplier_id']);
        });
    }

    public function down(): void
    {
        foreach (['item_suppliers', 'customer_documents', 'customer_assignments',
            'customer_contacts', 'customer_addresses', 'customers', 'suppliers'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
