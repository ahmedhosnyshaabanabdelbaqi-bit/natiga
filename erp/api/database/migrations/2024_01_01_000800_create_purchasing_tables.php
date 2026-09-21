<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Purchase cycle: requisition → RFQ → PO → goods receipt → supplier invoice,
 * plus returns and landed costs.
 *
 * Receiving and invoicing are separate events. Receiving moves stock and credits
 * GRNI; the invoice clears GRNI and credits the supplier. Stock is never added
 * twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_requisitions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 48);
            $t->date('request_date');
            $t->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 24)->default('draft'); // draft|pending_approval|approved|rejected|closed
            $t->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('source', 24)->default('manual'); // manual|reorder_suggestion
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('purchase_requisition_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('purchase_requisition_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('qty_ordered_base', 18, 4)->default(0);
            $t->date('needed_by')->nullable();
            $t->text('note')->nullable();
            $t->timestamps();
        });

        Schema::create('rfqs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->date('rfq_date');
            $t->date('due_date')->nullable();
            $t->string('status', 24)->default('draft'); // draft|sent|closed|cancelled
            $t->foreignId('purchase_requisition_id')->nullable()->constrained()->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('rfq_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('rfq_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->timestamps();
        });

        Schema::create('rfq_quotes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('rfq_id')->constrained()->cascadeOnDelete();
            $t->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $t->foreignId('rfq_line_id')->constrained()->cascadeOnDelete();
            $t->decimal('unit_price', 18, 4);
            $t->unsignedSmallInteger('lead_time_days')->default(0);
            $t->unsignedSmallInteger('payment_terms_days')->default(0);
            $t->boolean('is_selected')->default(false);
            $t->text('note')->nullable();
            $t->timestamps();
        });

        Schema::create('purchase_orders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 48);
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->date('order_date');
            $t->date('expected_date')->nullable();
            $t->char('currency_code', 3)->default('EGP');
            $t->decimal('exchange_rate', 18, 8)->default(1);
            $t->string('status', 24)->default('draft'); // draft|pending_approval|approved|partially_received|received|closed|cancelled
            $t->decimal('subtotal', 18, 2)->default(0);
            $t->decimal('discount_amount', 18, 2)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('total', 18, 2)->default(0);
            $t->foreignId('purchase_requisition_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'supplier_id', 'status']);
        });

        Schema::create('purchase_order_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('qty_received_base', 18, 4)->default(0);
            $t->decimal('unit_price', 18, 4);         // per input unit
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('tax_rate', 9, 4)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('line_total', 18, 2)->default(0);
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index('purchase_order_id');
        });

        Schema::create('goods_receipts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->foreignId('purchase_order_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->date('receipt_date');
            $t->string('supplier_delivery_ref', 64)->nullable();
            $t->string('status', 16)->default('draft'); // draft|posted|cancelled
            $t->decimal('total_value', 18, 2)->default(0);
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'status']);
        });

        Schema::create('goods_receipt_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('goods_receipt_id')->constrained()->cascadeOnDelete();
            $t->foreignId('purchase_order_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('qty_invoiced_base', 18, 4)->default(0);
            $t->decimal('unit_cost', 20, 8)->default(0);  // per BASE unit, excl. tax
            $t->decimal('landed_cost_value', 18, 4)->default(0);
            $t->decimal('value', 18, 4)->default(0);
            $t->string('disposition', 16)->default('stock'); // stock|inspection|quarantine
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index('goods_receipt_id');
        });

        Schema::create('supplier_invoices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->string('supplier_invoice_no', 64)->nullable();
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->date('invoice_date');
            $t->date('due_date')->nullable();
            $t->char('currency_code', 3)->default('EGP');
            $t->decimal('exchange_rate', 18, 8)->default(1);
            $t->string('status', 16)->default('draft'); // draft|posted|cancelled
            $t->decimal('subtotal', 18, 2)->default(0);
            $t->decimal('discount_amount', 18, 2)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('total', 18, 2)->default(0);
            $t->decimal('paid_amount', 18, 2)->default(0);
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'supplier_id', 'status']);
        });

        Schema::create('supplier_invoice_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('supplier_invoice_id')->constrained()->cascadeOnDelete();
            $t->foreignId('goods_receipt_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('expense_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $t->decimal('qty_base', 18, 4)->default(0);
            $t->decimal('unit_price', 18, 4)->default(0);
            $t->decimal('tax_rate', 9, 4)->default(0);
            $t->decimal('tax_amount', 18, 2)->default(0);
            $t->decimal('line_total', 18, 2)->default(0);
            $t->decimal('price_variance', 18, 4)->default(0); // invoice vs. receipt cost
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index('supplier_invoice_id');
        });

        Schema::create('purchase_returns', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('goods_receipt_id')->nullable()->constrained()->nullOnDelete();
            $t->date('return_date');
            $t->string('reason', 48)->nullable();
            $t->string('status', 16)->default('draft');
            $t->decimal('total', 18, 2)->default(0);
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('purchase_return_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('purchase_return_id')->constrained()->cascadeOnDelete();
            $t->foreignId('goods_receipt_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('qty_base', 18, 4);
            $t->decimal('unit_cost', 20, 8)->default(0);
            $t->decimal('unit_price', 18, 4)->default(0);
            $t->decimal('line_total', 18, 2)->default(0);
            $t->timestamps();
        });

        Schema::create('landed_costs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->date('cost_date');
            $t->string('kind', 32);  // freight|clearance|insurance|handling|other
            $t->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('amount', 18, 2);
            $t->string('allocation_method', 16)->default('value'); // value|qty|weight
            $t->string('status', 16)->default('draft'); // draft|posted|cancelled
            $t->decimal('allocated_to_inventory', 18, 2)->default(0);
            $t->decimal('allocated_to_cogs', 18, 2)->default(0);
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('landed_cost_allocations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('landed_cost_id')->constrained()->cascadeOnDelete();
            $t->foreignId('goods_receipt_line_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->decimal('basis', 18, 4)->default(0);
            $t->decimal('amount', 18, 4)->default(0);
            $t->decimal('to_inventory', 18, 4)->default(0);
            $t->decimal('to_cogs', 18, 4)->default(0);
            $t->decimal('qty_remaining_base', 18, 4)->default(0);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['landed_cost_allocations', 'landed_costs', 'purchase_return_lines',
            'purchase_returns', 'supplier_invoice_lines', 'supplier_invoices',
            'goods_receipt_lines', 'goods_receipts', 'purchase_order_lines',
            'purchase_orders', 'rfq_quotes', 'rfq_lines', 'rfqs',
            'purchase_requisition_lines', 'purchase_requisitions'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
