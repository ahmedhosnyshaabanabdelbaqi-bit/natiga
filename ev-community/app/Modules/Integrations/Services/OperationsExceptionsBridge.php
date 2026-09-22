<?php

namespace App\Modules\Integrations\Services;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\HealthStatus;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Raises / clears an "integrations" operations exception when the Reports module is present.
 * Expected contract (App\Modules\Reports\Services\OperationsExceptions):
 *   raise(string $category, string $dedupKey, string $title, string $severity, array $details = [], ?string $source = null): mixed
 *   resolve(string $dedupKey, ?string $resolution = null): mixed
 * Both are looked up with class_exists/method_exists so this module never hard-depends on Reports.
 */
final class OperationsExceptionsBridge
{
    public const SERVICE = 'App\\Modules\\Reports\\Services\\OperationsExceptions';

    public static function sync(string $key, HealthResult $result): void
    {
        if (! class_exists(self::SERVICE)) {
            return;
        }
        $dedupKey = 'integration:'.$key;
        try {
            $service = app(self::SERVICE);
            if ($result->status->isProblem()) {
                if (method_exists($service, 'raise')) {
                    $service->raise(
                        'integrations',
                        $dedupKey,
                        __('integrations.ops.title', ['integration' => __('integrations.categories.'.$key), 'status' => $result->status->label()]),
                        $result->status === HealthStatus::Unavailable ? 'p1' : 'p2',
                        ['integration' => $key, 'status' => $result->status->value, 'message' => $result->message, 'checked_at' => $result->checkedAt()->toIso8601String()],
                        'integrations:check',
                    );
                }
            } elseif (method_exists($service, 'resolve')) {
                $service->resolve($dedupKey, __('integrations.ops.recovered', ['status' => $result->status->label()]));
            }
        } catch (Throwable $e) {
            Log::warning('integration.ops_bridge_failed', ['key' => $key, 'error' => $e->getMessage()]);
        }
    }
}
