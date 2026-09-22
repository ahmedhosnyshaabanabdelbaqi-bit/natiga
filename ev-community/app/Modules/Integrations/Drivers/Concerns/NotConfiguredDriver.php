<?php

namespace App\Modules\Integrations\Drivers\Concerns;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Exceptions\IntegrationNotConfiguredException;

/**
 * Shared behaviour of every NotConfigured* driver: honest "not configured" health and a
 * ready-made exception for every operation.
 */
trait NotConfiguredDriver
{
    public function driver(): string
    {
        return 'none';
    }

    public function isConfigured(): bool
    {
        return false;
    }

    public function healthCheck(): HealthResult
    {
        return HealthResult::notConfigured(__('integrations.health.not_configured_detail', ['integration' => __('integrations.categories.'.$this->key())]));
    }

    protected function notConfigured(): IntegrationNotConfiguredException
    {
        return IntegrationNotConfiguredException::for($this->key());
    }
}
