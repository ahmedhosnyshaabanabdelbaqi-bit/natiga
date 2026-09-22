<?php

namespace App\Modules\Integrations\Services;

use App\Modules\Integrations\Models\Enums\IntegrationEventStatus;
use App\Modules\Integrations\Support\Sanitizer;
use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Wraps outbound vendor calls: duration measurement, structured integration_events logging and a
 * pre-configured HTTP client with timeouts + bounded retries/backoff.
 *
 *   $response = IntegrationCall::run('shipping', 'track', fn () => IntegrationCall::http('shipping')->get($url), reference: $trackingNumber);
 *
 * Retries are opt-in per request (`retries` on http()). NEVER enable retries on non-idempotent
 * financial calls (createTransaction/refund): use `retries: 0` there.
 */
final class IntegrationCall
{
    public const DEFAULT_TIMEOUT = 10;

    public const DEFAULT_CONNECT_TIMEOUT = 5;

    /**
     * @template T
     *
     * @param  Closure(): T  $callback
     * @param  array<string, mixed>  $meta
     * @return T|null
     */
    public static function run(string $provider, string $operation, Closure $callback, ?string $reference = null, array $meta = [], bool $rethrow = true): mixed
    {
        $started = hrtime(true);
        try {
            $result = $callback();
            $duration = self::elapsedMs($started);
            if ($result instanceof Response && ! $result->successful()) {
                IntegrationEvents::record($provider, 'outbound', $operation, IntegrationEventStatus::Failed, $duration, 'HTTP '.$result->status(), $meta + ['http_status' => $result->status()], $reference);
            } else {
                IntegrationEvents::record($provider, 'outbound', $operation, IntegrationEventStatus::Success, $duration, null, $meta, $reference);
            }

            return $result;
        } catch (Throwable $e) {
            $duration = self::elapsedMs($started);
            $status = self::isTimeout($e) ? IntegrationEventStatus::Timeout : IntegrationEventStatus::Failed;
            IntegrationEvents::record($provider, 'outbound', $operation, $status, $duration, class_basename($e).': '.$e->getMessage(), $meta + ['exception' => $e::class], $reference);
            if ($rethrow) {
                throw $e;
            }

            return null;
        }
    }

    /**
     * HTTP client with timeouts and retry-on-transient-failure (connection errors, 5xx, 429).
     * 4xx responses are returned as-is (never retried, never thrown): callers inspect `successful()`.
     *
     * @param  array<int, int>  $backoffMs  delay before each retry (last value repeats)
     */
    public static function http(string $provider, int|float $timeout = self::DEFAULT_TIMEOUT, int|float $connectTimeout = self::DEFAULT_CONNECT_TIMEOUT, int $retries = 2, array $backoffMs = [300, 900]): PendingRequest
    {
        $request = Http::timeout($timeout)
            ->connectTimeout($connectTimeout)
            ->acceptJson()
            ->withUserAgent(self::userAgent())
            ->withHeaders(['X-Request-Id' => (string) (ev_request_id() ?? '')]);

        if ($retries > 0) {
            $last = $backoffMs === [] ? 300 : (int) end($backoffMs);
            $delays = array_slice(array_pad(array_values($backoffMs), $retries, $last), 0, $retries);
            $request = $request->retry($delays, when: fn (Throwable $e) => self::isRetryable($e), throw: false);
        }

        return $request;
    }

    public static function isRetryable(Throwable $e): bool
    {
        if ($e instanceof ConnectionException) {
            return true;
        }
        if ($e instanceof RequestException) {
            return $e->response->serverError() || $e->response->status() === 429;
        }

        return false;
    }

    public static function isTimeout(Throwable $e): bool
    {
        return $e instanceof ConnectionException && (bool) preg_match('/timed? ?out|timeout/i', $e->getMessage());
    }

    public static function userAgent(): string
    {
        return sprintf('EVCommunityEgypt/1.0 (+%s)', config('app.url'));
    }

    /** Short, secret-free description of a failure for flash messages. */
    public static function describe(Throwable $e): string
    {
        return (string) Sanitizer::error(class_basename($e).': '.$e->getMessage(), 200);
    }

    private static function elapsedMs(int|float $startedNs): int
    {
        return (int) round((hrtime(true) - $startedNs) / 1_000_000);
    }
}
