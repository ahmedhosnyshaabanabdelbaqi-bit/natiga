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
        Schema::create('payment_methods', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->string('name_en')->nullable();
            // cash | card | wallet | transfer | credit | voucher
            $table->string('type', 20);
            // Only cash-like methods move the physical drawer.
            $table->boolean('affects_drawer')->default(false);
            $table->boolean('allows_change')->default(false);
            $table->boolean('requires_reference')->default(false);
            $table->boolean('allowed_offline')->default(false);
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->foreignId('cash_account_id')->nullable();
            $table->timestamps();
        });

        Schema::create('cash_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->string('type', 20)->default('drawer'); // drawer|safe|bank
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->string('currency', 3)->default('EGP');
            $table->decimal('opening_balance', 18, 4)->default(0);
            $table->decimal('balance', 18, 4)->default(0); // projection of cash_movements
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('payment_methods', function (Blueprint $table) {
            $table->foreign('cash_account_id')->references('id')->on('cash_accounts')->nullOnDelete();
        });

        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->string('number', 40)->unique();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->foreignId('terminal_id')->constrained()->restrictOnDelete();
            $table->foreignId('cash_account_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->decimal('opening_float', 18, 4)->default(0);
            $table->decimal('expected_cash', 18, 4)->default(0);
            $table->decimal('counted_cash', 18, 4)->nullable();
            $table->decimal('variance', 18, 4)->nullable();
            $table->jsonb('denominations')->nullable();
            $table->boolean('blind_count')->default(true);
            // open | closing | closed | reconciled
            $table->string('status', 20)->default('open');
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('unsynced_operations_at_close')->default(0);
            $table->text('closing_notes')->nullable();
            $table->jsonb('totals')->nullable(); // frozen close-out report
            $table->timestamps();

            $table->index(['terminal_id', 'status']);
            $table->index(['branch_id', 'opened_at']);
        });
        // One open shift per drawer: overlapping shifts on the same cash drawer
        // would make the expected-cash calculation meaningless.
        DB::statement("CREATE UNIQUE INDEX shifts_one_open_per_drawer ON shifts (cash_account_id) WHERE status IN ('open','closing')");
        DB::statement("CREATE UNIQUE INDEX shifts_one_open_per_terminal ON shifts (terminal_id) WHERE status IN ('open','closing')");

        Schema::create('cash_movements', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('cash_account_id')->constrained()->restrictOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            /*
             * opening_float | sale_cash | change_out | collection | refund |
             * expense | deposit | withdrawal | transfer_in | transfer_out |
             * adjustment | closing_count
             *
             * `sale_cash` records the gross amount handed over and `change_out`
             * the change returned, so the net is never double counted and the
             * cashier's tender is auditable.
             */
            $table->string('type', 25);
            $table->decimal('amount', 18, 4); // signed: + into drawer, - out
            $table->string('source_type', 80)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('approval_id')->nullable()->constrained()->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('occurred_at')->useCurrent();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['shift_id', 'type']);
            $table->index(['cash_account_id', 'occurred_at']);
            $table->index(['source_type', 'source_id']);
        });
        DB::statement('ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_amount_not_zero CHECK (amount <> 0)');

        Schema::create('drawer_openings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shift_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('approval_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reason', 120);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('expense_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('account_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->string('number', 40)->unique();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('expense_category_id')->constrained()->restrictOnDelete();
            $table->foreignId('cash_account_id')->constrained()->restrictOnDelete();
            $table->decimal('amount', 18, 4);
            $table->date('spent_on');
            $table->string('description')->nullable();
            $table->string('attachment_path')->nullable();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('approval_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['branch_id', 'spent_on']);
        });
        DB::statement('ALTER TABLE expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('expense_categories');
        Schema::dropIfExists('drawer_openings');
        Schema::dropIfExists('cash_movements');
        Schema::dropIfExists('shifts');
        Schema::table('payment_methods', function (Blueprint $table) {
            $table->dropForeign(['cash_account_id']);
        });
        Schema::dropIfExists('cash_accounts');
        Schema::dropIfExists('payment_methods');
    }
};
