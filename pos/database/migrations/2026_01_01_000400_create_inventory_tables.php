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
        /*
         * The reference ledger. Quantities are signed and always expressed in
         * the product's BASE unit so that a carton and a piece are comparable.
         * Nothing in this system edits a balance without writing a row here.
         */
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->uuid('uuid')->unique();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_unit_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('qty', 18, 4);              // entered quantity, in product_unit
            $table->decimal('qty_base', 18, 4);         // signed: + in, - out
            $table->decimal('unit_cost', 18, 6)->default(0);
            $table->decimal('total_cost', 18, 4)->default(0);
            $table->decimal('balance_after', 18, 4)->default(0);
            $table->decimal('avg_cost_after', 18, 6)->default(0);
            // sale|sale_return|purchase_receipt|purchase_return|transfer_out|
            // transfer_in|stocktake|adjustment|opening|damage|bundle_consume
            $table->string('reason', 30);
            $table->string('source_type', 80)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->unsignedBigInteger('source_line_id')->nullable();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('serial_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->text('note')->nullable();
            $table->timestamp('occurred_at')->useCurrent();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['warehouse_id', 'variant_id', 'occurred_at'], 'stock_movements_wh_variant_time');
            $table->index(['source_type', 'source_id']);
            $table->index(['reason', 'occurred_at']);
            $table->index('occurred_at');
        });
        DB::statement('ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_qty_not_zero CHECK (qty_base <> 0)');

        /* Derived, rebuildable projection of the ledger above. */
        Schema::create('stock_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->decimal('qty_on_hand', 18, 4)->default(0);
            $table->decimal('qty_reserved', 18, 4)->default(0);
            $table->decimal('avg_cost', 18, 6)->default(0);
            $table->timestamp('last_movement_at')->nullable();
            $table->timestamps();

            $table->unique(['warehouse_id', 'variant_id']);
            $table->index(['variant_id']);
        });
        DB::statement('ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_reserved_non_negative CHECK (qty_reserved >= 0)');

        Schema::create('stock_reservations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->decimal('qty_base', 18, 4);
            $table->string('source_type', 80)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 20)->default('active'); // active|released|consumed|expired
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['warehouse_id', 'variant_id', 'status']);
            $table->index(['status', 'expires_at']);
        });
        DB::statement('ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_qty_positive CHECK (qty_base > 0)');

        Schema::create('stock_transfers', function (Blueprint $table) {
            $table->id();
            $table->string('number', 40)->unique();
            $table->foreignId('from_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('to_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            // draft|sent|partially_received|received|cancelled
            $table->string('status', 25)->default('draft');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
        DB::statement('ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_distinct_warehouses CHECK (from_warehouse_id <> to_warehouse_id)');

        Schema::create('stock_transfer_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_transfer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->restrictOnDelete();
            $table->foreignId('product_unit_id')->constrained()->restrictOnDelete();
            $table->decimal('qty_sent_base', 18, 4)->default(0);
            $table->decimal('qty_received_base', 18, 4)->default(0);
            $table->decimal('unit_cost', 18, 6)->default(0);
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
        DB::statement('ALTER TABLE stock_transfer_lines ADD CONSTRAINT transfer_lines_received_not_over_sent CHECK (qty_received_base <= qty_sent_base)');

        Schema::create('stocktakes', function (Blueprint $table) {
            $table->id();
            $table->string('number', 40)->unique();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->string('scope', 20)->default('full'); // full|partial
            $table->string('status', 20)->default('draft'); // draft|counting|review|posted|cancelled
            $table->jsonb('filters')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('stocktake_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stocktake_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->restrictOnDelete();
            // Balance frozen when counting started.
            $table->decimal('snapshot_qty', 18, 4)->default(0);
            $table->decimal('counted_qty', 18, 4)->nullable();
            // Sales/receipts that happened WHILE counting; added back before variance.
            $table->decimal('movement_delta_qty', 18, 4)->default(0);
            $table->decimal('variance_qty', 18, 4)->default(0);
            $table->decimal('unit_cost', 18, 6)->default(0);
            $table->foreignId('counted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('counted_at')->nullable();
            $table->timestamps();

            $table->unique(['stocktake_id', 'variant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stocktake_lines');
        Schema::dropIfExists('stocktakes');
        Schema::dropIfExists('stock_transfer_lines');
        Schema::dropIfExists('stock_transfers');
        Schema::dropIfExists('stock_reservations');
        Schema::dropIfExists('stock_balances');
        Schema::dropIfExists('stock_movements');
    }
};
