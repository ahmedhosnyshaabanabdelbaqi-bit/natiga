<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Organisation backbone: company, branches, warehouses, treasury containers,
 * geography, fleet and cost centres.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $t) {
            $t->id();
            $t->string('code', 32)->unique();
            $t->string('name');
            $t->string('name_en')->nullable();
            $t->string('legal_name')->nullable();
            $t->string('tax_id', 64)->nullable();
            $t->string('commercial_reg', 64)->nullable();
            $t->string('activity_code', 32)->nullable();
            $t->string('logo_path')->nullable();
            $t->string('phone', 64)->nullable();
            $t->string('email')->nullable();
            $t->text('address')->nullable();
            $t->char('currency_code', 3)->default('EGP');
            $t->string('timezone', 64)->default('Africa/Cairo');
            $t->unsignedTinyInteger('fiscal_year_start_month')->default(1);
            $t->jsonb('settings')->default('{}');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('branches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->string('phone', 64)->nullable();
            $t->text('address')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('regions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('regions')->nullOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('routes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('region_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('vehicles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 32);
            $t->string('plate_no', 32)->nullable();
            $t->string('model')->nullable();
            $t->decimal('capacity_weight', 18, 4)->nullable();
            $t->decimal('capacity_volume', 18, 4)->nullable();
            $t->date('license_expiry')->nullable();
            $t->date('next_service_date')->nullable();
            $t->decimal('odometer', 18, 2)->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        /**
         * A warehouse is any place stock can legitimately sit. `kind` decides
         * whether its balance counts as sellable — vans, transit, quarantine,
         * inspection and damaged never do.
         */
        Schema::create('warehouses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->string('kind', 24)->default('main'); // main|sub|van|transit|quarantine|inspection|damaged|returns
            $t->boolean('is_sellable')->default(true);
            $t->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $t->unsignedBigInteger('keeper_user_id')->nullable();
            $t->text('address')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
            $t->index(['company_id', 'kind']);
        });

        Schema::create('bins', function (Blueprint $t) {
            $t->id();
            $t->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $t->string('code', 32);
            $t->string('name')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['warehouse_id', 'code']);
        });

        Schema::create('cost_centers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('parent_id')->nullable()->constrained('cost_centers')->nullOnDelete();
            $t->string('code', 32);
            $t->string('name');
            $t->string('kind', 24)->default('other'); // branch|project|vehicle|region|other
            $t->unsignedBigInteger('ref_id')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['company_id', 'code']);
        });

        Schema::create('number_series', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->foreignId('branch_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('doc_type', 48);
            $t->string('prefix', 16)->default('');
            $t->string('suffix', 16)->default('');
            $t->unsignedBigInteger('next_number')->default(1);
            $t->unsignedTinyInteger('padding')->default(6);
            $t->string('reset_period', 16)->default('yearly'); // none|yearly|monthly
            $t->string('current_period', 16)->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'branch_id', 'doc_type']);
        });

        Schema::create('settings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('company_id')->constrained()->cascadeOnDelete();
            $t->string('key', 128);
            $t->jsonb('value')->default('{}');
            $t->unsignedBigInteger('updated_by')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'key']);
        });
    }

    public function down(): void
    {
        foreach (['settings', 'number_series', 'cost_centers', 'bins', 'warehouses',
            'vehicles', 'routes', 'regions', 'branches', 'companies'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
