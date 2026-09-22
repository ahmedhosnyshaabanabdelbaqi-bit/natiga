<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\StationData;
use App\Modules\Integrations\Contracts\Data\StationStatusData;

interface ChargingProvider extends Integration
{
    /** @return iterable<int, StationData> normalised stations (connector codes, kW, status, fetched_at, source) */
    public function fetchStations(): iterable;

    public function fetchStatus(string $externalId): ?StationStatusData;
}
