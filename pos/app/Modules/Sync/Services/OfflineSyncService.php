<?php

declare(strict_types=1);

namespace App\Modules\Sync\Services;

use App\Models\User;
use App\Modules\Access\Services\AuditService;
use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SettingsService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Services\SaleService;
use App\Modules\Sync\Models\DeviceSyncState;
use App\Modules\Sync\Models\OfflineOperation;
use App\Support\Exceptions\DomainException;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Uploading work a terminal captured while the server was unreachable.
 *
 * Principles:
 *  - every local operation carries a client-generated UUID; re-sending it is a
 *    no-op that returns the SAME result (the uuid column is unique);
 *  - money already taken from a customer is never silently altered. If prices,
 *    stock or permissions have moved on, the operation is parked as a CONFLICT
 *    for a manager, with the collected amount preserved;
 *  - high-risk operations (returns, credit, loyalty redemption, price
 *    overrides, serial sales) are refused offline by policy;
 *  - a sale created offline is marked `origin = offline` and is not treated as a
 *    confirmed document until it has synced.
 */
class OfflineSyncService
{
    public function __construct(
        private readonly SaleService $sales,
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly PosContext $context,
    ) {}

    /**
     * @param  list<array{uuid:string, type:string, payload:array<string,mixed>, client_created_at?:string|null}>  $operations
     * @return array{accepted:int, duplicates:int, conflicts:int, rejected:int, results:list<array<string,mixed>>}
     */
    public function push(Terminal $terminal, array $operations): array
    {
        $summary = ['accepted' => 0, 'duplicates' => 0, 'conflicts' => 0, 'rejected' => 0, 'results' => []];

        foreach ($operations as $operation) {
            $summary['results'][] = $outcome = $this->ingest($terminal, $operation);
            $summary[$outcome['status'] === 'applied' ? 'accepted' : ($outcome['status'] === 'duplicate' ? 'duplicates' : ($outcome['status'] === 'conflict' ? 'conflicts' : 'rejected'))]++;
        }

        DeviceSyncState::query()->updateOrCreate(
            ['terminal_id' => $terminal->id],
            [
                'last_push_at' => now(),
                'pending_operations' => OfflineOperation::query()
                    ->where('terminal_id', $terminal->id)
                    ->whereIn('status', ['pending', 'conflict'])
                    ->count(),
            ],
        );

        $terminal->forceFill(['last_seen_at' => now()])->save();

        return $summary;
    }

    /**
     * @param  array{uuid:string, type:string, payload:array<string,mixed>, client_created_at?:string|null}  $operation
     * @return array<string,mixed>
     */
    private function ingest(Terminal $terminal, array $operation): array
    {
        $existing = OfflineOperation::query()->where('uuid', $operation['uuid'])->first();

        // Re-sending the same local operation must not duplicate its effect.
        if ($existing) {
            return [
                'uuid' => $operation['uuid'],
                'status' => $existing->status === 'applied' ? 'duplicate' : $existing->status,
                'resource_type' => $existing->resource_type,
                'resource_id' => $existing->resource_id,
                'conflicts' => $existing->conflicts,
            ];
        }

        $record = OfflineOperation::query()->create([
            'uuid' => $operation['uuid'],
            'terminal_id' => $terminal->id,
            'user_id' => $this->context->userId(),
            'type' => $operation['type'],
            'payload' => $operation['payload'],
            'payload_hash' => hash('sha256', json_encode($operation['payload'], JSON_UNESCAPED_UNICODE)),
            'status' => 'pending',
            'client_created_at' => $operation['client_created_at'] ?? null,
        ]);

        try {
            $violations = $this->policyViolations($terminal, $operation);

            if ($violations !== []) {
                return $this->park($record, $violations, 'rejected');
            }

            return match ($operation['type']) {
                'sale' => $this->applySale($record, $terminal),
                default => $this->park($record, [[
                    'type' => 'unsupported_operation',
                    'message' => 'نوع العملية غير مدعوم في المزامنة.',
                ]], 'rejected'),
            };
        } catch (DomainException $e) {
            // Business rules moved on. Keep the operation AND the money it
            // collected, and hand it to a manager.
            return $this->park($record, [[
                'type' => $e->errorCode(),
                'message' => $e->getMessage(),
                'context' => $e->context(),
            ]], 'conflict');
        }
    }

