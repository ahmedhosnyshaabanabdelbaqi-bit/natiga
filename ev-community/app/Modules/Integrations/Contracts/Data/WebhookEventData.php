<?php

namespace App\Modules\Integrations\Contracts\Data;

use Carbon\CarbonImmutable;

/** Parsed payment webhook. `state` is the normalised transaction state announced by the gateway. */
final readonly class WebhookEventData
{
    /** @param  array<string, mixed>  $data  sanitised payload fields relevant to the platform */
    public function __construct(
        public ?string $externalEventId,
        public ?string $eventType,
        public ?string $providerRef,
        public ?string $reference = null,   // our payment reference echoed back by the gateway, if any
        public ?TransactionState $state = null,
        public ?string $amount = null,
        public ?string $currency = null,
        public ?CarbonImmutable $occurredAt = null,
        public array $data = [],
    ) {}

    public function identity(): WebhookIdentity
    {
        return new WebhookIdentity($this->externalEventId, $this->eventType);
    }
}
