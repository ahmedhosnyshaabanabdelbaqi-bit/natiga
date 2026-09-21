<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sales cycle: quotation → order (reserve) → delivery note (stock leaves here)
 * → invoice (revenue + COGS) → return.
 *
 * The delivery note is the single event that moves goods. An invoice raised
 * against a delivery note never touches stock again — that is what prevents the
 * classic double-deduction. A direct invoice (van sale) carries its own delivery
 * implicitly and is flagged `moves_stock = true`.
 *
 * Order state is split across three independent axes — delivery, invoicing and
 * payment — because a real order is routinely part-delivered, part-invoiced and
 * part-paid all at once.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_quotations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 48);
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('rep_id')->nullable()->constrained('users')->nullOnDelete();
            $t->date('quote_date');
            $t->date('valid_until')->nullable();
            $t->foreignId('price_list_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 24)->default('draft'); // draft|sent|accepted|rejected|expired
            $t->decimal('subtotal', 18, 2)->default(0);
            $t->decimal('discount_amount', 18, 2)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('total', 18, 2)->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('sales_quotation_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sales_quotation_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('tax_rate', 9, 4)->default(0);
            $t->decimal('line_total', 18, 2)->default(0);
            $t->timestamps();
        });

        Schema::create('sales_orders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 48);
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('customer_address_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('rep_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('price_list_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $t->date('order_date');
            $t->date('delivery_date')->nullable();
            $t->string('payment_type', 16)->default('credit'); // cash|credit|mixed
            $t->string('status', 24)->default('draft');        // draft|pending_approval|approved|cancelled|closed
            $t->string('delivery_status', 24)->default('pending'); // pending|partial|delivered
            $t->string('invoice_status', 24)->default('pending');  // pending|partial|invoiced
            $t->string('payment_status', 24)->default('unpaid');   // unpaid|partial|paid
            $t->decimal('subtotal', 18, 2)->default(0);
            $t->decimal('line_discount_amount', 18, 2)->default(0);
            $t->decimal('doc_discount_amount', 18, 2)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('delivery_fee', 18, 2)->default(0);
            $t->decimal('total', 18, 2)->default(0);
            $t->string('customer_po_ref', 64)->nullable();
            $t->boolean('is_backorder_allowed')->default(true);
            $t->string('source', 16)->default('web'); // web|mobile|import
            $t->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $t->uuid('client_uuid')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'customer_id', 'order_date']);
            $t->index(['company_id', 'rep_id', 'order_date']);
            $t->index(['company_id', 'status']);
        });
        DB::statement('CREATE UNIQUE INDEX sales_orders_client_uuid_uniq ON sales_orders (company_id, client_uuid) WHERE client_uuid IS NOT NULL');

        Schema::create('sales_order_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sales_order_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);  // snapshot
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('qty_reserved_base', 18, 4)->default(0);
            $t->decimal('qty_delivered_base', 18, 4)->default(0);
            $t->decimal('qty_invoiced_base', 18, 4)->default(0);
            $t->decimal('unit_price', 18, 4);               // snapshot
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('discount_amount', 18, 2)->default(0);
            $t->decimal('tax_rate', 9, 4)->default(0);      // snapshot
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('line_total', 18, 2)->default(0);
            $t->boolean('is_bonus')->default(false);        // free goods: price 0, cost still real
            $t->foreignId('promotion_id')->nullable()->constrained()->nullOnDelete();
            $t->string('price_source', 32)->nullable();     // contract|price_list_tier|price_list|item_default
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index('sales_order_id');
            $t->index('item_id');
        });

        Schema::create('delivery_notes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->foreignId('sales_order_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('customer_address_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('rep_id')->nullable()->constrained('users')->nullOnDelete();
            $t->date('delivery_date');
            $t->unsignedSmallInteger('stop_sequence')->nullable();
            $t->timestamp('eta')->nullable();
            $t->string('status', 24)->default('draft'); // draft|dispatched|delivered|partially_delivered|refused|rescheduled|cancelled
            $t->string('received_by_name')->nullable();
            $t->string('signature_path')->nullable();
            $t->string('otp_code', 8)->nullable();
            $t->boolean('otp_verified')->default(false);
            $t->jsonb('proof_photos')->default('[]');
            $t->timestamp('delivered_at')->nullable();
            $t->decimal('gps_lat', 10, 7)->nullable();
            $t->decimal('gps_lng', 10, 7)->nullable();
            $t->string('failure_reason', 64)->nullable();
            $t->date('rescheduled_to')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'delivery_date', 'status']);
        });

        Schema::create('delivery_note_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('delivery_note_id')->constrained()->cascadeOnDelete();
            $t->foreignId('sales_order_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('qty_base', 18, 4);              // planned
            $t->decimal('qty_delivered_base', 18, 4)->default(0);
            $t->decimal('qty_refused_base', 18, 4)->default(0);
            $t->decimal('qty_invoiced_base', 18, 4)->default(0);
            $t->decimal('unit_cost', 20, 8)->default(0); // cost captured when stock left
            $t->string('refusal_reason', 64)->nullable();
            $t->timestamps();
            $t->index('delivery_note_id');
        });

        Schema::create('sales_invoices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 48);
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('sales_order_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('delivery_note_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('rep_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $t->date('invoice_date');
            $t->date('due_date')->nullable();
            $t->string('payment_type', 16)->default('credit');
            $t->string('status', 16)->default('draft');       // draft|posted|cancelled
            $t->string('payment_status', 16)->default('unpaid');
            /**
             * true only for direct/van sales where no delivery note exists.
             * When false the goods already left via a delivery note and this
             * invoice must NOT create stock movements.
             */
            $t->boolean('moves_stock')->default(false);
            $t->decimal('subtotal', 18, 2)->default(0);
            $t->decimal('line_discount_amount', 18, 2)->default(0);
            $t->decimal('doc_discount_amount', 18, 2)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('delivery_fee', 18, 2)->default(0);
            $t->decimal('total', 18, 2)->default(0);
            $t->decimal('paid_amount', 18, 2)->default(0);
            $t->decimal('returned_amount', 18, 2)->default(0);
            $t->decimal('cogs_amount', 18, 2)->default(0);
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->string('e_invoice_status', 24)->default('not_submitted'); // not_submitted|queued|submitted|accepted|rejected|cancelled
            $t->string('e_invoice_uuid', 96)->nullable();
            $t->string('e_invoice_long_id', 128)->nullable();
            $t->jsonb('e_invoice_response')->nullable();
            $t->string('source', 16)->default('web');
            $t->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $t->uuid('client_uuid')->nullable();
            $t->string('field_no', 48)->nullable(); // rep's offline reference, never the tax number
            $t->unsignedSmallInteger('printed_count')->default(0);
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'customer_id', 'invoice_date']);
            $t->index(['company_id', 'rep_id', 'invoice_date']);
            $t->index(['company_id', 'status', 'payment_status']);
        });
        DB::statement('CREATE UNIQUE INDEX sales_invoices_client_uuid_uniq ON sales_invoices (company_id, client_uuid) WHERE client_uuid IS NOT NULL');

        Schema::create('sales_invoice_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sales_invoice_id')->constrained()->cascadeOnDelete();
            $t->foreignId('sales_order_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('delivery_note_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('qty_returned_base', 18, 4)->default(0);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('discount_amount', 18, 2)->default(0);
            $t->decimal('tax_rate', 9, 4)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('line_total', 18, 2)->default(0);
            $t->decimal('unit_cost', 20, 8)->default(0);  // historical cost — never recomputed
            $t->decimal('cogs_amount', 18, 4)->default(0);
            $t->boolean('is_bonus')->default(false);
            $t->foreignId('promotion_id')->nullable()->constrained()->nullOnDelete();
            $t->timestamps();
            $t->index('sales_invoice_id');
            $t->index('item_id');
        });

        Schema::create('sales_returns', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('sales_invoice_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('rep_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('receipt_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $t->date('return_date');
            $t->string('reason', 64)->nullable();
            /** Physical receipt and financial approval are deliberately separate states. */
            $t->string('status', 24)->default('draft'); // draft|received|inspected|posted|cancelled
            $t->boolean('without_invoice')->default(false);
            $t->string('refund_method', 16)->default('credit_note'); // credit_note|cash|customer_credit
            $t->decimal('subtotal', 18, 2)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('total', 18, 2)->default(0);
            $t->decimal('cogs_amount', 18, 2)->default(0);
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('received_at')->nullable();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->string('source', 16)->default('web');
            $t->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $t->uuid('client_uuid')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'customer_id', 'return_date']);
        });
        DB::statement('CREATE UNIQUE INDEX sales_returns_client_uuid_uniq ON sales_returns (company_id, client_uuid) WHERE client_uuid IS NOT NULL');

        Schema::create('sales_return_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sales_return_id')->constrained()->cascadeOnDelete();
            $t->foreignId('sales_invoice_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('unit_price', 18, 4)->default(0);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('tax_rate', 9, 4)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('line_total', 18, 2)->default(0);
            /** Where the goods actually land — not everything goes back on sale. */
            $t->string('disposition', 24)->default('inspection'); // sellable|inspection|damaged|return_to_supplier
            $t->decimal('original_unit_cost', 20, 8)->default(0);
            $t->decimal('cogs_amount', 18, 4)->default(0);
            $t->boolean('is_bonus')->default(false);
            $t->timestamps();
            $t->index('sales_return_id');
        });
    }

    public function down(): void
    {
        foreach (['sales_return_lines', 'sales_returns', 'sales_invoice_lines',
            'sales_invoices', 'delivery_note_lines', 'delivery_notes',
            'sales_order_lines', 'sales_orders', 'sales_quotation_lines',
            'sales_quotations'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
