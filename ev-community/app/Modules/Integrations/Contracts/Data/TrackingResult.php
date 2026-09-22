<?php

namespace App\Modules\Integrations\Contracts\Data;

use Carbon\CarbonImmutable;

final readonly class TrackingResult
{
    /** @param  array<int, TrackingEventData>  $events */
    public function __construct(
        public string $trackingNumber,
        public string $status,
        public array $events,
        public CarbonImmutable $fetchedAt,
        public string $source,
        public ?CarbonImmutable $estimatedDelivery = null,
    ) {}
}
