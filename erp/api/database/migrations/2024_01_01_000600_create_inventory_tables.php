<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The stock engine.
 *
 *  stock_balances   — current position, one row per (warehouse, item, batch, bin).
 *                     Guarded by CHECK constraints so negative stock is
 *                     impossible at the storage layer, not just in the UI.
 *  stock_movements  — append-only ledger. Every row carries the unit cost that
 *                     applied at the moment it happened, so an old invoice's
 *                     margin never changes when a new purchase price arrives.
 *  stock_reservations — soft holds that make `available = on_hand - reserved`.
 *  item_costs       — moving weighted average, one row per (company, item).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_balances', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('bin_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('qty_on_hand', 18, 4)->default(0);
            $t->decimal('qty_reserved', 18, 4)->default(0);
            $t->timestamps();
            $t->index(['company_id', 'item_id']);
            $t->index(['warehouse_id', 'item_id']);
        });

        // Partial unique indexes: NULL batch/bin must still collapse to one row.
        DB::statement("CREATE UNIQUE INDEX stock_balances_uniq ON stock_balances
            (warehouse_id, item_id, COALESCE(batch_id, 0), COALESCE(bin_id, 0))");
        DB::statement('ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_on_hand_non_negative
            CHECK (qty_on_hand >= 0)');
        DB::statement('ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_reserved_non_negative
            CHECK (qty_reserved >= 0)');
        DB::statement('ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_reserved_le_on_hand
            CHECK (qty_reserved <= qty_on_hand)');

        Schema::create('stock_movements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('bin_id')->nullable()->constrained()->nullOnDelete();
            $t->string('direction', 3);                  // in|out
            $t->decimal('qty_base', 18, 4);              // always positive
            $t->decimal('unit_cost', 20, 8)->default(0);
            $t->decimal('value', 18, 4)->default(0);     // qty_base * unit_cost
            $t->decimal('balance_after', 18, 4)->nullable();
            $t->string('doc_type', 48);
            $t->unsignedBigInteger('doc_id');
            $t->unsignedBigInteger('doc_line_id')->nullable();
            $t->string('reason', 48)->nullable();
            $t->timestamp('moved_at');
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['company_id', 'item_id', 'moved_at']);
            $t->index(['warehouse_id', 'item_id', 'moved_at']);
            $t->index(['doc_type', 'doc_id']);
        });
        DB::statement('ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_qty_positive
            CHECK (qty_base > 0)');
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_direction
            CHECK (direction IN ('in','out'))");

        Schema::create('stock_reservations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('qty_base', 18, 4);
            $t->string('doc_type', 48);
            $t->unsignedBigInteger('doc_id');
            $t->unsignedBigInteger('doc_line_id')->nullable();
            $t->string('status', 16)->default('active'); // active|consumed|released|expired
            $t->timestamp('expires_at')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'item_id', 'status']);
            $t->index(['doc_type', 'doc_id']);
        });

        Schema::create('item_costs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->decimal('qty_on_hand', 18, 4)->default(0);
            $t->decimal('avg_cost', 20, 8)->default(0);
            $t->decimal('total_value', 18, 4)->default(0);
            $t->decimal('last_purchase_cost', 20, 8)->default(0);
            $t->timestamps();
            $t->unique(['company_id', 'item_id']);
        });

        Schema::create('stock_transfers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->foreignId('from_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $t->foreignId('to_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $t->foreignId('transit_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $t->date('transfer_date');
            $t->string('purpose', 32)->default('transfer'); // transfer|van_load|van_return|return_to_supplier
            $t->string('status', 24)->default('draft');     // draft|issued|in_transit|partially_received|received|cancelled
            $t->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('issued_at')->nullable();
            $t->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('received_at')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'status']);
        });

        Schema::create('stock_transfer_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stock_transfer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('qty_input', 18, 4);
            $t->decimal('qty_base', 18, 4);
            $t->decimal('qty_received_base', 18, 4)->default(0);
            $t->decimal('qty_shortage_base', 18, 4)->default(0);
            $t->decimal('unit_cost', 20, 8)->default(0);
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index('stock_transfer_id');
        });

        Schema::create('stock_counts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->string('code', 48);
            $t->date('count_date');
            $t->string('kind', 16)->default('cycle');  // full|cycle|blind
            $t->boolean('is_blind')->default(true);
            $t->boolean('freeze_movements')->default(false);
            $t->string('status', 16)->default('draft'); // draft|counting|submitted|approved|cancelled
            $t->timestamp('started_at')->nullable();
            $t->timestamp('closed_at')->nullable();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('stock_count_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stock_count_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('bin_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('system_qty', 18, 4)->default(0);   // snapshot at submission
            $t->decimal('counted_qty', 18, 4)->nullable();
            $t->decimal('movement_qty', 18, 4)->default(0); // movements during the count
            $t->decimal('variance_qty', 18, 4)->default(0);
            $t->decimal('unit_cost', 20, 8)->default(0);
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index('stock_count_id');
        });

        Schema::create('stock_adjustments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $t->string('code', 48);
            $t->date('adjustment_date');
            $t->string('reason', 48); // count_variance|damage|expiry|opening|other
            $t->string('status', 16)->default('draft'); // draft|pending_approval|posted|cancelled
            $t->foreignId('stock_count_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->unsignedBigInteger('journal_entry_id')->nullable();
            $t->decimal('total_value', 18, 2)->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('stock_adjustment_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stock_adjustment_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('bin_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('qty_base', 18, 4);   // signed: + increase, - decrease
            $t->decimal('unit_cost', 20, 8)->default(0);
            $t->decimal('value', 18, 4)->default(0);
            $t->text('note')->nullable();
            $t->timestamps();
            $t->index('stock_adjustment_id');
        });
    }

    public function down(): void
    {
        foreach (['stock_adjustment_lines', 'stock_adjustments', 'stock_count_lines',
            'stock_counts', 'stock_transfer_lines', 'stock_transfers', 'item_costs',
            'stock_reservations', 'stock_movements', 'stock_balances'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
