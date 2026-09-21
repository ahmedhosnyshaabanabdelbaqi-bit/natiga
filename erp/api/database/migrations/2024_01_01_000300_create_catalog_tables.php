<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Item master: categories, brands, units of measure with conversion factors,
 * barcodes, batches, serials and tax rates.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_rates', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->decimal('rate', 9, 4)->default(0);       // percent, e.g. 14.0000
            $t->string('kind', 24)->default('vat');       // vat|table_tax|withholding
            $t->date('valid_from');
            $t->date('valid_to')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code', 'valid_from']);
        });

        Schema::create('item_categories', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('item_categories')->nullOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('brands', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('units', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->string('kind', 16)->default('count'); // count|weight|length|volume
            $t->unsignedTinyInteger('decimals')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 48);
            $t->string('name');
            $t->string('name_en')->nullable();
            $t->foreignId('category_id')->nullable()->constrained('item_categories')->nullOnDelete();
            $t->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('base_unit_id')->constrained('units')->restrictOnDelete();
            $t->foreignId('tax_rate_id')->nullable()->constrained()->nullOnDelete();
            $t->boolean('is_taxable')->default(true);
            $t->boolean('track_batches')->default(false);
            $t->boolean('track_expiry')->default(false);
            $t->boolean('track_serials')->default(false);
            $t->boolean('is_weighted')->default(false);  // sold by weight/length (reel, roll, kg)
            $t->boolean('allow_partial_unit')->default(false);
            $t->decimal('reorder_point', 18, 4)->default(0);
            $t->decimal('reorder_qty', 18, 4)->default(0);
            $t->unsignedSmallInteger('lead_time_days')->default(0);
            $t->unsignedSmallInteger('shelf_life_days')->nullable();
            $t->unsignedSmallInteger('min_shelf_life_sale_days')->default(0);
            $t->decimal('default_sale_price', 18, 4)->default(0);
            $t->decimal('weight_kg', 18, 4)->nullable();
            $t->decimal('volume_m3', 18, 6)->nullable();
            $t->string('storage_conditions')->nullable();
            $t->string('image_path')->nullable();
            $t->string('status', 16)->default('active'); // active|suspended|discontinued
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->softDeletes();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'status']);
            $t->index(['company_id', 'category_id']);
        });

        /**
         * Conversion factors are expressed in BASE units. Documents snapshot the
         * factor they used so redefining a carton later never rewrites history.
         */
        Schema::create('item_units', function (Blueprint $t) {
            $t->id();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('unit_id')->constrained('units')->restrictOnDelete();
            $t->decimal('factor', 18, 6);
            $t->boolean('is_base')->default(false);
            $t->boolean('is_sales_default')->default(false);
            $t->boolean('is_purchase_default')->default(false);
            $t->decimal('sale_price', 18, 4)->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['item_id', 'unit_id']);
        });

        Schema::create('barcodes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('barcode', 64);
            $t->boolean('is_primary')->default(false);
            $t->timestamps();
            $t->unique(['company_id', 'barcode']);
        });

        Schema::create('batches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->string('code', 64);
            $t->string('lot_no', 64)->nullable();
            $t->date('mfg_date')->nullable();
            $t->date('expiry_date')->nullable();
            $t->unsignedBigInteger('supplier_id')->nullable();
            $t->string('status', 16)->default('ok'); // ok|quarantine|damaged|expired|blocked
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'item_id', 'code']);
            $t->index(['company_id', 'expiry_date']);
        });

        Schema::create('serials', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('serial_no', 96);
            $t->string('status', 16)->default('in_stock'); // in_stock|sold|returned|scrapped
            $t->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $t->string('last_doc_type', 48)->nullable();
            $t->unsignedBigInteger('last_doc_id')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'item_id', 'serial_no']);
            $t->index(['company_id', 'status']);
        });
    }

    public function down(): void
    {
        foreach (['serials', 'batches', 'barcodes', 'item_units', 'items', 'units',
            'brands', 'item_categories', 'tax_rates'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
