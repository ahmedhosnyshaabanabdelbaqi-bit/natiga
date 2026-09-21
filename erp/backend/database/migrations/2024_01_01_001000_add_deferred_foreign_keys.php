<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * المفاتيح الأجنبية المؤجلة (مراجع دائرية) + قيود سلامة إضافية.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('salesmen', function (Blueprint $t) {
            $t->foreign('warehouse_id')->references('id')->on('warehouses')->nullOnDelete();
            $t->foreign('custody_cash_box_id')->references('id')->on('cash_boxes')->nullOnDelete();
        });

        Schema::table('stock_serials', function (Blueprint $t) {
            $t->foreign('warehouse_id')->references('id')->on('warehouses')->nullOnDelete();
        });

        Schema::table('customer_prices', function (Blueprint $t) {
            $t->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::table('stock_transfers', function (Blueprint $t) {
            $t->foreign('load_order_id')->references('id')->on('load_orders')->nullOnDelete();
        });

        Schema::table('day_closures', function (Blueprint $t) {
            $t->foreign('variance_report_id')->references('id')->on('variance_reports')->nullOnDelete();
        });

        Schema::table('customer_receipts', function (Blueprint $t) {
            $t->foreign('day_closure_id')->references('id')->on('day_closures')->nullOnDelete();
        });

        Schema::table('commission_entries', function (Blueprint $t) {
            $t->foreign('settlement_id')->references('id')->on('commission_settlements')->nullOnDelete();
        });

        // --- قيود سلامة محاسبية ومخزنية ---

        // سطر القيد إما مدين أو دائن، وليس الاثنين، ولا سالبًا
        DB::statement("ALTER TABLE journal_lines ADD CONSTRAINT jl_debit_xor_credit CHECK (
            debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0)
        )");

        // القيد المرحل يجب أن يتوازن
        DB::statement("ALTER TABLE journal_entries ADD CONSTRAINT je_balanced CHECK (
            status <> 'posted' OR total_debit = total_credit
        )");

        // الكميات في الحركات موجبة دائمًا؛ الاتجاه يحدد الأثر
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT sm_qty_positive CHECK (qty_base > 0)");
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT sm_direction_valid CHECK (direction IN ('in','out'))");

        // معامل تحويل الوحدة موجب
        DB::statement("ALTER TABLE item_uoms ADD CONSTRAINT iu_factor_positive CHECK (factor > 0)");

        // الحجز لا يكون سالبًا
        DB::statement("ALTER TABLE stock_reservations ADD CONSTRAINT sr_qty_positive CHECK (qty_base > 0)");

        // التحصيل والإيداع بمبالغ موجبة
        DB::statement("ALTER TABLE customer_receipts ADD CONSTRAINT cr_amount_positive CHECK (amount > 0)");
        DB::statement("ALTER TABLE cash_deposits ADD CONSTRAINT cd_amount_positive CHECK (amount > 0)");

        // التحويل المخزني لا يكون من وإلى نفس المخزن
        DB::statement("ALTER TABLE stock_transfers ADD CONSTRAINT st_diff_warehouses CHECK (from_warehouse_id <> to_warehouse_id)");

        // الإيداع يذهب إلى خزنة أو بنك، أحدهما فقط
        DB::statement("ALTER TABLE cash_deposits ADD CONSTRAINT cd_one_destination CHECK (
            (to_cash_box_id IS NOT NULL AND to_bank_account_id IS NULL)
            OR (to_cash_box_id IS NULL AND to_bank_account_id IS NOT NULL)
        )");

        // المرتجع لا يتجاوز المباع (يُفحص أيضًا في طبقة الخدمة قبل الحفظ)
        DB::statement("ALTER TABLE sales_invoice_lines ADD CONSTRAINT sil_returned_within_sold CHECK (
            returned_qty_base >= 0 AND returned_qty_base <= qty_base
        )");

        // أمر البيع: المسلّم والمفوتر لا يتجاوزان المطلوب
        DB::statement("ALTER TABLE sales_order_lines ADD CONSTRAINT sol_progress_valid CHECK (
            delivered_qty_base >= 0 AND invoiced_qty_base >= 0
            AND delivered_qty_base <= qty_base AND invoiced_qty_base <= qty_base
        )");

        // أمر الشراء: المستلم والمفوتر لا يتجاوزان المطلوب
        DB::statement("ALTER TABLE purchase_order_lines ADD CONSTRAINT pol_progress_valid CHECK (
            received_qty_base >= 0 AND invoiced_qty_base >= 0
        )");

        // منع ربط مستندات شركات مختلفة: فهارس مركّبة تدعم قيود التطبيق
        DB::statement("CREATE INDEX IF NOT EXISTS si_company_status_idx ON sales_invoices (company_id, status)");
        DB::statement("CREATE INDEX IF NOT EXISTS so_company_status_idx ON sales_orders (company_id, status, delivery_status, invoice_status)");
        DB::statement("CREATE INDEX IF NOT EXISTS sb_positive_idx ON stock_balances (company_id, item_id, warehouse_id) WHERE qty_base > 0");
        DB::statement("CREATE INDEX IF NOT EXISTS sr_active_idx ON stock_reservations (company_id, item_id, warehouse_id) WHERE status = 'active'");
    }

    public function down(): void
    {
        foreach ([
            ['journal_lines', 'jl_debit_xor_credit'],
            ['journal_entries', 'je_balanced'],
            ['stock_movements', 'sm_qty_positive'],
            ['stock_movements', 'sm_direction_valid'],
            ['item_uoms', 'iu_factor_positive'],
            ['stock_reservations', 'sr_qty_positive'],
            ['customer_receipts', 'cr_amount_positive'],
            ['cash_deposits', 'cd_amount_positive'],
            ['stock_transfers', 'st_diff_warehouses'],
            ['cash_deposits', 'cd_one_destination'],
            ['sales_invoice_lines', 'sil_returned_within_sold'],
            ['sales_order_lines', 'sol_progress_valid'],
            ['purchase_order_lines', 'pol_progress_valid'],
        ] as [$table, $constraint]) {
            DB::statement("ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$constraint}");
        }
    }
};
