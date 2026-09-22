<?php

namespace App\Modules\Reports\Operations\Services;

use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use Closure;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Registry of daily data-quality / operations checks. Modules register checks in their ServiceProvider:
 *
 *   HealthChecks::register('finance.unallocated_payments', function (OperationsExceptions $ops): ?array {
 *       $count = ...; if ($count === 0) { return null; }               // healthy
 *       return ['category' => 'finance', 'severity' => 'p1', 'title' => "...", 'details' => [...]];   // raised (deduped per check)
 *   });
 *
 * A check may also return a string (informational message, e.g. "purged 12 keys") or call `$ops->raise()` itself.
 * When a check that previously raised passes again, its keyed exception is resolved automatically.
 * `ev:daily-checks` runs every registered check at 06:00 Africa/Cairo.
 */
final class HealthChecks
{
    /** @var array<string, Closure> */
    private static array $checks = [];

    public static function register(string $key, Closure $check): void
    {
        self::$checks[$key] = $check;
    }

    /** @return string[] */
    public static function keys(): array
    {
        return array_keys(self::$checks);
    }

    public static function dedupKey(string $key): string
    {
        return 'health:'.$key;
    }

    /**
     * @param  string[]|null  $only
     * @return array<int, array{key: string, status: string, message: ?string}>
     */
    public static function run(?array $only = null): array
    {
        $ops = app(OperationsExceptions::class);
        $results = [];
        foreach (self::$checks as $key => $check) {
            if ($only !== null && ! in_array($key, $only, true)) {
                continue;
            }
            $results[] = self::runOne($key, $check, $ops);
        }

        return $results;
    }

    public static function forget(string $key): void
    {
        unset(self::$checks[$key]);
    }

    public static function reset(): void
    {
        self::$checks = [];
    }

    /** @return array{key: string, status: string, message: ?string} */
    private static function runOne(string $key, Closure $check, OperationsExceptions $ops): array
    {
        try {
            $result = $check($ops);
        } catch (Throwable $e) {
            report($e);
            $ops->raise('data_quality', 'p2', "Health check [{$key}] failed: ".mb_substr($e->getMessage(), 0, 150), ['check' => $key, 'error' => mb_substr($e->getMessage(), 0, 500)], self::dedupKey($key), 'ev:daily-checks');

            return ['key' => $key, 'status' => 'error', 'message' => mb_substr($e->getMessage(), 0, 200)];
        }

        if (is_array($result) && isset($result['category'], $result['severity'], $result['title'])) {
            $severity = ExceptionSeverity::tryFrom((string) $result['severity'])?->value ?? 'p2';
            $exception = $ops->raise((string) $result['category'], $severity, (string) $result['title'], (array) ($result['details'] ?? []), (string) ($result['dedup_key'] ?? self::dedupKey($key)), (string) ($result['source'] ?? 'ev:daily-checks'));

            return ['key' => $key, 'status' => 'raised', 'message' => $exception->title.' ×'.$exception->occurrences];
        }

        $recovered = $ops->resolveByKey(self::dedupKey($key), 'auto-resolved: check passed');
        Log::info('operations.health_check', ['check' => $key, 'status' => 'ok', 'recovered' => $recovered !== null]);

        return ['key' => $key, 'status' => $recovered ? 'recovered' : 'ok', 'message' => is_string($result) ? $result : null];
    }
}
