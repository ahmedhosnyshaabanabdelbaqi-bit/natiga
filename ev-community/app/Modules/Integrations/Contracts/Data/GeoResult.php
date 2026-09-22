<?php

namespace App\Modules\Integrations\Contracts\Data;

final readonly class GeoResult
{
    /** @param  array<string, mixed>  $raw  small, non-sensitive subset of the provider response */
    public function __construct(
        public float $lat,
        public float $lng,
        public ?string $displayName = null,
        public ?string $countryCode = null,
        public ?string $city = null,
        public string $source = 'unknown',
        public array $raw = [],
    ) {}

    /** @return array{lat: float, lng: float, display_name: ?string, country_code: ?string, city: ?string, source: string} */
    public function toArray(): array
    {
        return [
            'lat' => $this->lat,
            'lng' => $this->lng,
            'display_name' => $this->displayName,
            'country_code' => $this->countryCode,
            'city' => $this->city,
            'source' => $this->source,
        ];
    }
}
