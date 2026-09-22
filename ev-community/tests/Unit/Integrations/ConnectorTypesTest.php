<?php

namespace Tests\Unit\Integrations;

use App\Modules\Integrations\Contracts\Data\StationStatus;
use App\Modules\Integrations\Support\ConnectorTypes;
use PHPUnit\Framework\TestCase;

class ConnectorTypesTest extends TestCase
{
    public function test_vendor_codes_map_to_internal_connector_codes(): void
    {
        $this->assertSame('type2', ConnectorTypes::normalize('IEC_62196_T2'));
        $this->assertSame('type2', ConnectorTypes::normalize('Type 2'));
        $this->assertSame('ccs2', ConnectorTypes::normalize('IEC_62196_T2_COMBO'));
        $this->assertSame('ccs2', ConnectorTypes::normalize('CCS'));
        $this->assertSame('chademo', ConnectorTypes::normalize('CHAdeMO'));
        $this->assertSame('gbt_ac', ConnectorTypes::normalize('GB/T'));
        $this->assertSame('gbt_dc', ConnectorTypes::normalize('GB/T', 'DC'));
        $this->assertSame('gbt_dc', ConnectorTypes::normalize('GBT_20234_3'));
        $this->assertSame('unknown', ConnectorTypes::normalize('TESLA_NACS'));
        $this->assertSame('unknown', ConnectorTypes::normalize(null));
    }

    public function test_current_type_is_derived_from_the_internal_code(): void
    {
        $this->assertSame('ac', ConnectorTypes::currentTypeFor('type2'));
        $this->assertSame('dc', ConnectorTypes::currentTypeFor('ccs2'));
        $this->assertNull(ConnectorTypes::currentTypeFor('unknown'));
    }

    public function test_station_status_normalisation(): void
    {
        $this->assertSame(StationStatus::Available, StationStatus::normalize('AVAILABLE'));
        $this->assertSame(StationStatus::Occupied, StationStatus::normalize('Charging'));
        $this->assertSame(StationStatus::OutOfService, StationStatus::normalize('OUTOFORDER'));
        $this->assertSame(StationStatus::Unknown, StationStatus::normalize('weird'));
        $this->assertSame(StationStatus::Unknown, StationStatus::normalize(null));
    }
}
