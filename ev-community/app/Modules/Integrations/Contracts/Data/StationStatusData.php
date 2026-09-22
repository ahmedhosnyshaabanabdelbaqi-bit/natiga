<?php

namespace App\Modules\Integrations\Contracts\Data;

use Carbon\CarbonImmutable;

final readonly class StationStatusData
{
    /** @param  array<int, ConnectorData>  $connectors */
    public function __construct(
        public string $externalId,
        public StationStatus $status,
        public CarbonImmutable $fetchedAt,
        public string $source,
        public array $connectors = [],
        public ?int $availableConnectors = null,
    ) {}
}
