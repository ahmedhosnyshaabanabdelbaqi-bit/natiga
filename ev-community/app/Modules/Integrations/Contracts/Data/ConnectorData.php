<?php

namespace App\Modules\Integrations\Contracts\Data;

/** A connector as reported by a charging network, normalised to internal connector codes. */
final readonly class ConnectorData
{
    public function __construct(
        public string $type,               // type2|ccs2|chademo|gbt_ac|gbt_dc|unknown (see Support\ConnectorTypes)
        public ?float $powerKw = null,
        public int $quantity = 1,
        public ?string $currentType = null, // ac|dc
        public StationStatus $status = StationStatus::Unknown,
        public ?string $vendorType = null, // original code, kept for diagnostics
    ) {}
}
