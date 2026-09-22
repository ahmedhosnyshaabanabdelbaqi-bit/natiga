<?php

namespace App\Modules\Integrations\Contracts\Data;

use Carbon\CarbonImmutable;

/** Verified state of a gateway transaction, as reported by the gateway itself (never inferred). */
final readonly class TransactionStatus
{
    /** @param  array<string, mixed>  $raw */
    public function __construct(
        public string $providerRef,
        public TransactionState $state,
        public ?string $amount = null,
        public ?string $currency = null,
        public ?CarbonImmutable $paidAt = null,
        public array $raw = [],
    ) {}

    public function isPaid(): bool
    {
        return $this->state === TransactionState::Paid;
    }
}
