<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicle_makes', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 80)->unique();
            $table->string('name_ar', 120);
            $table->string('name_en', 120);
            $table->string('logo_path', 500)->nullable();
            $table->char('country_code', 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->smallInteger('sort_order')->default(0);
            $table->timestampsTz();

            $table->index(['is_active', 'sort_order']);
        });

        Schema::create('vehicle_models', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vehicle_make_id')->constrained('vehicle_makes')->restrictOnDelete();
            $table->string('slug', 80);
            $table->string('name_ar', 120);
            $table->string('name_en', 120);
            $table->string('model_code', 40)->nullable();
            $table->string('body_type', 30)->nullable();   // suv|sedan|hatchback|crossover|mpv|pickup|other
            $table->boolean('is_active')->default(true);
            $table->smallInteger('sort_order')->default(0);
            $table->timestampsTz();

            $table->unique(['vehicle_make_id', 'slug']);
            $table->index(['vehicle_make_id', 'is_active']);
        });

        Schema::create('battery_variants', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->decimal('capacity_kwh', 6, 2);
            $table->string('chemistry', 20)->nullable();   // LFP|NMC|NCA|other
            $table->text('notes')->nullable();
            $table->timestampsTz();
        });

        Schema::create('connector_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();          // type2|ccs2|chademo|gbt_ac|gbt_dc|nacs
            $table->string('name_ar', 120);
            $table->string('name_en', 120);
            $table->string('current_type', 2);             // ac|dc
            $table->boolean('is_active')->default(true);
            $table->smallInteger('sort_order')->default(0);
            $table->timestampsTz();

            $table->index(['is_active', 'sort_order']);
        });

        Schema::create('vehicle_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vehicle_model_id')->constrained('vehicle_models')->restrictOnDelete();
            $table->string('name_ar', 160);
            $table->string('name_en', 160);
            $table->string('trim', 80)->nullable();
            $table->string('market_version', 10)->default('unknown');   // china|europe|gulf|egypt|other|unknown
            $table->smallInteger('year_from');
            $table->smallInteger('year_to')->nullable();
            $table->foreignId('battery_variant_id')->nullable()->constrained('battery_variants')->nullOnDelete();
            $table->foreignId('ac_connector_type_id')->nullable()->constrained('connector_types')->nullOnDelete();
            $table->foreignId('dc_connector_type_id')->nullable()->constrained('connector_types')->nullOnDelete();
            $table->decimal('battery_capacity_kwh', 6, 2)->nullable();
            $table->unsignedSmallInteger('motor_kw')->nullable();
            $table->unsignedSmallInteger('range_km_wltp')->nullable();
            $table->text('notes')->nullable();              // e.g. "approximate public spec; verify"
            $table->boolean('is_active')->default(true);
            $table->smallInteger('sort_order')->default(0);
            $table->timestampsTz();

            $table->index(['vehicle_model_id', 'is_active']);
            $table->index('market_version');
        });

        Schema::create('connector_compatibility_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vehicle_connector_type_id')->constrained('connector_types')->restrictOnDelete();
            $table->foreignId('station_connector_type_id')->constrained('connector_types')->restrictOnDelete();
            $table->string('compatibility', 15);            // direct|adapter|incompatible
            $table->string('adapter_name', 120)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('verified_at')->nullable();
            $table->timestampsTz();

            $table->unique(['vehicle_connector_type_id', 'station_connector_type_id'], 'connector_compat_pair_unique');
            $table->index('station_connector_type_id');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE connector_types ADD CONSTRAINT connector_types_current_type_check CHECK (current_type IN ('ac','dc'))");
            DB::statement('ALTER TABLE vehicle_variants ADD CONSTRAINT vehicle_variants_year_from_check CHECK (year_from BETWEEN 2008 AND 2035)');
            DB::statement('ALTER TABLE vehicle_variants ADD CONSTRAINT vehicle_variants_year_to_check CHECK (year_to IS NULL OR (year_to BETWEEN 2008 AND 2035 AND year_to >= year_from))');
            DB::statement("ALTER TABLE vehicle_variants ADD CONSTRAINT vehicle_variants_market_version_check CHECK (market_version IN ('china','europe','gulf','egypt','other','unknown'))");
            DB::statement('ALTER TABLE vehicle_variants ADD CONSTRAINT vehicle_variants_battery_positive CHECK (battery_capacity_kwh IS NULL OR battery_capacity_kwh > 0)');
            DB::statement('ALTER TABLE battery_variants ADD CONSTRAINT battery_variants_capacity_positive CHECK (capacity_kwh > 0)');
            DB::statement("ALTER TABLE connector_compatibility_rules ADD CONSTRAINT connector_compat_value_check CHECK (compatibility IN ('direct','adapter','incompatible'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('connector_compatibility_rules');
        Schema::dropIfExists('vehicle_variants');
        Schema::dropIfExists('connector_types');
        Schema::dropIfExists('battery_variants');
        Schema::dropIfExists('vehicle_models');
        Schema::dropIfExists('vehicle_makes');
    }
};
