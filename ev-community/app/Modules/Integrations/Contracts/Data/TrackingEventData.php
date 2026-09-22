<?php

namespace App\Modules\Integrations\Contracts\Data;

use Carbon\CarbonImmutable;

final readonly class TrackingEventData
{
    /** @param  array<string, mixed>  $raw */
    public function __construct(
        public string $trackingNumber,
        public string $status,             // carrier status normalised by the driver (e.g. in_transit, delivered)
        public CarbonImmutable $occurredAt,
        public ?string $externalEventId = null,
        public ?string $description = null,
        public ?string $location = null,
        public array $raw = [],
    ) {}
}
