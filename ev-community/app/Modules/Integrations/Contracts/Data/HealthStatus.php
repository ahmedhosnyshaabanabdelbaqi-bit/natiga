<?php

namespace App\Modules\Integrations\Contracts\Data;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

/**
 * Health of an integration. `Unknown` is never returned by a driver's healthCheck(); it only
 * appears in `Integrations::status()` for a configured driver that has not been checked yet.
 */
enum HealthStatus: string implements HasLabel
{
    use EnumOptions;

    case Operational = 'operational';
    case Degraded = 'degraded';
    case Unavailable = 'unavailable';
    case NotConfigured = 'not_configured';
    case Unknown = 'unknown';

    public function label(): string
    {
        return __('integrations.health.'.$this->value);
    }

    public function isHealthy(): bool
    {
        return $this === self::Operational;
    }

    public function isProblem(): bool
    {
        return $this === self::Degraded || $this === self::Unavailable;
    }
}
