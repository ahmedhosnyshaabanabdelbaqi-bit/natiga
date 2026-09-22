<?php

namespace Tests\Feature\Vehicles;

use App\Models\User;
use App\Modules\Vehicles\Models\ConnectorCompatibilityRule;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use App\Modules\Vehicles\Models\Enums\CurrentType;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;

/** Small, explicit vehicle fixtures shared by the Vehicles / Garage test suites. */
trait VehicleFixtures
{
    /** @return array<string, ConnectorType> code => connector */
    protected function connectors(): array
    {
        $definitions = ['type2' => 'ac', 'gbt_ac' => 'ac', 'ccs2' => 'dc', 'gbt_dc' => 'dc', 'chademo' => 'dc', 'nacs' => 'dc'];
        $out = [];
        foreach ($definitions as $code => $current) {
            $out[$code] = ConnectorType::query()->firstOrCreate(['code' => $code], [
                'name_ar' => strtoupper($code), 'name_en' => strtoupper($code), 'current_type' => CurrentType::from($current), 'is_active' => true,
            ]);
        }

        return $out;
    }

    protected function rule(ConnectorType $vehicle, ConnectorType $station, Compatibility $compatibility): ConnectorCompatibilityRule
    {
        return ConnectorCompatibilityRule::query()->updateOrCreate(
            ['vehicle_connector_type_id' => $vehicle->id, 'station_connector_type_id' => $station->id],
            ['compatibility' => $compatibility],
        );
    }

    /** make → model → variant (European Type 2 + CCS2 by default). */
    protected function variant(array $attributes = [], ?string $ac = 'type2', ?string $dc = 'ccs2'): VehicleVariant
    {
        $connectors = $this->connectors();
        $make = VehicleMake::factory()->create();
        $model = VehicleModel::factory()->create(['vehicle_make_id' => $make->id]);

        return VehicleVariant::factory()->create($attributes + [
            'vehicle_model_id' => $model->id,
            'market_version' => MarketVersion::Europe,
            'ac_connector_type_id' => $ac ? $connectors[$ac]->id : null,
            'dc_connector_type_id' => $dc ? $connectors[$dc]->id : null,
        ]);
    }

    /** A garage vehicle owned by $owner (creates make/model when not given). */
    protected function vehicleFor(User $owner, array $attributes = []): MemberVehicle
    {
        if (! isset($attributes['vehicle_model_id'])) {
            $model = VehicleModel::factory()->create();
            $attributes += ['vehicle_make_id' => $model->vehicle_make_id, 'vehicle_model_id' => $model->id];
        }

        return MemberVehicle::factory()->forMember($owner)->create($attributes);
    }

    /** Valid 17-character VINs (no I/O/Q). */
    protected function vin(int $n = 1): string
    {
        return 'LGXCE4CB5N'.str_pad((string) $n, 7, '0', STR_PAD_LEFT);
    }
}
