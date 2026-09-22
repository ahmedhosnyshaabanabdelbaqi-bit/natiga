<?php

namespace App\Modules\Integrations\Contracts\Data;

/**
 * The minimum the webhook framework needs from a provider payload to deduplicate it:
 * the provider's own event id (preferred) and the event type.
 */
final readonly class WebhookIdentity
{
    public function __construct(
        public ?string $externalEventId = null,
        public ?string $eventType = null,
    ) {}
}
