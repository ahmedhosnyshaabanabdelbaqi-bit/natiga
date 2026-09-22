<?php

namespace Tests\Unit\Integrations;

use App\Modules\Integrations\Drivers\Map\Concerns\ComputesGeometry;
use PHPUnit\Framework\TestCase;

class GeometryTest extends TestCase
{
    private object $geometry;

    protected function setUp(): void
    {
        parent::setUp();
        $this->geometry = new class
        {
            use ComputesGeometry;
        };
    }

    public function test_haversine_distance_cairo_to_alexandria_is_about_180_km(): void
    {
        $km = $this->geometry->distanceKm(30.0444, 31.2357, 31.2001, 29.9187);

        $this->assertGreaterThanOrEqual(179.0, $km);
        $this->assertLessThanOrEqual(182.0, $km);
    }

    public function test_distance_is_symmetric_and_zero_for_the_same_point(): void
    {
        $this->assertSame(0.0, $this->geometry->distanceKm(30.0444, 31.2357, 30.0444, 31.2357));
        $this->assertSame(
            $this->geometry->distanceKm(30.0444, 31.2357, 31.2001, 29.9187),
            $this->geometry->distanceKm(31.2001, 29.9187, 30.0444, 31.2357),
        );
    }

    public function test_directions_url_uses_the_universal_google_maps_url_api(): void
    {
        $url = $this->geometry->directionsUrl(30.0444, 31.2357, 'Tahrir');

        $this->assertSame('https://www.google.com/maps/dir/?api=1&destination=30.0444%2C31.2357&travelmode=driving', $url);
    }

    public function test_geo_uri_encodes_the_label(): void
    {
        $this->assertSame('geo:30.0444,31.2357?q=30.0444,31.2357(Tahrir%20Square)', $this->geometry->geoUri(30.0444, 31.2357, 'Tahrir Square'));
        $this->assertSame('geo:30.0444,31.2357?q=30.0444,31.2357', $this->geometry->geoUri(30.0444, 31.2357));
    }
}
