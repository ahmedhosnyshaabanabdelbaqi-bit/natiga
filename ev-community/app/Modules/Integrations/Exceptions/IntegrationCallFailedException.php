<?php

namespace App\Modules\Integrations\Exceptions;

use App\Support\Exceptions\DomainException;

/** An outbound call failed after the configured retries (network, timeout, 5xx). Never contains secrets. */
class IntegrationCallFailedException extends DomainException
{
    public function __construct(public readonly string $integration, public readonly string $operation, public readonly ?string $detail = null)
    {
        parent::__construct('integrations.errors.call_failed', ['integration' => __('integrations.categories.'.$integration), 'operation' => $operation], null, 502);
    }
}
