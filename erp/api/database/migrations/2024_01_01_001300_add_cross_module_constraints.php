<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Foreign keys that point across module boundaries. They live here so each
 * module migration stays independently readable and the create order stays
 * simple.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $t) {
            $t->foreign('price_list_id')->references('id')->on('price_lists')->nullOnDelete();
            $t->foreign('gl_account_id')->references('id')->on('accounts')->nullOnDelete();
        });

        Schema::table('suppliers', function (Blueprint $t) {
            $t->foreign('gl_account_id')->references('id')->on('accounts')->nullOnDelete();
        });

        Schema::table('batches', function (Blueprint $t) {
            $t->foreign('supplier_id')->references('id')->on('suppliers')->nullOnDelete();
        });

        Schema::table('warehouses', function (Blueprint $t) {
            $t->foreign('keeper_user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('cash_boxes', function (Blueprint $t) {
            $t->foreign('keeper_user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('settings', function (Blueprint $t) {
            $t->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('receipts', function (Blueprint $t) {
            $t->foreign('visit_id')->references('id')->on('visits')->nullOnDelete();
        });

        Schema::table('day_closings', function (Blueprint $t) {
            $t->foreign('variance_adjustment_id')->references('id')->on('stock_adjustments')->nullOnDelete();
        });

        // Documents → their journal entry.
        $journalRefs = [
            'goods_receipts', 'supplier_invoices', 'purchase_returns', 'landed_costs',
            'sales_invoices', 'sales_returns', 'stock_adjustments', 'receipts',
            'payments', 'cash_transfers', 'expenses', 'cheques', 'custody_handovers',
            'commission_entries',
        ];
        foreach ($journalRefs as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->foreign('journal_entry_id')->references('id')->on('journal_entries')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        $journalRefs = [
            'goods_receipts', 'supplier_invoices', 'purchase_returns', 'landed_costs',
            'sales_invoices', 'sales_returns', 'stock_adjustments', 'receipts',
            'payments', 'cash_transfers', 'expenses', 'cheques', 'custody_handovers',
            'commission_entries',
        ];
        foreach ($journalRefs as $table) {
            Schema::table($table, fn (Blueprint $t) => $t->dropForeign([$table.'_journal_entry_id_foreign']));
        }
        Schema::table('day_closings', fn (Blueprint $t) => $t->dropForeign(['variance_adjustment_id']));
        Schema::table('receipts', fn (Blueprint $t) => $t->dropForeign(['visit_id']));
        Schema::table('settings', fn (Blueprint $t) => $t->dropForeign(['updated_by']));
        Schema::table('cash_boxes', fn (Blueprint $t) => $t->dropForeign(['keeper_user_id']));
        Schema::table('warehouses', fn (Blueprint $t) => $t->dropForeign(['keeper_user_id']));
        Schema::table('batches', fn (Blueprint $t) => $t->dropForeign(['supplier_id']));
        Schema::table('suppliers', fn (Blueprint $t) => $t->dropForeign(['gl_account_id']));
        Schema::table('customers', function (Blueprint $t) {
            $t->dropForeign(['price_list_id']);
            $t->dropForeign(['gl_account_id']);
        });
    }
};
