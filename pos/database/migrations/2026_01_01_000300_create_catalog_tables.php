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
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('name');
            $table->string('name_en')->nullable();
            $table->string('color', 9)->nullable();
            $table->string('image_path')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('name_en')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name');
            $table->string('name_en')->nullable();
            // 0 = whole units only (piece), 3 = grams within a kilogram, etc.
            $table->unsignedSmallInteger('precision')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('tax_groups', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->decimal('rate', 9, 4)->default(0);
            $table->boolean('is_inclusive')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('sku', 60)->unique();
            $table->string('name');
            $table->string('name_en')->nullable();
            $table->text('description')->nullable();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('tax_group_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('base_unit_id')->constrained('units')->restrictOnDelete();
            // standard | weighted | service | bundle
            $table->string('type', 20)->default('standard');
            // none | serial | batch
            $table->string('tracking', 20)->default('none');
            $table->boolean('has_variants')->default(false);
            $table->boolean('track_stock')->default(true);
            $table->boolean('allow_fractional_qty')->default(false);
            $table->boolean('allow_negative_stock')->default(false);
            $table->boolean('price_change_allowed')->default(true);
            $table->integer('warranty_months')->nullable();
            $table->integer('shelf_life_days')->nullable();
            $table->decimal('min_stock', 18, 4)->default(0);
            $table->decimal('reorder_qty', 18, 4)->default(0);
            $table->string('image_path')->nullable();
            $table->boolean('is_favorite')->default(false);
            $table->boolean('is_active')->default(true);
            $table->jsonb('attributes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['is_active', 'category_id']);
            $table->index('is_favorite');
        });

        DB::statement("ALTER TABLE products ADD CONSTRAINT products_type_check CHECK (type IN ('standard','weighted','service','bundle'))");
        DB::statement("ALTER TABLE products ADD CONSTRAINT products_tracking_check CHECK (tracking IN ('none','serial','batch'))");
        // A serialised item is by definition countable in whole units.
        DB::statement("ALTER TABLE products ADD CONSTRAINT products_serial_not_fractional CHECK (tracking <> 'serial' OR allow_fractional_qty = false)");

        // Every product owns at least one variant, so sale lines, stock and
        // prices always reference a variant and never branch on has_variants.
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('sku', 60)->unique();
            $table->string('name')->nullable();
            $table->jsonb('attributes')->nullable(); // {"color":"أحمر","size":"42"}
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->string('image_path')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['product_id', 'is_active']);
        });

        // Selling/purchasing units with the conversion factor to the base unit.
        Schema::create('product_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('unit_id')->constrained()->restrictOnDelete();
            $table->decimal('factor', 18, 6)->default(1); // 1 carton = 12 base pieces
            $table->boolean('is_base')->default(false);
            $table->boolean('is_default_sale')->default(false);
            $table->boolean('is_default_purchase')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['product_id', 'unit_id']);
        });
        DB::statement('ALTER TABLE product_units ADD CONSTRAINT product_units_factor_positive CHECK (factor > 0)');
        DB::statement('CREATE UNIQUE INDEX product_units_one_base ON product_units (product_id) WHERE is_base');

        Schema::create('barcodes', function (Blueprint $table) {
            $table->id();
            // Stored as text: leading zeros are part of the code.
            $table->string('code', 64);
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_id')->nullable()->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('product_unit_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 20)->default('standard'); // standard|weight_embedded|price_embedded
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            // Barcode uniqueness is establishment-wide: one scan, one meaning.
            $table->unique('code');
            $table->index(['product_id', 'variant_id']);
        });

        Schema::create('price_lists', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name');
            $table->string('type', 20)->default('retail'); // retail|wholesale|custom
            $table->boolean('is_default')->default(false);
            $table->boolean('tax_inclusive')->default(false);
            $table->integer('priority')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        DB::statement('CREATE UNIQUE INDEX price_lists_single_default ON price_lists (is_default) WHERE is_default');

        Schema::create('prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('price_list_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('product_unit_id')->constrained()->cascadeOnDelete();
            $table->decimal('price', 18, 4);
            $table->decimal('min_qty', 18, 4)->default(0);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();

            $table->unique(['price_list_id', 'variant_id', 'product_unit_id', 'min_qty'], 'prices_unique_tier');
            $table->index(['variant_id', 'product_unit_id']);
        });
        DB::statement('ALTER TABLE prices ADD CONSTRAINT prices_non_negative CHECK (price >= 0)');

        Schema::create('batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->string('code', 60);
            $table->date('expiry_date')->nullable();
            $table->date('production_date')->nullable();
            $table->decimal('unit_cost', 18, 6)->default(0);
            $table->foreignId('supplier_id')->nullable();
            $table->timestamps();

            $table->unique(['variant_id', 'code']);
            $table->index('expiry_date');
        });

        Schema::create('serials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->string('serial', 80);
            // in_stock | reserved | sold | returned | defective | in_transit | written_off
            $table->string('status', 20)->default('in_stock');
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('unit_cost', 18, 6)->default(0);
            $table->unsignedBigInteger('sale_line_id')->nullable();
            $table->unsignedBigInteger('receipt_line_id')->nullable();
            $table->date('warranty_until')->nullable();
            $table->timestamps();

            // The same serial can never exist twice for one product.
            $table->unique(['variant_id', 'serial']);
            $table->index(['status', 'warehouse_id']);
            $table->index('serial');
        });

        Schema::create('bundle_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bundle_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('component_variant_id')->constrained('product_variants')->restrictOnDelete();
            $table->foreignId('product_unit_id')->constrained()->restrictOnDelete();
            $table->decimal('qty', 18, 4)->default(1);
            $table->timestamps();

            $table->unique(['bundle_variant_id', 'component_variant_id', 'product_unit_id'], 'bundle_components_unique');
        });
        DB::statement('ALTER TABLE bundle_components ADD CONSTRAINT bundle_components_qty_positive CHECK (qty > 0)');
        DB::statement('ALTER TABLE bundle_components ADD CONSTRAINT bundle_components_no_self CHECK (bundle_variant_id <> component_variant_id)');

        // Arabic + English trigram search over product/variant names.
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement('CREATE INDEX products_name_trgm ON products USING gin (name gin_trgm_ops)');
        DB::statement('CREATE INDEX products_name_en_trgm ON products USING gin (name_en gin_trgm_ops)');
        DB::statement('CREATE INDEX barcodes_code_prefix ON barcodes (code text_pattern_ops)');
    }

    public function down(): void
    {
        Schema::dropIfExists('bundle_components');
        Schema::dropIfExists('serials');
        Schema::dropIfExists('batches');
        Schema::dropIfExists('prices');
        Schema::dropIfExists('price_lists');
        Schema::dropIfExists('barcodes');
        Schema::dropIfExists('product_units');
        Schema::dropIfExists('product_variants');
        Schema::dropIfExists('products');
        Schema::dropIfExists('tax_groups');
        Schema::dropIfExists('units');
        Schema::dropIfExists('brands');
        Schema::dropIfExists('categories');
    }
};
