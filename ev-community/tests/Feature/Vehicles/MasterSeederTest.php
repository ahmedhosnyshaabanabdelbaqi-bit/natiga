<?php

namespace Tests\Feature\Vehicles;

use App\Modules\Vehicles\Models\BatteryVariant;
use App\Modules\Vehicles\Models\ConnectorCompatibilityRule;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use App\Modules\Vehicles\Models\Enums\CurrentType;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use Database\Seeders\Vehicles\VehiclesMasterSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MasterSeederTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, int> */
    private function counts(): array
    {
        return [
            'makes' => VehicleMake::query()->count(),
            'models' => VehicleModel::query()->count(),
            'variants' => VehicleVariant::query()->count(),
            'batteries' => BatteryVariant::query()->count(),
            'connectors' => ConnectorType::query()->count(),
            'rules' => ConnectorCompatibilityRule::query()->count(),
        ];
    }

    public function test_seeder_is_idempotent(): void
    {
        $this->seed(VehiclesMasterSeeder::class);
        $first = $this->counts();
        $this->seed(VehiclesMasterSeeder::class);

        $this->assertSame($first, $this->counts());
        $this->assertSame(6, $first['connectors']);
        $this->assertGreaterThanOrEqual(22, $first['makes']);
        $this->assertGreaterThan(50, $first['models']);
    }

    public function test_seeder_never_overwrites_operator_decisions(): void
    {
        $this->seed(VehiclesMasterSeeder::class);
        $byd = VehicleMake::query()->where('slug', 'byd')->sole();
        $byd->forceFill(['is_active' => false, 'sort_order' => 999])->save();
        $type2 = ConnectorType::idByCode('type2');
        $gbtAc = ConnectorType::idByCode('gbt_ac');
        $rule = ConnectorCompatibilityRule::query()->where('vehicle_connector_type_id', $type2)->where('station_connector_type_id', $gbtAc)->sole();
        $rule->forceFill(['notes' => 'Verified by the charging team', 'verified_at' => now()])->save();

        $this->seed(VehiclesMasterSeeder::class);

        $this->assertFalse($byd->fresh()->is_active);
        $this->assertSame(999, $byd->fresh()->sort_order);
        $this->assertSame('Verified by the charging team', $rule->fresh()->notes);
    }

    public function test_required_connectors_and_compatibility_rules_are_seeded(): void
    {
        $this->seed(VehiclesMasterSeeder::class);
        $id = fn (string $code) => ConnectorType::idByCode($code);
        $rule = fn (string $vehicle, string $station): ?Compatibility => ConnectorCompatibilityRule::query()
            ->where('vehicle_connector_type_id', $id($vehicle))->where('station_connector_type_id', $id($station))->first()?->compatibility;

        foreach (['type2', 'ccs2', 'chademo', 'gbt_ac', 'gbt_dc', 'nacs'] as $code) {
            $this->assertNotNull($id($code), "connector {$code}");
            $this->assertSame(Compatibility::Direct, $rule($code, $code), "{$code} → {$code}");
        }
        $this->assertSame(CurrentType::Ac, ConnectorType::query()->where('code', 'gbt_ac')->sole()->current_type);
        $this->assertSame(CurrentType::Dc, ConnectorType::query()->where('code', 'nacs')->sole()->current_type);
        $this->assertSame(Compatibility::Adapter, $rule('type2', 'gbt_ac'));
        $this->assertSame(Compatibility::Adapter, $rule('gbt_ac', 'type2'));
        $this->assertSame(Compatibility::Incompatible, $rule('ccs2', 'gbt_dc'));
        $this->assertSame(Compatibility::Incompatible, $rule('gbt_dc', 'ccs2'));
        $this->assertSame(Compatibility::Incompatible, $rule('chademo', 'ccs2'));
        $this->assertSame(Compatibility::Incompatible, $rule('ccs2', 'chademo'));
        $this->assertSame(Compatibility::Adapter, $rule('nacs', 'ccs2'));
        $this->assertSame(Compatibility::Adapter, $rule('ccs2', 'nacs'));
    }

    public function test_seeded_market_versions_carry_the_right_connectors_and_approximate_spec_note(): void
    {
        $this->seed(VehiclesMasterSeeder::class);

        foreach (['byd', 'mg', 'tesla', 'nissan', 'hyundai', 'kia', 'volkswagen', 'chery', 'omoda', 'geely', 'zeekr', 'xpeng', 'smart', 'volvo', 'bmw', 'mercedes-benz', 'peugeot', 'citroen', 'renault', 'leapmotor', 'gac-aion', 'neta', 'dongfeng'] as $slug) {
            $this->assertTrue(VehicleMake::query()->where('slug', $slug)->exists(), "make {$slug}");
        }

        $china = VehicleVariant::query()->where('market_version', MarketVersion::China->value)->with(['acConnector', 'dcConnector'])->get();
        $this->assertNotEmpty($china);
        $this->assertTrue($china->every(fn (VehicleVariant $v) => $v->acConnector?->code === 'gbt_ac' && $v->dcConnector?->code === 'gbt_dc'));

        $europe = VehicleVariant::query()->where('market_version', MarketVersion::Gulf->value)->with(['acConnector', 'dcConnector'])->get();
        $this->assertTrue($europe->every(fn (VehicleVariant $v) => $v->acConnector?->code === 'type2' && $v->dcConnector?->code === 'ccs2'));

        $this->assertSame(0, VehicleVariant::query()->where(fn ($q) => $q->whereNull('notes')->orWhere('notes', '!=', VehiclesMasterSeeder::SPEC_NOTE))->count());
        $this->assertSame(0, VehicleVariant::query()->whereNull('battery_capacity_kwh')->count());
        $this->assertSame(0, VehicleVariant::query()->whereColumn('year_to', '<', 'year_from')->count());
        $this->assertSame(0, VehicleMake::query()->whereNull('name_ar')->orWhere('name_ar', '')->count());

        // master data only: the seeder never creates member data
        $this->assertSame(0, MemberVehicle::query()->count());
    }

    public function test_seeded_compatibility_works_end_to_end_for_member_vehicles(): void
    {
        $this->seed(VehiclesMasterSeeder::class);
        $europeanAtto = VehicleVariant::query()->where('market_version', 'europe')->whereHas('model', fn ($q) => $q->where('slug', 'atto-3'))->firstOrFail();
        $chineseAtto = VehicleVariant::query()->where('market_version', 'china')->whereHas('model', fn ($q) => $q->where('slug', 'atto-3'))->firstOrFail();

        $eu = MemberVehicle::factory()->create(['vehicle_make_id' => $europeanAtto->model->vehicle_make_id, 'vehicle_model_id' => $europeanAtto->vehicle_model_id, 'vehicle_variant_id' => $europeanAtto->id]);
        $cn = MemberVehicle::factory()->create(['vehicle_make_id' => $chineseAtto->model->vehicle_make_id, 'vehicle_model_id' => $chineseAtto->vehicle_model_id, 'vehicle_variant_id' => $chineseAtto->id]);

        $gbtDc = ConnectorType::idByCode('gbt_dc');
        $gbtAc = ConnectorType::idByCode('gbt_ac');
        $type2 = ConnectorType::idByCode('type2');

        $euCompat = $eu->compatibleStationConnectorTypeIds();
        $this->assertNotContains($gbtDc, [...$euCompat['direct'], ...$euCompat['adapter']], 'CCS2 vehicle cannot use a GB/T DC station');
        $this->assertContains($gbtDc, $eu->connectorCompatibility()['incompatible']);
        $this->assertContains($gbtAc, $euCompat['adapter'], 'Type 2 vehicle uses GB/T AC with an adapter');

        $cnCompat = $cn->compatibleStationConnectorTypeIds();
        $this->assertContains($gbtDc, $cnCompat['direct']);
        $this->assertContains($type2, $cnCompat['adapter']);
    }
}
