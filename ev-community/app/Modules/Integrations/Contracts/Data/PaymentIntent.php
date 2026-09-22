<?php

namespace App\Modules\Integrations\Contracts\Data;

/**
 * What the platform asks a gateway to collect. Amounts are decimal strings (never floats).
 */
final readonly class PaymentIntent
{
    /** @param  array<string, mixed>  $meta */
    public function __construct(
        public string $reference,          // our payment number (PAY-2026-000001)
        public string $amount,             // "1500.00"
        public string $currency,           // ISO 4217
        public string $description,
        public ?string $customerName = null,
        public ?string $customerEmail = null,
        public ?string $customerMobile = null,
        public ?string $returnUrl = null,
        public array $meta = [],
    ) {}
}
