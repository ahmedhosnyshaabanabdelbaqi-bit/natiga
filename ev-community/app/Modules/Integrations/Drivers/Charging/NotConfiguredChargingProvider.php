<?php

namespace App\Modules\Integrations\Drivers\Charging;

use App\Modules\Integrations\Contracts\ChargingProvider;
use App\Modules\Integrations\Contracts\Data\StationStatusData;
use App\Modules\Integrations\Drivers\Concerns\NotConfiguredDriver;

final class NotConfiguredChargingProvider implements ChargingProvider
{
    use NotConfiguredDriver;

    public function key(): string
    {
        return 'charging';
    }

    public function fetchStations(): iterable
    {
        throw $this->notConfigured();
    }

    public function fetchStatus(string $externalId): ?StationStatusData
    {
        throw $this->notConfigured();
    }
}
