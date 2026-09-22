<?php

namespace App\Modules\Integrations\Exceptions;

use App\Support\Exceptions\DomainException;

/**
 * Thrown by NotConfigured drivers (and by configured drivers missing credentials) for every
 * operation. Rendered as a validation error / flash so the UI shows "Not configured" instead of
 * pretending the call succeeded.
 */
class IntegrationNotConfiguredException extends DomainException
{
    public function __construct(public readonly string $integration, ?string $field = null)
    {
        parent::__construct('integrations.errors.not_configured', ['integration' => __('integrations.categories.'.$integration)], $field, 422);
    }

    public static function for(string $integration): self
    {
        return new self($integration);
    }
}
