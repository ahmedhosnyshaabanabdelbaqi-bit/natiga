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
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('number', 40)->unique();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('terminal_id')->constrained()->restrictOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('price_list_id')->nullable()->constrained()->nullOnDelete();

            // completed | voided  (a POS sale is never persisted half-finished)
            $table->string('status', 20)->default('completed');
            $table->timestamp('sold_at');
            $table->date('business_date'); // business-day bucket for reporting

            // --- money, all decimal, never float ---
            $table->decimal('subtotal', 18, 4)->default(0);            // gross, before any discount
            $table->decimal('line_discount_total', 18, 4)->default(0);
            $table->decimal('invoice_discount_total', 18, 4)->default(0);
            $table->decimal('discount_total', 18, 4)->default(0);
            $table->decimal('taxable_amount', 18, 4)->default(0);
            $table->decimal('tax_total', 18, 4)->default(0);
            $table->decimal('rounding_adjustment', 18, 4)->default(0);
            $table->decimal('grand_total', 18, 4)->default(0);
            $table->decimal('paid_total', 18, 4)->default(0);   // net applied to the invoice
            $table->decimal('change_total', 18, 4)->default(0); // handed back to the customer
            $table->decimal('due_total', 18, 4)->default(0);    // credit portion
            $table->decimal('refunded_total', 18, 4)->default(0);
            $table->decimal('cost_total', 18, 4)->default(0);
            $table->decimal('profit_total', 18, 4)->default(0);

            $table->string('invoice_discount_type', 10)->nullable(); // amount|percent
            $table->decimal('invoice_discount_value', 18, 4)->default(0);

            $table->boolean('is_credit')->default(false);
            $table->date('due_date')->nullable();
            $table->boolean('tax_inclusive')->default(false);

            // origin: online = accepted by the server live; offline = queued on
            // a terminal and synced later (never claims to be a tax document).
            $table->string('origin', 10)->default('online');
            $table->uuid('offline_uid')->nullable()->unique();
            $table->timestamp('client_created_at')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->string('idempotency_key', 120)->nullable();

            $table->foreignId('approval_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('print_count')->default(0);
            $table->unsignedInteger('version')->default(1);
            $table->text('notes')->nullable();
            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index(['business_date', 'branch_id']);
            $table->index(['shift_id']);
            $table->index(['customer_id', 'sold_at']);
            $table->index(['user_id', 'sold_at']);
            $table->index(['terminal_id', 'sold_at']);
            $table->index(['status', 'sold_at']);
        });
        DB::statement("ALTER TABLE sales ADD CONSTRAINT sales_status_check CHECK (status IN ('completed','voided'))");
        DB::statement("ALTER TABLE sales ADD CONSTRAINT sales_origin_check CHECK (origin IN ('online','offline'))");
        DB::statement('ALTER TABLE sales ADD CONSTRAINT sales_totals_non_negative CHECK (grand_total >= 0 AND paid_total >= 0 AND change_total >= 0)');
        // A credit sale must name a customer: no debt under an unknown name.
        DB::statement('ALTER TABLE sales ADD CONSTRAINT sales_credit_needs_customer CHECK (is_credit = false OR customer_id IS NOT NULL)');
        DB::statement('CREATE UNIQUE INDEX sales_idempotency_key_unique ON sales (idempotency_key) WHERE idempotency_key IS NOT NULL');

        Schema::create('sale_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('line_no');
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->restrictOnDelete();
            $table->foreignId('product_unit_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();

            // --- historical snapshots: editing the product later must never
            //     change what an old invoice says ---
            $table->string('product_name');
            $table->string('variant_name')->nullable();
            $table->string('sku', 60)->nullable();
            $table->string('barcode', 64)->nullable();
            $table->string('unit_name', 40);
            $table->decimal('unit_factor', 18, 6)->default(1);
            $table->string('tax_group_code', 30)->nullable();

            $table->decimal('qty', 18, 4);
            $table->decimal('qty_base', 18, 4);
            $table->decimal('unit_price', 18, 4);
            $table->decimal('gross_amount', 18, 4);            // qty * unit_price
            $table->decimal('line_discount_amount', 18, 4)->default(0);
            $table->decimal('line_discount_percent', 9, 4)->default(0);
            // Share of the invoice-level discount pushed down onto this line,
            // so a partial return refunds exactly what was charged.
            $table->decimal('invoice_discount_share', 18, 4)->default(0);
            $table->decimal('net_amount', 18, 4);              // after all discounts, before tax
            $table->decimal('tax_rate', 9, 4)->default(0);
            $table->decimal('tax_amount', 18, 4)->default(0);
            $table->boolean('tax_inclusive')->default(false);
            $table->decimal('total_amount', 18, 4);            // net + tax
            $table->decimal('unit_cost', 18, 6)->default(0);
            $table->decimal('cost_amount', 18, 4)->default(0);

            $table->decimal('returned_qty_base', 18, 4)->default(0);
            $table->boolean('price_overridden')->default(false);
            $table->foreignId('approval_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('parent_line_id')->nullable()->constrained('sale_lines')->cascadeOnDelete();
            $table->boolean('is_bundle_component')->default(false);
            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->unique(['sale_id', 'line_no']);
            $table->index(['variant_id', 'created_at']);
            $table->index('product_id');
        });
        DB::statement('ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_qty_positive CHECK (qty > 0 AND qty_base > 0)');
        // The database itself refuses to let returns exceed what was sold.
        DB::statement('ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_returned_within_sold CHECK (returned_qty_base >= 0 AND returned_qty_base <= qty_base)');

        Schema::create('sale_line_serials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_line_id')->constrained()->cascadeOnDelete();
            $table->foreignId('serial_id')->constrained()->restrictOnDelete();
            $table->string('serial', 80);
            $table->boolean('returned')->default(false);
            $table->timestamps();

            // The same physical unit cannot be on two invoices.
            $table->unique('serial_id');
        });

        Schema::create('sale_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_method_id')->constrained()->restrictOnDelete();
            $table->string('method_code', 30);
            $table->string('method_type', 20);
            // amount = value applied to the invoice (net of change)
            $table->decimal('amount', 18, 4);
            // tendered = what the customer physically handed over (cash only)
            $table->decimal('tendered_amount', 18, 4)->default(0);
            $table->decimal('change_amount', 18, 4)->default(0);
            $table->string('reference', 120)->nullable();
            // manual  = keyed in from an external card terminal receipt
            // provider = executed through an integrated payment provider
            $table->string('capture_mode', 20)->default('manual');
            $table->string('provider_status', 30)->nullable();
            $table->string('provider_reference', 120)->nullable();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['sale_id']);
            $table->index(['payment_method_id', 'created_at']);
        });
        DB::statement('ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_amount_positive CHECK (amount > 0)');
        DB::statement('ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_change_within_tender CHECK (change_amount >= 0 AND (tendered_amount = 0 OR tendered_amount >= change_amount))');

        Schema::create('held_carts', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('label', 60);
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->jsonb('payload');
            // open | recalled | converted | cancelled
            $table->string('status', 20)->default('open');
            // Optimistic lock: two terminals cannot check out the same hold.
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('locked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('locked_terminal_id')->nullable()->constrained('terminals')->nullOnDelete();
            $table->timestamp('locked_at')->nullable();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
        });

        Schema::create('quotes', function (Blueprint $table) {
            $table->id();
            $table->string('number', 40)->unique();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->jsonb('payload');
            $table->decimal('grand_total', 18, 4)->default(0);
            $table->date('valid_until')->nullable();
            // open | converted | expired | cancelled
            $table->string('status', 20)->default('open');
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
        // A quote converts into exactly one sale: no double counting.
        DB::statement('CREATE UNIQUE INDEX quotes_one_sale ON quotes (sale_id) WHERE sale_id IS NOT NULL');

        Schema::create('sale_returns', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('number', 40)->unique();
            $table->foreignId('sale_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('returned_at');
            $table->date('business_date');

            $table->decimal('subtotal', 18, 4)->default(0);
            $table->decimal('discount_total', 18, 4)->default(0);
            $table->decimal('tax_total', 18, 4)->default(0);
            $table->decimal('grand_total', 18, 4)->default(0);
            // How the refund was settled.
            $table->decimal('refund_cash', 18, 4)->default(0);
            $table->decimal('refund_other', 18, 4)->default(0);
            $table->decimal('credit_applied', 18, 4)->default(0); // reduced the debt instead
            $table->decimal('cost_total', 18, 4)->default(0);

            $table->boolean('without_invoice')->default(false);
            $table->string('status', 20)->default('completed');
            $table->string('reason', 120)->nullable();
            $table->foreignId('approval_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('exchange_sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->string('idempotency_key', 120)->nullable();
            $table->string('origin', 10)->default('online');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['business_date', 'branch_id']);
            $table->index('sale_id');
            $table->index('shift_id');
        });
        DB::statement('CREATE UNIQUE INDEX sale_returns_idempotency_key_unique ON sale_returns (idempotency_key) WHERE idempotency_key IS NOT NULL');
        DB::statement('ALTER TABLE sale_returns ADD CONSTRAINT sale_returns_refund_non_negative CHECK (refund_cash >= 0 AND refund_other >= 0 AND credit_applied >= 0)');

        Schema::create('sale_return_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_return_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sale_line_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->restrictOnDelete();
            $table->foreignId('product_unit_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();

            $table->string('product_name');
            $table->string('unit_name', 40);
            $table->decimal('unit_factor', 18, 6)->default(1);
            $table->decimal('qty', 18, 4);
            $table->decimal('qty_base', 18, 4);
            // Priced from the ORIGINAL invoice, not from today's price list.
            $table->decimal('unit_price', 18, 4);
            $table->decimal('discount_share', 18, 4)->default(0);
            $table->decimal('net_amount', 18, 4);
            $table->decimal('tax_rate', 9, 4)->default(0);
            $table->decimal('tax_amount', 18, 4)->default(0);
            $table->decimal('total_amount', 18, 4);
            // Cost reversed at the ORIGINAL cost of goods sold.
            $table->decimal('unit_cost', 18, 6)->default(0);
            $table->decimal('cost_amount', 18, 4)->default(0);

            // resalable | damaged | inspection | returns_warehouse
            $table->string('disposition', 25)->default('resalable');
            $table->foreignId('destination_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->timestamps();

            $table->index('sale_line_id');
        });
        DB::statement('ALTER TABLE sale_return_lines ADD CONSTRAINT sale_return_lines_qty_positive CHECK (qty > 0 AND qty_base > 0)');

        Schema::create('sale_return_line_serials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_return_line_id')->constrained()->cascadeOnDelete();
            $table->foreignId('serial_id')->constrained()->restrictOnDelete();
            $table->string('serial', 80);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_return_line_serials');
        Schema::dropIfExists('sale_return_lines');
        Schema::dropIfExists('sale_returns');
        Schema::dropIfExists('quotes');
        Schema::dropIfExists('held_carts');
        Schema::dropIfExists('sale_payments');
        Schema::dropIfExists('sale_line_serials');
        Schema::dropIfExists('sale_lines');
        Schema::dropIfExists('sales');
    }
};
