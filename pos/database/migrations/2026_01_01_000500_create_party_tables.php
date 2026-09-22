<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name');
            $table->string('phone', 32)->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->string('tax_number', 64)->nullable();
            $table->string('type', 20)->default('retail'); // retail|wholesale
            $table->foreignId('price_list_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('credit_limit', 18, 4)->default(0);
            $table->unsignedSmallInteger('payment_terms_days')->default(0);
            $table->decimal('opening_balance', 18, 4)->default(0);
            $table->date('opening_balance_date')->nullable();
            // Derived from customer_ledger_entries; positive = customer owes us.
            $table->decimal('balance', 18, 4)->default(0);
            $table->boolean('allow_credit')->default(false);
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('phone');
            $table->index('name');
        });
        DB::statement('CREATE INDEX customers_name_trgm ON customers USING gin (name gin_trgm_ops)');

        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name');
            $table->string('phone', 32)->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->string('tax_number', 64)->nullable();
            $table->unsignedSmallInteger('payment_terms_days')->default(0);
            $table->decimal('opening_balance', 18, 4)->default(0);
            $table->date('opening_balance_date')->nullable();
            // Positive = we owe the supplier.
            $table->decimal('balance', 18, 4)->default(0);
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::table('batches', function (Blueprint $table) {
            $table->foreign('supplier_id')->references('id')->on('suppliers')->nullOnDelete();
        });

        // Running statement for a customer. Insert-only; `balance` on the
        // customer row is the projection and is rebuildable from here.
        Schema::create('customer_ledger_entries', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->date('entry_date');
            // opening|sale|payment|return|adjustment|write_off
            $table->string('type', 20);
            $table->string('source_type', 80)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->decimal('debit', 18, 4)->default(0);   // increases what they owe
            $table->decimal('credit', 18, 4)->default(0);  // decreases it
            $table->decimal('balance_after', 18, 4)->default(0);
            $table->date('due_date')->nullable();
            $table->string('description')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['customer_id', 'entry_date']);
            $table->index(['source_type', 'source_id']);
        });
        DB::statement('ALTER TABLE customer_ledger_entries ADD CONSTRAINT customer_ledger_sides CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0))');

        Schema::create('supplier_ledger_entries', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $table->date('entry_date');
            $table->string('type', 20); // opening|purchase|payment|return|adjustment
            $table->string('source_type', 80)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->decimal('debit', 18, 4)->default(0);   // we pay / they owe us
            $table->decimal('credit', 18, 4)->default(0);  // we owe them
            $table->decimal('balance_after', 18, 4)->default(0);
            $table->date('due_date')->nullable();
            $table->string('description')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['supplier_id', 'entry_date']);
            $table->index(['source_type', 'source_id']);
        });
        DB::statement('ALTER TABLE supplier_ledger_entries ADD CONSTRAINT supplier_ledger_sides CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0))');
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_ledger_entries');
        Schema::dropIfExists('customer_ledger_entries');
        Schema::table('batches', function (Blueprint $table) {
            $table->dropForeign(['supplier_id']);
        });
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('customers');
    }
};
