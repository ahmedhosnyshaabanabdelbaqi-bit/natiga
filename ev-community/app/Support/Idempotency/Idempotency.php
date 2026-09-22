<?php

namespace App\Support\Idempotency;

use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Insert-first idempotency: the first caller with (scope, key) runs the callback; concurrent or
 * repeated callers get the stored reference instead of re-executing side effects.
 *
 *  $result = Idempotency::run('payment.approve', $payment->public_id, fn () => ..., ttlMinutes: 1440);
 */
final class Idempotency
{
    public const REPLAYED = '__replayed__';

    /**
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return array{replayed: bool, result: mixed, reference: ?string}
     */
    public static function run(string $scope, string $key, Closure $callback, ?int $userId = null, ?string $requestHash = null, int $ttlMinutes = 1440): array
    {
        $now = now();
        try {
            $id = DB::table('idempotency_keys')->insertGetId([
                'scope' => $scope, 'key' => $key, 'user_id' => $userId, 'request_hash' => $requestHash,
                'status' => 'processing', 'expires_at' => $now->addMinutes($ttlMinutes), 'created_at' => $now, 'updated_at' => $now,
            ]);
        } catch (UniqueConstraintViolationException) {
            $existing = DB::table('idempotency_keys')->where('scope', $scope)->where('key', $key)->first();

            return ['replayed' => true, 'result' => null, 'reference' => $existing?->response_reference, 'status' => $existing?->status];
        }

        try {
            $result = $callback();
            $reference = is_object($result) && isset($result->public_id) ? (string) $result->public_id : (is_scalar($result) ? (string) $result : null);
            DB::table('idempotency_keys')->where('id', $id)->update([
                'status' => 'completed', 'response_type' => is_object($result) ? $result::class : gettype($result),
                'response_reference' => $reference, 'updated_at' => now(),
            ]);

            return ['replayed' => false, 'result' => $result, 'reference' => $reference, 'status' => 'completed'];
        } catch (Throwable $e) {
            // Free the key so a genuine retry can happen after a failure.
            DB::table('idempotency_keys')->where('id', $id)->delete();
            throw $e;
        }
    }

    public static function purgeExpired(): int
    {
        return DB::table('idempotency_keys')->where('expires_at', '<', now())->delete();
    }
}
