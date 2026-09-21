<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Price lists, quantity tiers, per-customer contract prices and promotions.
 * Resolution order is documented in docs/02-data-model.md and implemented in
 * App\Domain\Pricing\PricingService.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_lists', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->string('kind', 24)->default('wholesale'); // wholesale|semi_wholesale|retail|distributor|project
            $t->char('currency_code', 3)->default('EGP');
            $t->boolean('is_default')->default(false);
            $t->unsignedSmallInteger('priority')->default(100);
            $t->boolean('prices_include_tax')->default(false);
            $t->date('valid_from')->nullable();
            $t->date('valid_to')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('price_list_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('price_list_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->cascadeOnDelete();
            $t->decimal('min_qty', 18, 4)->default(0);
            $t->decimal('price', 18, 4);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->date('valid_from')->nullable();
            $t->date('valid_to')->nullable();
            $t->timestamps();
            $t->index(['price_list_id', 'item_id']);
        });

        Schema::create('customer_price_agreements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_unit_id')->nullable()->constrained()->cascadeOnDelete();
            $t->decimal('min_qty', 18, 4)->default(0);
            $t->decimal('price', 18, 4)->nullable();
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->date('valid_from')->nullable();
            $t->date('valid_to')->nullable();
            $t->string('contract_ref', 64)->nullable();
            $t->timestamps();
            $t->index(['company_id', 'customer_id', 'item_id']);
        });

        Schema::create('promotions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->string('kind', 24); // bxgy|qty_discount|value_discount
            $t->unsignedSmallInteger('priority')->default(100);
            $t->boolean('stackable')->default(false);
            $t->jsonb('conditions')->default('{}'); // customer kinds, regions, price lists…
            $t->date('valid_from');
            $t->date('valid_to')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('promotion_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('promotion_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('category_id')->nullable()->constrained('item_categories')->cascadeOnDelete();
            $t->decimal('min_qty', 18, 4)->default(0);       // in base units
            $t->foreignId('free_item_id')->nullable()->constrained('items')->cascadeOnDelete();
            $t->foreignId('free_item_unit_id')->nullable()->constrained('item_units')->nullOnDelete();
            $t->decimal('free_qty', 18, 4)->default(0);
            $t->decimal('discount_pct', 9, 4)->default(0);
            $t->decimal('max_free_qty', 18, 4)->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['promotion_lines', 'promotions', 'customer_price_agreements',
            'price_list_lines', 'price_lists'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
