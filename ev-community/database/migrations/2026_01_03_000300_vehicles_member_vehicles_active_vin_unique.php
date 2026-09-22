<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A VIN may be registered on at most one ACTIVE member vehicle (sold/archived copies are kept for history).
 * VehicleIntegrity::assertVinNotDuplicated() gives the friendly message; this partial unique index is the
 * last line of defence against two concurrent registrations of the same VIN.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS member_vehicles_active_vin_unique ON member_vehicles (vin_hash) WHERE status = 'active' AND vin_hash IS NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS member_vehicles_active_vin_unique');
        }
    }
};
