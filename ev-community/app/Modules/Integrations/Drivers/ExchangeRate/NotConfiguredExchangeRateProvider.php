<?php

namespace App\Modules\Integrations\Drivers\ExchangeRate;

use App\Modules\Integrations\Contracts\Data\RateResult;
use App\Modules\Integrations\Contracts\ExchangeRateProvider;
use App\Modules\Integrations\Drivers\Concerns\NotConfiguredDriver;
use Carbon\CarbonInterface;

final class NotConfiguredExchangeRateProvider implements ExchangeRateProvider
{
    use NotConfiguredDriver;

    public function key(): string
    {
        return 'exchange_rate';
    }

    public function fetchRate(string $base, string $quote, ?CarbonInterface $date = null): ?RateResult
    {
        throw $this->notConfigured();
    }

    public function supportsSync(): bool
    {
        return false;
    }
}
