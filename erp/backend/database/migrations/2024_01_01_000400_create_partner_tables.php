<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * الموردون والعملاء والمناطق وخطوط السير والسيارات والمناديب.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('regions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('regions')->nullOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('suppliers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $t->string('tax_number', 50)->nullable();
            $t->string('phone', 50)->nullable();
            $t->string('email')->nullable();
            $t->text('address')->nullable();
            $t->string('contact_person')->nullable();
            $t->unsignedSmallInteger('payment_term_days')->default(0);
            $t->unsignedSmallInteger('lead_time_days')->default(0);
            $t->decimal('opening_balance', 18, 4)->default(0);
            $t->unsignedTinyInteger('rating')->nullable();
            $t->boolean('is_active')->default(true);
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->softDeletes();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('item_suppliers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $t->string('supplier_item_code', 60)->nullable();
            $t->decimal('last_price', 18, 4)->nullable();
            $t->boolean('is_preferred')->default(false);
            $t->timestamps();
            $t->unique(['item_id', 'supplier_id']);
        });

        Schema::create('vehicles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 40);
            $t->string('plate_no', 40);
            $t->string('model')->nullable();
            $t->decimal('capacity_weight_kg', 18, 4)->nullable();
            $t->decimal('capacity_volume_m3', 18, 4)->nullable();
            $t->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $t->date('license_expiry')->nullable();
            $t->date('next_maintenance_date')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('vehicle_maintenance', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('vehicle_id')->constrained()->cascadeOnDelete();
            $t->date('service_date');
            $t->string('type', 40)->default('periodic');
            $t->decimal('cost', 18, 4)->default(0);
            $t->unsignedBigInteger('odometer')->nullable();
            $t->date('next_due_date')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('salesmen', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('supervisor_id')->nullable()->constrained('salesmen')->nullOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->string('phone', 50)->nullable();
            // presale | van_sale | collector | delivery  (يمكن الجمع عبر capabilities)
            $t->string('primary_role', 20)->default('van_sale');
            $t->jsonb('capabilities')->nullable();
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->unsignedBigInteger('warehouse_id')->nullable(); // مخزن السيارة
            $t->unsignedBigInteger('custody_cash_box_id')->nullable();
            $t->decimal('max_discount_pct', 9, 4)->default(0);
            $t->decimal('cash_custody_limit', 18, 4)->default(0);
            $t->decimal('commission_base_pct', 9, 4)->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('routes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('region_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('customers')->nullOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            // retail_shop | wholesaler | distributor | company | contractor | project | cash
            $t->string('business_type', 30)->default('retail_shop');
            $t->foreignId('region_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('route_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('salesman_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('price_list_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('default_discount_pct', 9, 4)->default(0);
            $t->unsignedSmallInteger('payment_term_days')->default(0);
            $t->decimal('credit_limit', 18, 4)->default(0);
            $t->boolean('credit_limit_enforced')->default(true);
            $t->decimal('opening_balance', 18, 4)->default(0);
            $t->boolean('is_cash_customer')->default(false);
            $t->boolean('is_blocked')->default(false);
            $t->text('block_reason')->nullable();
            $t->string('tax_number', 50)->nullable();
            $t->string('phone', 50)->nullable();
            $t->string('email')->nullable();
            $t->text('address')->nullable();
            $t->decimal('latitude', 10, 7)->nullable();
            $t->decimal('longitude', 10, 7)->nullable();
            // A|B|C تصنيف قابل للمراجعة
            $t->string('grade', 5)->nullable();
            $t->date('last_visit_date')->nullable();
            $t->date('last_sale_date')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->softDeletes();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'salesman_id']);
            $t->index(['company_id', 'name']);
        });

        Schema::create('customer_addresses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->string('label', 60);
            $t->text('address');
            $t->string('phone', 50)->nullable();
            $t->decimal('latitude', 10, 7)->nullable();
            $t->decimal('longitude', 10, 7)->nullable();
            $t->boolean('is_default')->default(false);
            $t->timestamps();
        });

        Schema::create('customer_contacts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('position', 60)->nullable();
            $t->string('phone', 50)->nullable();
            $t->string('email')->nullable();
            $t->timestamps();
        });

        // تاريخ إسناد العميل للمندوب — لا تُنسب مبيعات الماضي للمندوب الجديد
        Schema::create('customer_assignments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('salesman_id')->constrained()->cascadeOnDelete();
            $t->date('from_date');
            $t->date('to_date')->nullable();
            $t->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $t->text('reason')->nullable();
            $t->timestamps();
            $t->index(['customer_id', 'from_date']);
        });

        Schema::create('customer_complaints', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->string('complaint_no', 40);
            $t->string('subject');
            $t->text('body')->nullable();
            $t->string('status', 20)->default('open'); // open|in_progress|resolved|closed
            $t->string('priority', 20)->default('normal');
            $t->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('resolved_at')->nullable();
            $t->text('resolution')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'complaint_no']);
        });
    }

    public function down(): void
    {
        foreach ([
            'customer_complaints', 'customer_assignments', 'customer_contacts', 'customer_addresses',
            'customers', 'routes', 'salesmen', 'vehicle_maintenance', 'vehicles',
            'item_suppliers', 'suppliers', 'regions',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
