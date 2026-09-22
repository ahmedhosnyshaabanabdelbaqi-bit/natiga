<?php

namespace App\Modules\Integrations\Contracts\Data;

use Carbon\CarbonImmutable;

final readonly class StationData
{
    /**
     * @param  array<int, ConnectorData>  $connectors
     * @param  array<string, mixed>  $raw
     */
    public function __construct(
        public string $externalId,
        public string $name,
        public float $lat,
        public float $lng,
        public array $connectors,
        public StationStatus $status,
        public CarbonImmutable $fetchedAt,
        public string $source,
        public ?string $address = null,
        public ?string $operator = null,
        public array $raw = [],
    ) {}
}