    /** @return array<string,mixed> */
    private function applySale(OfflineOperation $record, Terminal $terminal): array
    {
        $payload = $record->payload;

        // An offline invoice that was already accepted under its own uuid is
        // recovered, not recreated.
        $existingSale = Sale::query()->where('offline_uid', $record->uuid)->first();
        if ($existingSale) {
            $record->forceFill([
                'status' => 'applied',
                'resource_type' => Sale::class,
                'resource_id' => $existingSale->id,
                'resolved_at' => now(),
            ])->save();

            return ['uuid' => $record->uuid, 'status' => 'duplicate', 'resource_id' => $existingSale->id];
        }

        $request = SaleRequest::fromArray($payload + [
            'origin' => Sale::ORIGIN_OFFLINE,
            'offline_uid' => $record->uuid,
            'idempotency_key' => 'offline:'.$record->uuid,
        ]);

        $result = $this->sales->checkout($request);
        $sale = $result['sale'];

        $record->forceFill([
            'status' => 'applied',
            'resource_type' => Sale::class,
            'resource_id' => $sale?->id,
            'resolved_at' => now(),
        ])->save();

        $this->audit->log('offline.sale_synced', $sale, null, [
            'offline_uid' => $record->uuid,
            'terminal' => $terminal->code,
            'grand_total' => $sale?->grand_total,
        ]);

        return [
            'uuid' => $record->uuid,
            'status' => 'applied',
            'resource_type' => Sale::class,
            'resource_id' => $sale?->id,
            'number' => $sale?->number,
        ];
    }

    /**
     * Offline policy, checked on the server. The client enforces the same rules
     * for usability, but only this check is binding.
     *
     * @return list<array<string,mixed>>
     */
    private function policyViolations(Terminal $terminal, array $operation): array
    {
        $violations = [];
        $payload = $operation['payload'];

        if (! $this->settings->feature('offline_mode', (int) $terminal->branch_id)) {
            $violations[] = ['type' => 'offline_disabled', 'message' => 'العمل دون خادم غير مفعل لهذه المنشأة.'];
        }

        if (! $terminal->offline_allowed) {
            $violations[] = ['type' => 'terminal_not_authorized', 'message' => 'هذا الجهاز غير معتمد للبيع دون خادم.'];
        }

        // Blocked high-risk operations.
        $blocked = (array) config('pos.offline.blocked_operations', []);
        if ($operation['type'] !== 'sale' && in_array($operation['type'], $blocked, true)) {
            $violations[] = ['type' => 'operation_blocked_offline', 'message' => 'هذه العملية ممنوعة دون اتصال.'];
        }

        if ($operation['type'] === 'sale') {
            if (! empty($payload['is_credit'])) {
                $violations[] = ['type' => 'credit_blocked_offline', 'message' => 'البيع الآجل ممنوع دون اتصال.'];
            }

            // Only pre-approved payment methods.
            $allowed = (array) config('pos.offline.allowed_payment_methods', ['cash']);
            foreach ($payload['payments'] ?? [] as $payment) {
                $code = PaymentMethod::query()->whereKey($payment['payment_method_id'] ?? 0)->value('code');
                if (! in_array($code, $allowed, true)) {
                    $violations[] = [
                        'type' => 'payment_method_blocked_offline',
                        'message' => 'طريقة الدفع غير مسموح بها دون اتصال.',
                        'context' => ['method' => $code],
                    ];
                }
            }

            // Ceiling per device.
            $max = Money::of((string) ($terminal->offline_max_sale_amount ?: config('pos.offline.max_sale_amount', '0')));
            $total = Money::of((string) ($payload['expected_grand_total'] ?? '0'));
            if ($max->isPositive() && $total->isGreaterThan($max)) {
                $violations[] = [
                    'type' => 'offline_amount_exceeded',
                    'message' => 'قيمة الفاتورة تتجاوز الحد المسموح دون اتصال.',
                    'context' => ['max' => $max->toString(), 'total' => $total->toString()],
                ];
            }

            // Serial-tracked goods are never sold blind.
            foreach ($payload['lines'] ?? [] as $line) {
                if (! empty($line['serials'])) {
                    $violations[] = ['type' => 'serial_sale_blocked_offline', 'message' => 'بيع الأصناف المتتبعة بالسيريال ممنوع دون اتصال.'];
                    break;
                }
                if (isset($line['unit_price'])) {
                    $violations[] = ['type' => 'price_override_blocked_offline', 'message' => 'تعديل السعر ممنوع دون اتصال.'];
                    break;
                }
            }

            // Operating window.
            $maxHours = (int) ($terminal->offline_max_hours ?: config('pos.offline.max_hours', 12));
            $createdAt = $operation['client_created_at'] ?? null;
            if ($createdAt && CarbonImmutable::parse($createdAt)->addHours($maxHours)->isPast()) {
                $violations[] = [
                    'type' => 'offline_window_expired',
                    'message' => 'مضت مدة أطول من المسموح على العملية المحلية؛ تحتاج مراجعة المدير.',
                    'context' => ['max_hours' => $maxHours],
                ];
            }
        }

        return $violations;
    }

