<?php

namespace App\Modules\Integrations\Drivers\Map\Concerns;

/**
 * Vendor-free geometry and deep-link helpers shared by every MapProvider.
 */
trait ComputesGeometry
{
    /** Mean Earth radius (km), IUGG. */
    private const EARTH_RADIUS_KM = 6371.0088;

    public function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $phi1 = deg2rad($lat1);
        $phi2 = deg2rad($lat2);
        $dPhi = deg2rad($lat2 - $lat1);
        $dLambda = deg2rad($lng2 - $lng1);

        $a = sin($dPhi / 2) ** 2 + cos($phi1) * cos($phi2) * sin($dLambda / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return round(self::EARTH_RADIUS_KM * $c, 3);
    }

    public function directionsUrl(float $lat, float $lng, ?string $label = null): string
    {
        $query = ['api' => '1', 'destination' => self::coordinatePair($lat, $lng), 'travelmode' => 'driving'];

        return 'https://www.google.com/maps/dir/?'.http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    public function geoUri(float $lat, float $lng, ?string $label = null): string
    {
        $pair = self::coordinatePair($lat, $lng);
        $q = $label !== null && trim($label) !== '' ? $pair.'('.rawurlencode(trim($label)).')' : $pair;

        return 'geo:'.$pair.'?q='.$q;
    }

    private static function coordinatePair(float $lat, float $lng): string
    {
        return rtrim(rtrim(number_format($lat, 6, '.', ''), '0'), '.').','.rtrim(rtrim(number_format($lng, 6, '.', ''), '0'), '.');
    }
}
