<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * المشتريات: طلب شراء، عروض، أمر شراء، استلام، فاتورة مورد، تكاليف إضافية، مرتجع، مدفوعات.
 * الاستلام المخزني منفصل عن فاتورة المورد (GRNI).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_requests', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('request_no', 40);
            $t->date('request_date');
            $t->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 30)->default('draft'); // draft|submitted|approved|rejected|converted|cancelled
            $t->string('source', 30)->default('manual'); // manual|reorder_suggestion
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'request_no']);
        });

        Schema::create('purchase_request_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('purchase_request_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('ordered_qty_base', 20, 6)->default(0);
            $t->date('required_date')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('supplier_quotes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('quote_no', 40);
            $t->date('quote_date');
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->foreignId('purchase_request_id')->nullable()->constrained()->nullOnDelete();
            $t->date('valid_until')->nullable();
            $t->unsignedSmallInteger('lead_time_days')->default(0);
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->string('status', 20)->default('received'); // received|selected|rejected
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'quote_no']);
        });

        Schema::create('supplier_quote_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('supplier_quote_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('line_total', 18, 4);
            $t->timestamps();
        });

        Schema::create('purchase_orders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('order_no', 40);
            $t->date('order_date');
            $t->date('expected_date')->nullable();
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('purchase_request_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('supplier_quote_id')->nullable()->constrained()->nullOnDelete();
            $t->string('payment_type', 20)->default('credit'); // cash | credit
            $t->unsignedSmallInteger('payment_term_days')->default(0);
            // draft|pending_approval|approved|partially_received|received|closed|cancelled
            $t->string('status', 30)->default('draft');
            $t->string('receipt_status', 30)->default('not_received');
            $t->decimal('subtotal', 18, 4)->default(0);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->char('currency_code', 3)->default('EGP');
            $t->decimal('exchange_rate', 18, 8)->default(1);
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'order_no']);
            $t->index(['company_id', 'supplier_id', 'order_date']);
        });

        Schema::create('purchase_order_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);     // محفوظ داخل المستند
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('received_qty_base', 20, 6)->default(0);
            $t->decimal('invoiced_qty_base', 20, 6)->default(0);
            $t->decimal('unit_price', 18, 4);      // بسعر الوحدة المختارة
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->foreignId('tax_code_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('tax_rate', 9, 6)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('line_total', 18, 4);
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('goods_receipts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('receipt_no', 40);
            $t->date('receipt_date');
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('purchase_order_id')->nullable()->constrained()->nullOnDelete();
            $t->string('supplier_delivery_no', 60)->nullable();
            // draft | posted | cancelled
            $t->string('status', 20)->default('draft');
            $t->decimal('total_cost', 18, 4)->default(0);
            $t->decimal('landed_cost_amount', 18, 4)->default(0);
            $t->boolean('is_invoiced')->default(false);
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'receipt_no']);
        });

        Schema::create('goods_receipt_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('goods_receipt_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('purchase_order_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->string('batch_no', 60)->nullable();
            $t->date('expiry_date')->nullable();
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('unit_cost', 20, 6);      // بالوحدة الأساسية
            $t->decimal('line_cost', 18, 4);
            $t->decimal('landed_cost_share', 18, 4)->default(0);
            $t->decimal('invoiced_qty_base', 20, 6)->default(0);
            // available | inspection | quarantine
            $t->string('status_bucket', 20)->default('available');
            $t->timestamps();
        });

        Schema::create('supplier_invoices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('invoice_no', 40);
            $t->string('supplier_invoice_no', 60)->nullable();
            $t->date('invoice_date');
            $t->date('due_date')->nullable();
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->foreignId('purchase_order_id')->nullable()->constrained()->nullOnDelete();
            $t->string('payment_type', 20)->default('credit');
            // draft | posted | partially_paid | paid | cancelled
            $t->string('status', 20)->default('draft');
            $t->decimal('subtotal', 18, 4)->default(0);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->decimal('paid_amount', 18, 4)->default(0);
            $t->decimal('returned_amount', 18, 4)->default(0);
            $t->char('currency_code', 3)->default('EGP');
            $t->decimal('exchange_rate', 18, 8)->default(1);
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'invoice_no']);
            $t->index(['company_id', 'supplier_id', 'invoice_date']);
        });

        Schema::create('supplier_invoice_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('supplier_invoice_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('goods_receipt_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->foreignId('tax_code_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('tax_rate', 9, 6)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('line_total', 18, 4);
            // فرق السعر بين الاستلام والفاتورة
            $t->decimal('price_variance', 18, 4)->default(0);
            $t->timestamps();
        });

        Schema::create('landed_costs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('doc_no', 40);
            $t->date('doc_date');
            $t->foreignId('goods_receipt_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $t->string('cost_type', 40);  // freight|clearance|insurance|handling|other
            // value | qty | weight
            $t->string('allocation_method', 20)->default('value');
            $t->decimal('amount', 18, 4);
            // سياسة الأثر اللاحق على المبيعات السابقة
            $t->string('post_sale_policy', 30)->default('cogs_adjustment');
            $t->string('status', 20)->default('draft'); // draft|posted|cancelled
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'doc_no']);
        });

        Schema::create('landed_cost_allocations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('landed_cost_id')->constrained()->cascadeOnDelete();
            $t->foreignId('goods_receipt_line_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->decimal('allocated_amount', 18, 4);
            $t->decimal('to_inventory_amount', 18, 4)->default(0);
            $t->decimal('to_cogs_amount', 18, 4)->default(0);
            $t->timestamps();
        });

        Schema::create('purchase_returns', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('return_no', 40);
            $t->date('return_date');
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('supplier_invoice_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('goods_receipt_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 20)->default('draft');
            $t->decimal('subtotal', 18, 4)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->text('reason')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'return_no']);
        });

        Schema::create('purchase_return_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('purchase_return_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('supplier_invoice_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('unit_cost', 20, 6)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('line_total', 18, 4);
            $t->timestamps();
        });

        Schema::create('supplier_payments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('voucher_no', 40);
            $t->date('payment_date');
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            // cash | bank | cheque
            $t->string('payment_method', 20)->default('cash');
            $t->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('bank_account_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cheque_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('amount', 18, 4);
            $t->decimal('allocated_amount', 18, 4)->default(0);
            $t->string('status', 20)->default('draft'); // draft|posted|cancelled
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'voucher_no']);
        });

        Schema::create('supplier_payment_allocations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('supplier_payment_id')->constrained()->cascadeOnDelete();
            $t->foreignId('supplier_invoice_id')->constrained()->cascadeOnDelete();
            $t->decimal('amount', 18, 4);
            $t->timestamps();
            $t->unique(['supplier_payment_id', 'supplier_invoice_id']);
        });
    }

    public function down(): void
    {
        foreach ([
            'supplier_payment_allocations', 'supplier_payments', 'purchase_return_lines', 'purchase_returns',
            'landed_cost_allocations', 'landed_costs', 'supplier_invoice_lines', 'supplier_invoices',
            'goods_receipt_lines', 'goods_receipts', 'purchase_order_lines', 'purchase_orders',
            'supplier_quote_lines', 'supplier_quotes', 'purchase_request_lines', 'purchase_requests',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
