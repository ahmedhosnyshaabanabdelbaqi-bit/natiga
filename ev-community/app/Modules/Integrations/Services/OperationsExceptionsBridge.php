<?php

namespace App\Modules\Integrations\Services;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\HealthStatus;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Raises / auto-resolves an "integrations" exception in the Exception Center (Reports/Operations)
 * after every health check. The Reports module is optional for this module: the service is looked
 * up by class name and only called when the class (and the method) exists, so Integrations never
 * hard-depends on Reports.
 *
 * Contract used (App\Modules\Reports\Operations\Services\OperationsExceptions):
 *   raise(string $category, string $severity, string $title, array $details = [], ?string $dedupKey = null, ?string $source = null)
 *   resolveByKey(string $dedupKey, ?string $resolution = null, ?User $actor = null)
 *
 * Mapping: unavailable → p1, degraded → p2; operational / not_configured → resolve the open exception
 * (a deliberately unconfigured integration is not an incident — its fallback is documented).
 */
final class OperationsExceptionsBridge
{
    public const SERVICE = 'App\\Modules\\Reports\\Operations\\Services\\OperationsExceptions';

    public const CATEGORY = 'integrations';

    public const SOURCE = 'integrations:check';

    public static function dedupKey(string $key): string
    {
        return 'integration:'.$key;
    }

    public static function available(): bool
    {
        return class_exists(self::SERVICE);
    }

    public static function sync(string $key, HealthResult $result): void
    {
        if (! self::available()) {
            return;
        }
        $dedupKey = self::dedupKey($key);
        try {
            $service = app(self::SERVICE);
            if ($result->status->isProblem()) {
                if (method_exists($service, 'raise')) {
                    $service->raise(
                        self::CATEGORY,
                        $result->status === HealthStatus::Unavailable ? 'p1' : 'p2',
                        __('integrations.ops.title', ['integration' => __('integrations.categories.'.$key), 'status' => $result->status->label()]),
                        ['integration' => $key, 'status' => $result->status->value, 'message' => $result->message, 'checked_at' => $result->checkedAt()->toIso8601String()],
                        $dedupKey,
                        self::SOURCE,
                    );
                }

                return;
            }
            if (method_exists($service, 'resolveByKey')) {
                $service->resolveByKey($dedupKey, __('integrations.ops.recovered', ['status' => $result->status->label()]));
            }
        } catch (Throwable $e) {
            // The health check itself must never fail because the Exception Center is unavailable.
            Log::warning('integration.ops_bridge_failed', ['key' => $key, 'error' => $e->getMessage()]);
        }
    }
}
