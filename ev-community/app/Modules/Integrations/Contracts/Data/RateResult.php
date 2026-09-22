<?php

namespace App\Modules\Integrations\Contracts\Data;

use Carbon\CarbonImmutable;

/**
 * 1 `base` = `rate` `quote`. Convention: base is the FOREIGN currency and quote the local one
 * (1 USD = 48.50 EGP → base=USD, quote=EGP, rate="48.50000000").
 */
final readonly class RateResult
{
    public function __construct(
        public string $base,
        public string $quote,
        public string $rate,
        public CarbonImmutable $rateDate,
        public string $source,
        public ?string $reference = null,
    ) {}
}
