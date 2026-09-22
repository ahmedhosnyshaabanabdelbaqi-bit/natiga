<?php

declare(strict_types=1);

namespace App\Modules\Sync\Services;

use App\Modules\Core\Services\PosContext;
use App\Modules\Sync\Models\IdempotencyKey;
use App\Support\Exceptions\IdempotencyConflictException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Exactly-once execution for money-moving requests.
 *
 * The key is CLAIMED in its own committed statement before any business work
 * starts, so a duplicate request (double-tap, retried POST, flaky network) loses
 * the race at the database instead of creating a second invoice.
 *
 * Contract:
 *  - same key + same body, already finished  -> the ORIGINAL result is replayed
 *  - same key + same body, still running     -> 409 `idempotency_in_progress`
 *                                               (the client polls `lookup()`)
 *  - same key + DIFFERENT body               -> 409 `idempotency_key_reused`
 *  - the work throws                         -> the claim is released so an
 *                                               honest retry can succeed
 */
class IdempotencyService
{
    public function __construct(private readonly PosContext $context) {}

    /**
     * @template T
     *
     * @param  array<string,mixed>  $request  the semantic request body
     * @param  callable(): array{model: Model|null, response: array<string,mixed>}  $work
     * @return array{response: array<string,mixed>, replayed: bool}
     */
    public function execute(string $scope, ?string $key, array $request, callable $work): array
    {
        if ($key === null || $key === '') {
            $result = $work();

            return ['response' => $result['response'], 'replayed' => false];
        }

        $hash = $this->hash($request);
        $claim = $this->claim($scope, $key, $hash);

        if ($claim['replay'] !== null) {
            return ['response' => $claim['replay'], 'replayed' => true];
        }

        $record = $claim['record'];

        try {
            $result = $work();
        } catch (\Throwable $e) {
            // Release the claim: the business transaction rolled back, so a
            // retry with the same key must be allowed to try again.
            IdempotencyKey::query()->whereKey($record->id)->delete();
            throw $e;
        }

        $model = $result['model'] ?? null;

        IdempotencyKey::query()->whereKey($record->id)->update([
            'status' => 'completed',
            'resource_type' => $model ? $model::class : null,
            'resource_id' => $model?->getKey(),
            'response' => $result['response'],
            'completed_at' => now(),
        ]);

        return ['response' => $result['response'], 'replayed' => false];
    }

    /**
     * Claim the key.
     *
     * `INSERT ... ON CONFLICT DO NOTHING` rather than catching a unique
     * violation: in PostgreSQL a failed statement aborts the whole surrounding
     * transaction, so an exception-based claim would poison a caller that is
     * already inside one. This version is safe either way.
     *
     * @return array{record: IdempotencyKey|null, replay: array<string,mixed>|null}
     */
    private function claim(string $scope, string $key, string $hash): array
    {
        $inserted = DB::select(
            'INSERT INTO idempotency_keys (scope, key, request_hash, status, user_id, terminal_id, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, now(), ?)
             ON CONFLICT (scope, key) DO NOTHING
             RETURNING id',
            [
                $scope, $key, $hash, 'in_progress',
                $this->context->userId(),
                $this->context->terminalId(),
                now()->addHours((int) config('pos.idempotency.ttl_hours', 72)),
            ],
        );

        if ($inserted !== []) {
            return ['record' => IdempotencyKey::query()->findOrFail($inserted[0]->id), 'replay' => null];
        }

        // Someone else owns this key.
        $existing = IdempotencyKey::query()->where('scope', $scope)->where('key', $key)->first();

        if (! $existing) {
            // Raced with a cleanup that removed it; try once more.
            return $this->claim($scope, $key, $hash);
        }

        if ($existing->request_hash !== $hash) {
            throw new IdempotencyConflictException(
                'تم استخدام نفس مفتاح منع التكرار بمحتوى مختلف.',
                'idempotency_key_reused',
                409,
                ['key' => $key, 'scope' => $scope],
            );
        }

        if ($existing->status === 'completed') {
            return ['record' => $existing, 'replay' => (array) $existing->response];
        }

        throw new IdempotencyConflictException(
            'العملية قيد التنفيذ بالفعل بنفس المفتاح.',
            'idempotency_in_progress',
            409,
            ['key' => $key, 'scope' => $scope],
        );
    }

    /**
     * Ask for the outcome of a previously submitted operation. This is what a
     * terminal calls when the response was lost after the request was sent —
     * instead of creating a second invoice.
     *
     * @return array<string,mixed>|null
     */
    public function lookup(string $scope, string $key): ?array
    {
        $record = IdempotencyKey::query()->where('scope', $scope)->where('key', $key)->first();

        if (! $record) {
            return null;
        }

        return [
            'status' => $record->status,
            'resource_type' => $record->resource_type,
            'resource_id' => $record->resource_id,
            'response' => $record->response,
            'created_at' => $record->created_at?->toIso8601String(),
            'completed_at' => $record->completed_at?->toIso8601String(),
        ];
    }

    /** @param array<string,mixed> $request */
    public function hash(array $request): string
    {
        return hash('sha256', $this->canonical($request));
    }

    /** Stable JSON: key order and numeric formatting must not change the hash. */
    private function canonical(mixed $value): string
    {
        if (is_array($value)) {
            $isList = array_is_list($value);
            if (! $isList) {
                ksort($value);
            }
            $parts = [];
            foreach ($value as $k => $v) {
                $parts[] = ($isList ? '' : json_encode((string) $k, JSON_UNESCAPED_UNICODE).':').$this->canonical($v);
            }

            return ($isList ? '[' : '{').implode(',', $parts).($isList ? ']' : '}');
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if ($value === null) {
            return 'null';
        }
        if (is_float($value) || is_int($value)) {
            return (string) $value;
        }

        return json_encode((string) $value, JSON_UNESCAPED_UNICODE);
    }

    public function purgeExpired(): int
    {
        return DB::table('idempotency_keys')->where('expires_at', '<', now())->delete();
    }
}
