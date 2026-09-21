<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Field operations: visit plans, visits, van loading, and the end-of-day close
 * that reconciles both the goods equation and the cash equation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('visit_plans', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('rep_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('route_id')->nullable()->constrained()->nullOnDelete();
            $t->date('plan_date');
            $t->string('status', 16)->default('planned'); // planned|active|closed
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['company_id', 'rep_id', 'plan_date']);
        });

        Schema::create('visit_plan_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('visit_plan_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('sequence')->default(1);
            $t->time('planned_at')->nullable();
            $t->string('objective', 64)->nullable();
            $t->string('status', 16)->default('pending'); // pending|visited|skipped
            $t->timestamps();
            $t->index('visit_plan_id');
        });

        Schema::create('visits', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('rep_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('visit_plan_line_id')->nullable()->constrained()->nullOnDelete();
            $t->date('business_date');
            $t->timestamp('started_at')->nullable();
            $t->timestamp('ended_at')->nullable();
            $t->string('outcome', 24)->nullable(); // order|collection|return|closed|no_purchase|survey
            $t->string('reason_code', 48)->nullable();
            $t->boolean('is_productive')->default(false);
            $t->decimal('gps_lat', 10, 7)->nullable();
            $t->decimal('gps_lng', 10, 7)->nullable();
            $t->decimal('gps_accuracy_m', 9, 2)->nullable();
            $t->boolean('is_unplanned')->default(false);
            $t->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $t->uuid('client_uuid')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'rep_id', 'business_date']);
            $t->index(['company_id', 'customer_id', 'business_date']);
        });

        /**
         * Location points are recorded only while a shift is explicitly active and
         * the rep granted permission. `retention_until` drives automatic purging.
         */
        Schema::create('rep_locations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('rep_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $t->timestamp('recorded_at');
            $t->decimal('lat', 10, 7);
            $t->decimal('lng', 10, 7);
            $t->decimal('accuracy_m', 9, 2)->nullable();
            $t->unsignedTinyInteger('battery_pct')->nullable();
            $t->boolean('shift_active')->default(true);
            $t->date('retention_until')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['company_id', 'rep_id', 'recorded_at']);
        });

        Schema::create('rep_shifts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('rep_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $t->date('business_date');
            $t->timestamp('started_at');
            $t->timestamp('ended_at')->nullable();
            $t->boolean('location_consent')->default(false);
            $t->timestamps();
            $t->index(['company_id', 'rep_id', 'business_date']);
        });

        /**
         * A van load moves goods into the van's own warehouse through a stock
         * transfer. It is never recorded as a sale.
         */
        Schema::create('van_loads', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->date('load_date');
            $t->foreignId('vehicle_id')->constrained()->restrictOnDelete();
            $t->foreignId('rep_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('from_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $t->foreignId('van_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $t->string('kind', 16)->default('load'); // load|reload|return|van_to_van
            $t->foreignId('counterpart_vehicle_id')->nullable()->constrained('vehicles')->nullOnDelete();
            $t->string('status', 24)->default('draft'); // draft|issued|received|closed|cancelled
            $t->foreignId('stock_transfer_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('issue_signature_path')->nullable();
            $t->string('receive_signature_path')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'load_date', 'rep_id']);
        });

        Schema::create('van_load_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('van_load_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('qty_received_base', 18, 4)->default(0);
            $t->decimal('unit_cost', 20, 8)->default(0);
            $t->boolean('scanned')->default(false);
            $t->timestamps();
            $t->index('van_load_id');
        });

        /** Custody handover when the rep or driver on a vehicle changes mid-cycle. */
        Schema::create('custody_handovers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->date('handover_date');
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('from_user_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('to_user_id')->constrained('users')->restrictOnDelete();
            $t->string('kind', 16)->default('goods'); // goods|cash|both
            $t->decimal('cash_amount', 18, 2)->default(0);
            $t->decimal('goods_value', 18, 2)->default(0);
            $t->foreignId('stock_transfer_id')->nullable()->constrained()->nullOnDelete();
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->string('status', 16)->default('draft');
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        /**
         * End-of-day reconciliation. Two independent equations, documented in
         * docs/03-inventory.md §6 and computed by DayClosingService:
         *
         *   goods: opening + loaded + transfers_in + customer_returns
         *          − sold − bonus − returned_to_wh − transfers_out − damaged
         *          = expected_qty
         *
         *   cash:  opening + cash_receipts + cash_custody_in
         *          − deposits − approved_cash_expenses − cash_refunds
         *          = expected_cash
         *
         * Bank transfers and cheques are deliberately absent from the cash side.
         */
        Schema::create('day_closings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->date('business_date');
            $t->foreignId('rep_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('van_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $t->string('status', 24)->default('draft'); // draft|submitted|approved|reopened|cancelled

            // Cash equation
            $t->decimal('cash_opening', 18, 2)->default(0);
            $t->decimal('cash_receipts', 18, 2)->default(0);
            $t->decimal('cash_custody_in', 18, 2)->default(0);
            $t->decimal('cash_deposits', 18, 2)->default(0);
            $t->decimal('cash_expenses', 18, 2)->default(0);
            $t->decimal('cash_refunds', 18, 2)->default(0);
            $t->decimal('expected_cash', 18, 2)->default(0);
            $t->decimal('actual_cash', 18, 2)->default(0);
            $t->decimal('cash_variance', 18, 2)->default(0);

            // Non-cash collections, tracked separately — never added to cash on hand
            $t->decimal('cheque_collections', 18, 2)->default(0);
            $t->decimal('bank_collections', 18, 2)->default(0);

            // Goods equation (valued)
            $t->decimal('goods_opening_value', 18, 2)->default(0);
            $t->decimal('goods_loaded_value', 18, 2)->default(0);
            $t->decimal('goods_sold_value', 18, 2)->default(0);
            $t->decimal('goods_bonus_value', 18, 2)->default(0);
            $t->decimal('goods_returned_value', 18, 2)->default(0);
            $t->decimal('goods_damaged_value', 18, 2)->default(0);
            $t->decimal('stock_variance_value', 18, 2)->default(0);

            // Sales summary for the day
            $t->decimal('sales_total', 18, 2)->default(0);
            $t->decimal('returns_total', 18, 2)->default(0);
            $t->unsignedInteger('visits_planned')->default(0);
            $t->unsignedInteger('visits_done')->default(0);
            $t->unsignedInteger('visits_productive')->default(0);

            $t->boolean('sync_complete')->default(false);
            $t->unsignedInteger('pending_sync_ops')->default(0);
            $t->foreignId('sync_override_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('sync_override_reason')->nullable();

            $t->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('submitted_at')->nullable();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reopened_at')->nullable();
            $t->text('reopen_reason')->nullable();
            $t->unsignedBigInteger('variance_adjustment_id')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'rep_id', 'business_date']);
            $t->index(['company_id', 'business_date', 'status']);
        });

        Schema::create('day_closing_stock_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('day_closing_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('opening_qty', 18, 4)->default(0);
            $t->decimal('loaded_qty', 18, 4)->default(0);
            $t->decimal('transfer_in_qty', 18, 4)->default(0);
            $t->decimal('customer_return_qty', 18, 4)->default(0);
            $t->decimal('sold_qty', 18, 4)->default(0);
            $t->decimal('bonus_qty', 18, 4)->default(0);
            $t->decimal('returned_to_wh_qty', 18, 4)->default(0);
            $t->decimal('transfer_out_qty', 18, 4)->default(0);
            $t->decimal('damaged_qty', 18, 4)->default(0);
            $t->decimal('expected_qty', 18, 4)->default(0);
            $t->decimal('counted_qty', 18, 4)->nullable();
            $t->decimal('variance_qty', 18, 4)->default(0);
            // Breakdown of what the expected quantity is made of
            $t->decimal('sellable_qty', 18, 4)->default(0);
            $t->decimal('reserved_qty', 18, 4)->default(0);
            $t->decimal('under_inspection_qty', 18, 4)->default(0);
            $t->decimal('unit_cost', 20, 8)->default(0);
            $t->timestamps();
            $t->index('day_closing_id');
        });
    }

    public function down(): void
    {
        foreach (['day_closing_stock_lines', 'day_closings', 'custody_handovers',
            'van_load_lines', 'van_loads', 'rep_shifts', 'rep_locations', 'visits',
            'visit_plan_lines', 'visit_plans'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
