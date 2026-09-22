<?php

namespace Tests\Unit\Vehicles;

use App\Modules\Vehicles\Models\ConnectorCompatibilityRule;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Vehicles\VehicleFixtures;
use Tests\TestCase;

class ConnectorCompatibilityTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    public function test_same_type_pairs_without_a_rule_are_direct(): void
    {
        $c = $this->connectors();

        $resolved = ConnectorCompatibilityRule::resolveFor([$c['type2']->id]);

        $this->assertSame([$c['type2']->id], $resolved['direct']);
        $this->assertSame([], $resolved['adapter']);
        $this->assertSame([], $resolved['incompatible']);
    }

    public function test_direct_wins_over_adapter_and_incompatible_for_the_same_station_connector(): void
    {
        $c = $this->connectors();
        $this->rule($c['type2'], $c['type2'], Compatibility::Direct);
        $this->rule($c['ccs2'], $c['ccs2'], Compatibility::Direct);
        // A Type 2 AC-only inlet cannot take a CCS2 DC cable, but the vehicle's CCS2 inlet can.
        $this->rule($c['type2'], $c['ccs2'], Compatibility::Incompatible);

        $resolved = ConnectorCompatibilityRule::resolveFor([$c['type2']->id, $c['ccs2']->id]);

        $this->assertEqualsCanonicalizing([$c['type2']->id, $c['ccs2']->id], $resolved['direct']);
        $this->assertNotContains($c['ccs2']->id, $resolved['incompatible']);
    }

    public function test_implicit_same_type_direct_is_not_hidden_by_a_rule_from_another_inlet(): void
    {
        $c = $this->connectors();
        // Only a cross rule exists: type2 inlet → ccs2 station is incompatible. The vehicle's own CCS2 inlet
        // still takes a CCS2 cable directly even though no explicit ccs2→ccs2 rule was saved.
        $this->rule($c['type2'], $c['ccs2'], Compatibility::Incompatible);

        $resolved = ConnectorCompatibilityRule::resolveFor([$c['type2']->id, $c['ccs2']->id]);

        $this->assertEqualsCanonicalizing([$c['type2']->id, $c['ccs2']->id], $resolved['direct']);
        $this->assertSame([], $resolved['incompatible']);
    }

    public function test_ccs2_vehicle_is_incompatible_with_gbt_dc_and_type2_vehicle_needs_an_adapter_for_gbt_ac(): void
    {
        $c = $this->connectors();
        $this->rule($c['ccs2'], $c['gbt_dc'], Compatibility::Incompatible);
        $this->rule($c['type2'], $c['gbt_ac'], Compatibility::Adapter);
        $variant = $this->variant(ac: 'type2', dc: 'ccs2');
        $vehicle = MemberVehicle::factory()->create([
            'vehicle_make_id' => $variant->model->vehicle_make_id,
            'vehicle_model_id' => $variant->vehicle_model_id,
            'vehicle_variant_id' => $variant->id,
        ]);

        $this->assertSame(['ac' => $c['type2']->id, 'dc' => $c['ccs2']->id], $vehicle->connectorTypeIds());

        $compatible = $vehicle->compatibleStationConnectorTypeIds();
        $this->assertEqualsCanonicalizing([$c['type2']->id, $c['ccs2']->id], $compatible['direct']);
        $this->assertSame([$c['gbt_ac']->id], $compatible['adapter']);
        $this->assertNotContains($c['gbt_dc']->id, [...$compatible['direct'], ...$compatible['adapter']]);
        $this->assertContains($c['gbt_dc']->id, $vehicle->connectorCompatibility()['incompatible']);
    }

    public function test_vehicle_without_variant_has_no_known_connectors(): void
    {
        $this->connectors();
        $vehicle = MemberVehicle::factory()->create(['vehicle_variant_id' => null]);

        $this->assertSame(['ac' => null, 'dc' => null], $vehicle->connectorTypeIds());
        $this->assertSame(['direct' => [], 'adapter' => []], $vehicle->compatibleStationConnectorTypeIds());
    }
}
