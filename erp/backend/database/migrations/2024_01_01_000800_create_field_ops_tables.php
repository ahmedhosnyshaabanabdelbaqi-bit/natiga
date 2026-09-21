<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * العمليات الميدانية: التحميل، الزيارات، العهد، إقفال اليوم، المستهدفات والعمولات، المصروفات.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('load_orders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('load_no', 40);
            $t->date('load_date');
            $t->foreignId('salesman_id')->constrained()->restrictOnDelete();
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('driver_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('from_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $t->foreignId('to_warehouse_id')->constrained('warehouses')->restrictOnDelete(); // مخزن السيارة
            // draft | issued | loaded | closed | cancelled
            $t->string('status', 20)->default('draft');
            // initial | reload
            $t->string('load_type', 20)->default('initial');
            $t->foreignId('stock_transfer_id')->nullable()->constrained()->nullOnDelete();
            $t->string('issuer_signature_path')->nullable();
            $t->string('receiver_signature_path')->nullable();
            $t->decimal('total_cost', 18, 4)->default(0);
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('loaded_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'load_no']);
        });

        Schema::create('load_order_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('load_order_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('loaded_qty_base', 20, 6)->default(0);
            $t->decimal('unit_cost', 20, 6)->default(0);
            $t->timestamps();
        });

        // محضر تسليم عهدة السيارة عند تغيير السائق أو المندوب
        Schema::create('custody_handovers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('handover_no', 40);
            $t->date('handover_date');
            $t->string('custody_type', 20); // goods | cash
            $t->foreignId('from_salesman_id')->nullable()->constrained('salesmen')->nullOnDelete();
            $t->foreignId('to_salesman_id')->nullable()->constrained('salesmen')->nullOnDelete();
            $t->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('cash_amount', 18, 4)->default(0);
            $t->string('status', 20)->default('draft'); // draft|approved|posted
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'handover_no']);
        });

        Schema::create('visit_plans', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('salesman_id')->constrained()->cascadeOnDelete();
            $t->foreignId('route_id')->nullable()->constrained()->nullOnDelete();
            $t->date('plan_date');
            $t->string('frequency', 20)->default('daily'); // daily|weekly|monthly
            $t->string('status', 20)->default('planned');  // planned|active|closed
            $t->timestamps();
            $t->unique(['company_id', 'salesman_id', 'plan_date']);
        });

        Schema::create('visit_plan_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('visit_plan_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('sequence')->default(1);
            $t->string('status', 20)->default('planned'); // planned|visited|skipped
            $t->timestamps();
            $t->unique(['visit_plan_id', 'customer_id']);
        });

        Schema::create('visits', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('salesman_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('visit_plan_id')->nullable()->constrained()->nullOnDelete();
            $t->date('visit_date');
            $t->timestamp('started_at')->nullable();
            $t->timestamp('ended_at')->nullable();
            // order | collection | return | closed | no_purchase | not_visited
            $t->string('result', 30)->nullable();
            $t->string('no_purchase_reason', 120)->nullable();
            $t->boolean('is_planned')->default(true);
            $t->decimal('start_latitude', 10, 7)->nullable();
            $t->decimal('start_longitude', 10, 7)->nullable();
            $t->decimal('gps_accuracy_m', 10, 2)->nullable();
            $t->boolean('gps_available')->default(true);
            $t->text('notes')->nullable();
            $t->uuid('client_uuid')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'salesman_id', 'visit_date']);
            $t->unique(['company_id', 'client_uuid']);
        });

        // آخر موقع معروف — مع وقته ودقته، ليس موقعًا لحظيًا
        Schema::create('salesman_locations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('salesman_id')->constrained()->cascadeOnDelete();
            $t->decimal('latitude', 10, 7);
            $t->decimal('longitude', 10, 7);
            $t->decimal('accuracy_m', 10, 2)->nullable();
            $t->timestamp('recorded_at');
            $t->timestamp('received_at')->useCurrent();
            $t->boolean('during_shift')->default(true);
            $t->timestamps();
            $t->index(['company_id', 'salesman_id', 'recorded_at']);
        });

        Schema::create('day_closures', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('closure_no', 40);
            $t->foreignId('salesman_id')->constrained()->cascadeOnDelete();
            $t->date('closure_date');
            $t->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();
            // open | pending_sync | counted | pending_approval | closed | reopened
            $t->string('status', 20)->default('open');
            // --- معادلة البضاعة (بالقيمة) ---
            $t->decimal('goods_opening_value', 18, 4)->default(0);
            $t->decimal('goods_loaded_value', 18, 4)->default(0);
            $t->decimal('goods_returns_in_value', 18, 4)->default(0);
            $t->decimal('goods_sold_value', 18, 4)->default(0);
            $t->decimal('goods_bonus_value', 18, 4)->default(0);
            $t->decimal('goods_returned_to_wh_value', 18, 4)->default(0);
            $t->decimal('goods_transfer_out_value', 18, 4)->default(0);
            $t->decimal('goods_damaged_value', 18, 4)->default(0);
            $t->decimal('goods_expected_value', 18, 4)->default(0);
            $t->decimal('goods_actual_value', 18, 4)->default(0);
            $t->decimal('goods_variance_value', 18, 4)->default(0);
            // --- معادلة النقدية ---
            $t->decimal('cash_opening', 18, 4)->default(0);
            $t->decimal('cash_collected', 18, 4)->default(0);
            $t->decimal('cash_custody_received', 18, 4)->default(0);
            $t->decimal('cash_deposited', 18, 4)->default(0);
            $t->decimal('cash_expenses', 18, 4)->default(0);
            $t->decimal('cash_refunds', 18, 4)->default(0);
            $t->decimal('cash_expected', 18, 4)->default(0);
            $t->decimal('cash_actual', 18, 4)->default(0);
            $t->decimal('cash_variance', 18, 4)->default(0);
            // مبالغ لا تدخل نقدية المندوب
            $t->decimal('bank_transfers_amount', 18, 4)->default(0);
            $t->decimal('cheques_amount', 18, 4)->default(0);
            // اكتمال المزامنة
            $t->unsignedInteger('pending_sync_ops')->default(0);
            $t->boolean('sync_complete')->default(false);
            $t->boolean('sync_exception_granted')->default(false);
            $t->foreignId('sync_exception_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('sync_exception_reason')->nullable();
            $t->foreignId('inventory_count_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('variance_report_id')->nullable();
            $t->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('closed_at')->nullable();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reopened_at')->nullable();
            $t->text('reopen_reason')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'salesman_id', 'closure_date']);
            $t->unique(['company_id', 'closure_no']);
        });

        // محضر العجز والزيادة — يحتاج اعتمادًا ولا يُخصم تلقائيًا من الراتب
        Schema::create('variance_reports', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('report_no', 40);
            $t->foreignId('day_closure_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('variance_type', 20); // cash | goods
            $t->decimal('amount', 18, 4);
            $t->string('direction', 10);     // shortage | excess
            $t->text('explanation')->nullable();
            // pending | approved | rejected | settled
            $t->string('status', 20)->default('pending');
            // write_off | recover_from_employee | pending_investigation
            $t->string('resolution', 40)->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->timestamps();
            $t->unique(['company_id', 'report_no']);
        });

        // حركة عهدة النقدية للمندوب (إيداع للخزنة/البنك)
        Schema::create('cash_deposits', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('deposit_no', 40);
            $t->date('deposit_date');
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('from_cash_box_id')->constrained('cash_boxes')->restrictOnDelete();
            $t->foreignId('to_cash_box_id')->nullable()->constrained('cash_boxes')->nullOnDelete();
            $t->foreignId('to_bank_account_id')->nullable()->constrained('bank_accounts')->nullOnDelete();
            $t->decimal('amount', 18, 4);
            // draft | pending_approval | posted | cancelled
            $t->string('status', 20)->default('draft');
            $t->string('reference_no', 60)->nullable();
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('day_closure_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('posted_at')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'deposit_no']);
        });

        Schema::create('expenses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('expense_no', 40);
            $t->date('expense_date');
            $t->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            // fuel|maintenance|loading|transport|road|rent|wages|other
            $t->string('category', 40)->default('other');
            $t->decimal('amount', 18, 4);
            // cash_box | bank | salesman_custody
            $t->string('paid_from', 30)->default('cash_box');
            $t->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('bank_account_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('day_closure_id')->nullable()->constrained()->nullOnDelete();
            // draft | pending_approval | approved | posted | rejected | cancelled
            $t->string('status', 20)->default('draft');
            $t->boolean('is_recurring')->default(false);
            $t->string('recurrence', 20)->nullable();
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->text('description')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'expense_no']);
        });

        Schema::create('targets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            // salesman | supervisor | region | branch
            $t->string('scope_type', 20);
            $t->unsignedBigInteger('scope_id');
            // value | qty | profit | collection | active_customers | productive_visits
            $t->string('metric', 30);
            $t->date('period_start');
            $t->date('period_end');
            $t->decimal('target_value', 18, 4);
            $t->decimal('achieved_value', 18, 4)->default(0);
            $t->timestamp('calculated_at')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'scope_type', 'scope_id', 'period_start'], 'targets_scope_idx');
        });

        Schema::create('commission_rules', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->unsignedSmallInteger('version')->default(1);
            // sales | collection | delivery
            $t->string('role_type', 20)->default('sales');
            // net_sales | collections | realized_profit
            $t->string('base', 30)->default('net_sales');
            // نطاق التطبيق
            $t->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('category_id')->nullable()->constrained('item_categories')->nullOnDelete();
            $t->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('share_pct', 9, 4)->default(100); // تقسيم العمولة دون تكرارها
            $t->boolean('exclude_tax')->default(true);
            $t->boolean('deduct_returns')->default(true);
            $t->boolean('require_collection')->default(false);
            $t->date('valid_from');
            $t->date('valid_to')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code', 'version']);
        });

        Schema::create('commission_rule_tiers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('commission_rule_id')->constrained()->cascadeOnDelete();
            $t->decimal('from_amount', 18, 4)->default(0);
            $t->decimal('to_amount', 18, 4)->nullable();
            $t->decimal('min_margin_pct', 9, 4)->nullable();
            $t->decimal('rate_pct', 9, 4)->default(0);
            $t->decimal('fixed_amount', 18, 4)->default(0);
            $t->timestamps();
        });

        Schema::create('commission_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('salesman_id')->constrained()->cascadeOnDelete();
            $t->foreignId('commission_rule_id')->nullable()->constrained()->nullOnDelete();
            $t->unsignedSmallInteger('rule_version')->default(1);
            $t->string('source_type', 60);  // sales_invoice | customer_receipt | sales_return
            $t->unsignedBigInteger('source_id');
            $t->string('source_no', 60)->nullable();
            $t->date('entry_date');
            $t->decimal('base_amount', 18, 4)->default(0);
            $t->decimal('rate_pct', 9, 4)->default(0);
            $t->decimal('amount', 18, 4)->default(0);
            // estimated | earned | settled | reversed
            $t->string('status', 20)->default('estimated');
            $t->unsignedBigInteger('settlement_id')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'salesman_id', 'entry_date']);
            $t->unique(['company_id', 'source_type', 'source_id', 'salesman_id', 'commission_rule_id'], 'ce_source_unique');
        });

        Schema::create('commission_settlements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('settlement_no', 40);
            $t->foreignId('salesman_id')->constrained()->cascadeOnDelete();
            $t->date('period_start');
            $t->date('period_end');
            $t->decimal('total_amount', 18, 4)->default(0);
            $t->string('status', 20)->default('draft'); // draft|approved|paid
            $t->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['company_id', 'settlement_no']);
        });
    }

    public function down(): void
    {
        foreach ([
            'commission_settlements', 'commission_entries', 'commission_rule_tiers', 'commission_rules',
            'targets', 'expenses', 'cash_deposits', 'variance_reports', 'day_closures',
            'salesman_locations', 'visits', 'visit_plan_lines', 'visit_plans',
            'custody_handovers', 'load_order_lines', 'load_orders',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
