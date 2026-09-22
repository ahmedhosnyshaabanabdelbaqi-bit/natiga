<?php

namespace App\Modules\Integrations\Contracts\Data;

/** Result of creating a gateway transaction. `redirectUrl` is where the member completes payment (if hosted). */
final readonly class TransactionResult
{
    /** @param  array<string, mixed>  $raw  sanitised provider response (no secrets) */
    public function __construct(
        public string $providerRef,
        public TransactionState $state,
        public ?string $redirectUrl = null,
        public array $raw = [],
    ) {}
}
