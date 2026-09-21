<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * المخازن والحركات والأرصدة والحجوزات والجرد.
 * دفتر الحركات (stock_movements) هو مصدر الحقيقة؛ stock_balances مجمّع قابل للمطابقة معه.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 40);
            $t->string('name');
            // main | branch | van | transit | quarantine | damaged | returns
            $t->string('type', 20)->default('main');
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('keeper_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            // هل الرصيد في هذا المخزن قابل للبيع افتراضيًا
            $t->boolean('is_sellable')->default(true);
            $t->boolean('allow_negative')->default(false); // يُمنع دائمًا في التشغيل
            $t->text('address')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'type']);
        });

        Schema::create('warehouse_locations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $t->string('code', 40);
            $t->string('name')->nullable();
            $t->string('zone', 40)->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['warehouse_id', 'code']);
        });

        Schema::create('stock_batches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->string('batch_no', 60);
            $t->date('mfg_date')->nullable();
            $t->date('expiry_date')->nullable();
            $t->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $t->string('source_doc_type', 60)->nullable();
            $t->unsignedBigInteger('source_doc_id')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'item_id', 'batch_no']);
            $t->index(['item_id', 'expiry_date']);
        });

        Schema::create('stock_serials', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->string('serial_no', 80);
            $t->unsignedBigInteger('warehouse_id')->nullable();
            // in_stock | sold | returned | damaged
            $t->string('status', 20)->default('in_stock');
            $t->timestamps();
            $t->unique(['company_id', 'item_id', 'serial_no']);
        });

        Schema::create('stock_movements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('location_id')->nullable()->constrained('warehouse_locations')->nullOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            // available | inspection | quarantine | damaged | in_transit
            $t->string('status_bucket', 20)->default('available');
            $t->string('doc_type', 60);
            $t->unsignedBigInteger('doc_id');
            $t->unsignedBigInteger('doc_line_id')->nullable();
            $t->string('doc_no', 60)->nullable();
            // in | out
            $t->string('direction', 4);
            // الكمية دائمًا بالوحدة الأساسية، موجبة
            $t->decimal('qty_base', 20, 6);
            // معامل التحويل والوحدة كما كانت وقت المستند
            $t->foreignId('uom_id')->nullable()->constrained('uoms')->nullOnDelete();
            $t->decimal('uom_factor', 20, 6)->default(1);
            $t->decimal('qty_in_uom', 20, 6)->nullable();
            // تكلفة الحركة التاريخية — لا يُعاد حسابها لاحقًا
            $t->decimal('unit_cost', 20, 6)->default(0);
            $t->decimal('total_cost', 18, 4)->default(0);
            $t->date('movement_date');
            $t->timestamp('posted_at')->useCurrent();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('notes')->nullable();
            $t->index(['company_id', 'item_id', 'warehouse_id', 'movement_date'], 'sm_item_wh_date_idx');
            $t->index(['doc_type', 'doc_id']);
        });

        Schema::create('stock_balances', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $t->foreignId('location_id')->nullable()->constrained('warehouse_locations')->nullOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->string('status_bucket', 20)->default('available');
            $t->decimal('qty_base', 20, 6)->default(0);
            $t->decimal('total_value', 18, 4)->default(0);
            $t->timestamps();
        });
        // مفتاح فريد يتحمل NULL في location/batch — ضروري لقفل الصف وتحديثه
        DB::statement("CREATE UNIQUE INDEX stock_balances_key_unique ON stock_balances
            (company_id, item_id, warehouse_id, COALESCE(location_id, 0), COALESCE(batch_id, 0), status_bucket)");
        DB::statement("ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_non_negative CHECK (qty_base >= 0)");

        Schema::create('stock_reservations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->decimal('qty_base', 20, 6);
            $t->string('doc_type', 60);
            $t->unsignedBigInteger('doc_id');
            $t->unsignedBigInteger('doc_line_id')->nullable();
            // active | consumed | released | expired
            $t->string('status', 20)->default('active');
            $t->timestamp('expires_at')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['company_id', 'item_id', 'warehouse_id', 'status'], 'sr_item_wh_status_idx');
            $t->index(['doc_type', 'doc_id']);
        });

        // المتوسط المرجح المتحرك على مستوى الشركة والصنف
        Schema::create('item_costs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->decimal('qty_on_hand', 20, 6)->default(0);
            $t->decimal('total_value', 18, 4)->default(0);
            $t->decimal('avg_cost', 20, 6)->default(0);
            $t->string('method', 20)->default('moving_average');
            $t->timestamps();
            $t->unique(['company_id', 'item_id']);
        });

        Schema::create('item_cost_history', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->string('doc_type', 60);
            $t->unsignedBigInteger('doc_id');
            $t->decimal('qty_change', 20, 6);
            $t->decimal('value_change', 18, 4);
            $t->decimal('qty_after', 20, 6);
            $t->decimal('value_after', 18, 4);
            $t->decimal('avg_cost_before', 20, 6);
            $t->decimal('avg_cost_after', 20, 6);
            $t->timestamp('created_at')->useCurrent();
            $t->index(['company_id', 'item_id', 'created_at']);
        });

        Schema::create('stock_transfers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('transfer_no', 40);
            $t->date('transfer_date');
            $t->foreignId('from_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $t->foreignId('to_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            // draft | sent | partially_received | received | cancelled
            $t->string('status', 30)->default('draft');
            // van_load | van_return | inter_warehouse | van_to_van
            $t->string('purpose', 30)->default('inter_warehouse');
            $t->unsignedBigInteger('load_order_id')->nullable();
            $t->foreignId('driver_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('sent_at')->nullable();
            $t->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('received_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'transfer_no']);
        });

        Schema::create('stock_transfer_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stock_transfer_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('received_qty_base', 20, 6)->default(0);
            $t->decimal('shortage_qty_base', 20, 6)->default(0);
            $t->decimal('excess_qty_base', 20, 6)->default(0);
            $t->string('received_status_bucket', 20)->default('available');
            $t->timestamps();
        });

        Schema::create('stock_adjustments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('adjustment_no', 40);
            $t->date('adjustment_date');
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            // opening | damage | count_variance | reclassify | write_off
            $t->string('reason_type', 30);
            $t->string('status', 20)->default('draft'); // draft|pending_approval|posted|cancelled
            $t->text('reason')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            // فصل المنشئ عن المعتمد
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamp('posted_at')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'adjustment_no']);
        });

        Schema::create('stock_adjustment_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stock_adjustment_id')->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('line_no');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('uom_factor', 20, 6);
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->string('from_status_bucket', 20)->nullable();
            $t->string('to_status_bucket', 20)->nullable();
            $t->string('direction', 4); // in | out | move
            $t->decimal('qty_uom', 20, 6);
            $t->decimal('qty_base', 20, 6);
            $t->decimal('unit_cost', 20, 6)->default(0);
            $t->timestamps();
        });

        Schema::create('inventory_counts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('count_no', 40);
            $t->date('count_date');
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->string('type', 20)->default('full');  // full | cycle | van
            $t->boolean('is_blind')->default(true);   // جرد أعمى
            // draft | counting | frozen | reviewed | posted | cancelled
            $t->string('status', 20)->default('draft');
            $t->timestamp('frozen_at')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->foreignId('stock_adjustment_id')->nullable()->constrained()->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'count_no']);
        });

        Schema::create('inventory_count_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('inventory_count_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();
            $t->foreignId('location_id')->nullable()->constrained('warehouse_locations')->nullOnDelete();
            $t->string('status_bucket', 20)->default('available');
            // رصيد النظام لحظة التجميد
            $t->decimal('system_qty_base', 20, 6)->default(0);
            $t->decimal('counted_qty_base', 20, 6)->nullable();
            // حركات حدثت أثناء العد ويجب ضبطها
            $t->decimal('movement_during_count', 20, 6)->default(0);
            $t->decimal('variance_qty_base', 20, 6)->default(0);
            $t->decimal('unit_cost', 20, 6)->default(0);
            $t->decimal('variance_value', 18, 4)->default(0);
            $t->foreignId('counted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('counted_at')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach ([
            'inventory_count_lines', 'inventory_counts', 'stock_adjustment_lines', 'stock_adjustments',
            'stock_transfer_lines', 'stock_transfers', 'item_cost_history', 'item_costs',
            'stock_reservations', 'stock_balances', 'stock_movements', 'stock_serials', 'stock_batches',
            'warehouse_locations', 'warehouses',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
