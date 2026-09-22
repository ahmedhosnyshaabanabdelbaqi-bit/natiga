<?php

namespace App\Modules\Integrations\Drivers\Map;

use App\Modules\Integrations\Contracts\Data\GeoResult;
use App\Modules\Integrations\Contracts\MapProvider;
use App\Modules\Integrations\Drivers\Concerns\NotConfiguredDriver;
use App\Modules\Integrations\Drivers\Map\Concerns\ComputesGeometry;

/**
 * No map vendor. Geocoding throws; the pure geometry / deep-link helpers keep working so the
 * "list view without map" fallback can still show distances and directions links.
 */
final class NotConfiguredMapProvider implements MapProvider
{
    use ComputesGeometry;
    use NotConfiguredDriver;

    public function key(): string
    {
        return 'map';
    }

    public function geocode(string $address, ?string $countryCode = 'EG'): ?GeoResult
    {
        throw $this->notConfigured();
    }

    public function reverseGeocode(float $lat, float $lng): ?GeoResult
    {
        throw $this->notConfigured();
    }

    public function publicConfig(): array
    {
        return [
            'provider' => 'none',
            'tile_url' => null,
            'public_key' => null,
            'attribution' => null,
            'default' => ['lat' => (float) config('ev.map.default_lat'), 'lng' => (float) config('ev.map.default_lng'), 'zoom' => (int) config('ev.map.default_zoom')],
        ];
    }
}
