<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\RateResult;
use Carbon\CarbonInterface;

interface ExchangeRateProvider extends Integration
{
    /** Rate for 1 base in quote on/before `date` (today when null). Null when unknown. */
    public function fetchRate(string $base, string $quote, ?CarbonInterface $date = null): ?RateResult;

    /** Whether `ExchangeRates::sync()` can pull rates from this driver (false for manual). */
    public function supportsSync(): bool;
}