    /**
     * @param  list<array<string,mixed>>  $conflicts
     * @return array<string,mixed>
     */
    private function park(OfflineOperation $record, array $conflicts, string $status): array
    {
        $record->forceFill(['status' => $status, 'conflicts' => $conflicts])->save();

        $this->audit->log('offline.operation_'.$status, $record, null, [
            'uuid' => $record->uuid,
            'type' => $record->type,
            'conflicts' => $conflicts,
        ]);

        return [
            'uuid' => $record->uuid,
            'status' => $status,
            'conflicts' => $conflicts,
            // The amount the customer actually paid is echoed back so nothing
            // about it is lost or quietly rewritten.
            'collected_amount' => $record->payload['expected_grand_total'] ?? null,
        ];
    }

    /**
     * Manager resolution of a parked operation.
     * `accept` re-runs it under the manager's authority; `reject` files it with
     * a reason. Neither path erases the record or the money it reports.
     */
    public function resolve(OfflineOperation $record, User $manager, string $decision, ?string $note = null): OfflineOperation
    {
        if (! in_array($record->status, ['conflict', 'rejected'], true)) {
            throw new InvalidOperationException('هذه العملية لا تحتاج تسوية.', 'operation_not_parked', 422);
        }

        return DB::transaction(function () use ($record, $manager, $decision, $note): OfflineOperation {
            if ($decision === 'accept') {
                $terminal = Terminal::query()->findOrFail($record->terminal_id);
                $request = SaleRequest::fromArray($record->payload + [
                    'origin' => Sale::ORIGIN_OFFLINE,
                    'offline_uid' => $record->uuid,
                    'idempotency_key' => 'offline:'.$record->uuid,
                    // The manager has reviewed the difference; the server still
                    // recalculates the totals from its own prices.
                    'expected_grand_total' => null,
                ]);

                $result = $this->sales->checkout($request);

                $record->forceFill([
                    'status' => 'applied',
                    'resource_type' => Sale::class,
                    'resource_id' => $result['sale']?->id,
                    'resolved_by' => $manager->id,
                    'resolved_at' => now(),
                    'resolution_note' => $note,
                ])->save();
            } else {
                $record->forceFill([
                    'status' => 'resolved',
                    'resolved_by' => $manager->id,
                    'resolved_at' => now(),
                    'resolution_note' => $note,
                ])->save();
            }

            $this->audit->log('offline.operation_resolved', $record, null, [
                'decision' => $decision,
                'manager' => $manager->id,
            ], $note);

            return $record->refresh();
        });
    }

    /** @return array<string,mixed> */
    public function status(Terminal $terminal): array
    {
        $pending = OfflineOperation::query()->where('terminal_id', $terminal->id)->where('status', 'pending')->count();
        $conflicts = OfflineOperation::query()->where('terminal_id', $terminal->id)->where('status', 'conflict')->count();
        $state = DeviceSyncState::query()->where('terminal_id', $terminal->id)->first();

        return [
            'terminal' => $terminal->code,
            'offline_allowed' => (bool) $terminal->offline_allowed,
            'pending_operations' => $pending,
            'conflicts' => $conflicts,
            'last_push_at' => $state?->last_push_at?->toIso8601String(),
            'last_pull_at' => $state?->last_pull_at?->toIso8601String(),
            'server_time' => now()->toIso8601String(),
        ];
    }
}
