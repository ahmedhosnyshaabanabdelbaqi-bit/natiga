<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\GeoResult;

interface MapProvider extends Integration
{
    /** Null when nothing matched or the provider failed (failures are logged, never thrown). */
    public function geocode(string $address, ?string $countryCode = 'EG'): ?GeoResult;

    public function reverseGeocode(float $lat, float $lng): ?GeoResult;

    /**
     * Straight-line (haversine) distance in km. Pure math, works without any vendor.
     * Callers must present it as an estimate (straight_line = true).
     */
    public function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float;

    /** Universal directions URL that opens the user's maps app (Google Maps URL API). */
    public function directionsUrl(float $lat, float $lng, ?string $label = null): string;

    /** `geo:` URI for native handlers on mobile. */
    public function geoUri(float $lat, float $lng, ?string $label = null): string;

    /** Only non-sensitive values (provider, tile_url, attribution, public key). Safe for the browser. */
    public function publicConfig(): array;
}
