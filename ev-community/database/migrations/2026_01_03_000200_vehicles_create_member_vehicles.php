<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('member_vehicles', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('membership_id')->constrained('memberships')->restrictOnDelete();
            $table->foreignId('vehicle_make_id')->constrained('vehicle_makes')->restrictOnDelete();
            $table->foreignId('vehicle_model_id')->constrained('vehicle_models')->restrictOnDelete();
            $table->foreignId('vehicle_variant_id')->nullable()->constrained('vehicle_variants')->restrictOnDelete();
            $table->smallInteger('year');
            $table->string('market_version', 10)->default('unknown');   // china|europe|gulf|egypt|other|unknown
            $table->foreignId('battery_variant_id')->nullable()->constrained('battery_variants')->nullOnDelete();
            $table->text('vin')->nullable();                             // Laravel `encrypted` cast — never exposed in lists
            $table->char('vin_hash', 64)->nullable();                    // sha256 of the normalized VIN (duplicate detection)
            $table->string('nickname', 60)->nullable();
            $table->foreignId('image_attachment_id')->nullable()->constrained('attachments')->nullOnDelete();
            $table->string('image_path', 500)->nullable();               // integration: fallback until AttachmentService lands
            $table->string('color', 40)->nullable();
            $table->string('plate_hint', 3)->nullable();                 // last 3 characters only, optional
            $table->unsignedInteger('odometer_km')->nullable();
            $table->timestampTz('odometer_updated_at')->nullable();
            $table->string('status', 10)->default('active');             // active|sold|archived
            $table->boolean('is_primary')->default(false);
            $table->timestampsTz();

            $table->index('user_id');
            $table->index('membership_id');
            $table->index('vehicle_model_id');
            $table->index('vehicle_make_id');
            $table->index('status');
            $table->index(['user_id', 'status']);
            $table->index('vin_hash');
            $table->index('year');
        });

        Schema::create('vehicle_odometer_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_vehicle_id')->constrained('member_vehicles')->restrictOnDelete();
            $table->unsignedInteger('odometer_km');
            $table->string('source', 20)->default('manual');            // manual|service_record|import
            $table->timestampTz('recorded_at');
            $table->text('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('created_at');

            $table->index(['member_vehicle_id', 'recorded_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE member_vehicles ADD CONSTRAINT member_vehicles_status_check CHECK (status IN ('active','sold','archived'))");
            DB::statement("ALTER TABLE member_vehicles ADD CONSTRAINT member_vehicles_market_version_check CHECK (market_version IN ('china','europe','gulf','egypt','other','unknown'))");
            DB::statement('ALTER TABLE member_vehicles ADD CONSTRAINT member_vehicles_year_check CHECK (year BETWEEN 2008 AND 2035)');
            // At most one primary vehicle per user, enforced by the database.
            DB::statement('CREATE UNIQUE INDEX member_vehicles_one_primary_per_user ON member_vehicles (user_id) WHERE is_primary');
            DB::statement("ALTER TABLE vehicle_odometer_history ADD CONSTRAINT vehicle_odometer_history_source_check CHECK (source IN ('manual','service_record','import'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_odometer_history');
        Schema::dropIfExists('member_vehicles');
    }
};
