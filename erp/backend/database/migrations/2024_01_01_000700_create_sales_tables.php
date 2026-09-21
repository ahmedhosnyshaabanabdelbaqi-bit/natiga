<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * المبيعات: عرض سعر، أمر بيع، إذن تسليم، فاتورة، مرتجع، تحصيل.
 * حالة الطلب منفصلة عن التسليم والفوترة والتحصيل.
 * حدث واحد فقط مسؤول عن حركة البضاعة (stock_owner).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quotations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('quotation_no', 40);
            $t->date('quotation_date');
            $t->date('valid_until')->nullable();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('price_list_id')->nullable()->constrained()->nullOnDelete();
            // draft|sent|accepted|rejected|expired|converted
            $t->string('status', 20)->default('draft');
            $t->decimal('subtotal', 18, 4)->default(0);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['company_id', 'quotation_no']);
        });

        Schema::create('quotation_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('quotation_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->decimal('tax_rate', 9, 6)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('line_total', 18, 4);
            $t->timestamps();
        });

        Schema::create('sales_orders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('order_no', 40);
            $t->date('order_date');
            $t->date('required_date')->nullable();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('customer_address_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('price_list_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('quotation_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $t->string('customer_po_no', 60)->nullable();
            // presale | van_sale | counter | b2b_portal
            $t->string('channel', 20)->default('presale');
            $t->string('payment_type', 20)->default('credit'); // cash|credit|mixed
            $t->unsignedSmallInteger('payment_term_days')->default(0);
            // حالة الطلب
            $t->string('status', 30)->default('draft');            // draft|pending_approval|approved|closed|cancelled
            // حالات مستقلة
            $t->string('delivery_status', 30)->default('pending'); // pending|partial|delivered
            $t->string('invoice_status', 30)->default('pending');  // pending|partial|invoiced
            $t->string('payment_status', 30)->default('unpaid');   // unpaid|partial|paid
            $t->decimal('subtotal', 18, 4)->default(0);
            $t->decimal('line_discount_amount', 18, 4)->default(0);
            $t->decimal('header_discount_amount', 18, 4)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('delivery_fee', 18, 4)->default(0);
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->boolean('is_backorder_allowed')->default(true);
            $t->boolean('credit_override')->default(false);
            $t->foreignId('credit_override_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('credit_override_reason')->nullable();
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'order_no']);
            $t->index(['company_id', 'customer_id', 'order_date']);
            $t->index(['company_id', 'salesman_id', 'order_date']);
        });

        Schema::create('sales_order_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sales_order_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('reserved_qty_base', 20, 6)->default(0);
            $t->decimal('delivered_qty_base', 20, 6)->default(0);
            $t->decimal('invoiced_qty_base', 20, 6)->default(0);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->foreignId('tax_code_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('tax_rate', 9, 6)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('line_total', 18, 4);
            $t->boolean('is_free')->default(false);   // بونص/هدية
            $t->foreignId('promotion_id')->nullable()->constrained()->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('delivery_notes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('delivery_no', 40);
            $t->date('delivery_date');
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('sales_order_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('driver_user_id')->nullable()->constrained('users')->nullOnDelete();
            // draft|out_for_delivery|delivered|partially_delivered|failed|rescheduled|cancelled
            $t->string('status', 30)->default('draft');
            $t->string('receiver_name')->nullable();
            $t->string('signature_path')->nullable();
            $t->string('proof_code', 20)->nullable();
            $t->timestamp('delivered_at')->nullable();
            $t->text('failure_reason')->nullable();
            $t->date('rescheduled_to')->nullable();
            // هل هذا المستند هو مالك حركة المخزون (منع الخصم المزدوج)
            $t->boolean('is_stock_owner')->default(true);
            $t->boolean('is_invoiced')->default(false);
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'delivery_no']);
        });

        Schema::create('delivery_note_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('delivery_note_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('sales_order_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('delivered_qty_base', 20, 6)->default(0);
            $t->decimal('rejected_qty_base', 20, 6)->default(0);
            $t->decimal('invoiced_qty_base', 20, 6)->default(0);
            $t->decimal('unit_cost', 20, 6)->default(0);
            $t->text('rejection_reason')->nullable();
            $t->timestamps();
        });

        Schema::create('sales_invoices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('invoice_no', 40);
            // الرقم الميداني من جهاز المندوب — يختلف عن الرقم المركزي
            $t->string('field_no', 60)->nullable();
            $t->date('invoice_date');
            $t->date('due_date')->nullable();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('sales_order_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('delivery_note_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('price_list_id')->nullable()->constrained()->nullOnDelete();
            $t->string('channel', 20)->default('presale');
            $t->string('payment_type', 20)->default('credit');
            // draft | posted | partially_paid | paid | cancelled
            $t->string('status', 20)->default('draft');
            // هل الفاتورة هي مالكة حركة المخزون (بيع مباشر بلا إذن تسليم)
            $t->boolean('is_stock_owner')->default(true);
            $t->decimal('subtotal', 18, 4)->default(0);
            $t->decimal('line_discount_amount', 18, 4)->default(0);
            $t->decimal('header_discount_amount', 18, 4)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('delivery_fee', 18, 4)->default(0);
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->decimal('paid_amount', 18, 4)->default(0);
            $t->decimal('returned_amount', 18, 4)->default(0);
            $t->decimal('total_cost', 18, 4)->default(0);   // تكلفة المبيعات
            $t->char('currency_code', 3)->default('EGP');
            $t->decimal('exchange_rate', 18, 8)->default(1);
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cogs_journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            // نسخة ثابتة من بيانات وشروط المستند وقت الاعتماد
            $t->jsonb('snapshot')->nullable();
            // التكامل الضريبي (وحدة منفصلة)
            $t->string('etax_status', 30)->default('not_submitted');
            $t->string('etax_uuid', 100)->nullable();
            $t->jsonb('etax_response')->nullable();
            $t->unsignedSmallInteger('print_count')->default(0);
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('cancelled_at')->nullable();
            $t->text('cancel_reason')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'invoice_no']);
            $t->index(['company_id', 'customer_id', 'invoice_date']);
            $t->index(['company_id', 'salesman_id', 'invoice_date']);
        });

        Schema::create('sales_invoice_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sales_invoice_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('sales_order_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('delivery_note_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('returned_qty_base', 20, 6)->default(0);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->foreignId('tax_code_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('tax_rate', 9, 6)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('line_total', 18, 4);
            // التكلفة التاريخية وقت البيع — لا يُعاد حسابها
            $t->decimal('unit_cost', 20, 6)->default(0);
            $t->decimal('total_cost', 18, 4)->default(0);
            $t->boolean('is_free')->default(false);
            $t->foreignId('promotion_id')->nullable()->constrained()->nullOnDelete();
            $t->timestamps();
            $t->index('item_id');
        });

        Schema::create('sales_returns', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('return_no', 40);
            $t->string('field_no', 60)->nullable();
            $t->date('return_date');
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('sales_invoice_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            // بلا فاتورة = استثناء معتمد
            $t->boolean('without_invoice')->default(false);
            $t->foreignId('exception_approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('exception_reason')->nullable();
            // draft | received | inspected | posted | cancelled
            // الاستلام الفعلي منفصل عن الاعتماد المالي
            $t->string('status', 20)->default('draft');
            $t->timestamp('received_at')->nullable();
            $t->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $t->decimal('subtotal', 18, 4)->default(0);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->decimal('total_cost', 18, 4)->default(0);
            // credit_note | cash_refund
            $t->string('settlement_type', 20)->default('credit_note');
            $t->foreignId('refund_approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cogs_journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $t->text('reason')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'return_no']);
        });

        Schema::create('sales_return_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sales_return_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('sales_invoice_line_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('discount_amount', 18, 4)->default(0);
            $t->decimal('tax_rate', 9, 6)->default(0);
            $t->decimal('tax_amount', 18, 4)->default(0);
            $t->decimal('line_total', 18, 4);
            // التكلفة الأصلية للبيع
            $t->decimal('unit_cost', 20, 6)->default(0);
            $t->decimal('total_cost', 18, 4)->default(0);
            // saleable | inspection | damaged | to_supplier
            $t->string('condition', 20)->default('saleable');
            $t->string('target_status_bucket', 20)->default('available');
            $t->timestamps();
        });

        Schema::create('customer_receipts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('voucher_no', 40);
            $t->string('field_no', 60)->nullable();
            $t->date('receipt_date');
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            // cash | bank_transfer | cheque | card
            $t->string('payment_method', 20)->default('cash');
            // وجهة النقدية: عهدة المندوب أو خزنة مباشرة
            $t->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('bank_account_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cheque_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('amount', 18, 4);
            $t->decimal('allocated_amount', 18, 4)->default(0);
            // pending_sync | draft | posted | cancelled
            $t->string('status', 20)->default('draft');
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('day_closure_id')->nullable();
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'voucher_no']);
            $t->index(['company_id', 'customer_id', 'receipt_date']);
        });

        Schema::create('customer_receipt_allocations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_receipt_id')->constrained()->cascadeOnDelete();
            $t->foreignId('sales_invoice_id')->constrained()->cascadeOnDelete();
            $t->decimal('amount', 18, 4);
            $t->timestamps();
            $t->unique(['customer_receipt_id', 'sales_invoice_id']);
        });

        Schema::create('payment_promises', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->date('promised_date');
            $t->decimal('amount', 18, 4);
            $t->string('status', 20)->default('open'); // open|kept|broken|cancelled
            $t->text('notes')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach ([
            'payment_promises', 'customer_receipt_allocations', 'customer_receipts',
            'sales_return_lines', 'sales_returns', 'sales_invoice_lines', 'sales_invoices',
            'delivery_note_lines', 'delivery_notes', 'sales_order_lines', 'sales_orders',
            'quotation_lines', 'quotations',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
