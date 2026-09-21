<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * الأصناف والوحدات والباركود وقوائم الأسعار والعروض.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('uoms', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 30);
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            // count | weight | length | volume
            $t->string('dimension', 20)->default('count');
            $t->boolean('allow_fraction')->default(false);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('item_categories', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('item_categories')->nullOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('brands', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 40);
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 60);
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            $t->foreignId('category_id')->nullable()->constrained('item_categories')->nullOnDelete();
            $t->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $t->foreignId('base_uom_id')->constrained('uoms')->restrictOnDelete();
            $t->foreignId('tax_code_id')->nullable()->constrained('tax_codes')->nullOnDelete();
            // خصائص اختيارية تُفعّل حسب الصنف
            $t->boolean('track_batches')->default(false);
            $t->boolean('track_serials')->default(false);
            $t->boolean('track_expiry')->default(false);
            $t->boolean('is_reel')->default(false);      // بكرة/لفة بالمتر للأصناف الكهربائية
            $t->boolean('is_weighted')->default(false);  // بيع بالوزن
            $t->boolean('has_variants')->default(false); // ألوان/مقاسات
            $t->unsignedSmallInteger('shelf_life_days')->nullable();
            $t->unsignedSmallInteger('block_sale_days_before_expiry')->default(0);
            $t->decimal('reorder_point', 20, 6)->default(0);
            $t->decimal('reorder_qty', 20, 6)->default(0);
            $t->unsignedSmallInteger('lead_time_days')->default(0);
            $t->string('storage_condition', 60)->nullable();
            $t->string('image_path')->nullable();
            $t->jsonb('attributes')->nullable();
            $t->boolean('is_active')->default(true);
            $t->boolean('is_purchasable')->default(true);
            $t->boolean('is_sellable')->default(true);
            $t->timestamps();
            $t->softDeletes();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'name_ar']);
        });

        Schema::create('item_variants', function (Blueprint $t) {
            $t->id();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->string('sku', 60);
            $t->string('color', 60)->nullable();
            $t->string('size', 60)->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['item_id', 'sku']);
        });

        Schema::create('item_uoms', function (Blueprint $t) {
            $t->id();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            // عدد الوحدات الأساسية داخل هذه الوحدة (كرتونة = 12 قطعة => 12)
            $t->decimal('factor', 20, 6);
            $t->boolean('is_base')->default(false);
            $t->boolean('is_sales_default')->default(false);
            $t->boolean('is_purchase_default')->default(false);
            $t->timestamps();
            $t->unique(['item_id', 'uom_id']);
        });

        Schema::create('item_barcodes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_uom_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('item_variant_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('barcode', 80);
            $t->timestamps();
            $t->unique(['company_id', 'barcode']);
        });

        Schema::create('price_lists', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 40);
            $t->string('name');
            // wholesale | half_wholesale | retail | distributor | project
            $t->string('type', 30)->default('wholesale');
            $t->char('currency_code', 3)->default('EGP');
            $t->boolean('prices_include_tax')->default(false);
            $t->unsignedSmallInteger('priority')->default(100);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('price_list_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('price_list_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('min_qty', 20, 6)->default(0);    // شرائح كمية
            $t->decimal('price', 18, 4);
            $t->decimal('max_discount_pct', 9, 4)->default(0);
            $t->date('valid_from');
            $t->date('valid_to')->nullable();
            $t->timestamps();
            $t->index(['price_list_id', 'item_id', 'uom_id']);
        });

        // أسعار تعاقدية للعميل — أعلى أولوية
        Schema::create('customer_prices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('customer_id');
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('uom_id')->constrained()->restrictOnDelete();
            $t->decimal('min_qty', 20, 6)->default(0);
            $t->decimal('price', 18, 4);
            $t->date('valid_from');
            $t->date('valid_to')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'customer_id', 'item_id']);
        });

        Schema::create('promotions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 40);
            $t->string('name');
            // buy_x_get_y | line_discount_pct | invoice_discount_pct
            $t->string('type', 30);
            $t->date('valid_from');
            $t->date('valid_to')->nullable();
            $t->unsignedSmallInteger('priority')->default(100);
            $t->boolean('stackable')->default(false);   // منع تجميع خصومات غير مسموح بها
            $t->jsonb('conditions')->nullable();        // price_list_ids / customer_types / regions
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('promotion_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('promotion_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('category_id')->nullable()->constrained('item_categories')->cascadeOnDelete();
            $t->foreignId('buy_uom_id')->nullable()->constrained('uoms')->nullOnDelete();
            $t->decimal('buy_qty', 20, 6)->default(0);
            $t->foreignId('free_item_id')->nullable()->constrained('items')->nullOnDelete();
            $t->foreignId('free_uom_id')->nullable()->constrained('uoms')->nullOnDelete();
            $t->decimal('free_qty', 20, 6)->default(0);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach ([
            'promotion_lines', 'promotions', 'customer_prices', 'price_list_lines', 'price_lists',
            'item_barcodes', 'item_uoms', 'item_variants', 'items', 'brands', 'item_categories', 'uoms',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
