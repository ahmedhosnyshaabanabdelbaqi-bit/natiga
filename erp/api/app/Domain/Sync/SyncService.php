<?php

namespace App\Domain\Sync;

use App\Domain\Credit\CreditService;
use App\Domain\Sales\InvoiceService;
use App\Domain\Sales\SalesOrderService;
use App\Domain\Sales\SalesReturnService;
use App\Domain\Support\Num;
use App\Domain\Treasury\CollectionService;
use App\Exceptions\DomainException;
use App\Models\Customer;
use App\Models\Device;
use App\Models\OfflineGrant;
use App\Models\SyncConflict;
use App\Models\SyncOperation;
use App\Models\Visit;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Inbound sync from the rep's device.
 *
 * Contract:
 *  - The device sends OPERATIONS ("create this invoice"), never results ("the
 *    balance is now X"). The server is the only thing that posts.
 *  - Every operation carries a client UUID and an idempotency key unique per
 *    company. Re-sending after a lost response returns the ORIGINAL receipt;
 *    it never creates a second document. That is enforced by a unique index,
 *    so it holds even if two retries arrive at the same instant.
 *  - Operations are applied in client sequence order, and an operation whose
 *    `depends_on` has not been applied is deferred — arrival order over a flaky
 *    network is not trusted.
 *  - "Last write wins" is never used for money or stock. A conflict is recorded
 *    for a human to look at, and the original field operation is preserved.
 */
class SyncService
{
    public function __construct(
        private readonly SalesOrderService $orders,
        private readonly InvoiceService $invoices,
        private readonly CollectionService $collections,
        private readonly SalesReturnService $returns,
        private readonly CreditService $credit,
    ) {}

    /**
     * Accept a batch of operations and return a receipt for each.
     *
     * Each operation runs in its own transaction, so one bad operation does not
     * roll back the ones that already succeeded — a rep with twenty good sales
     * and one problem should not lose the twenty.
     *
     * @param  array<int, array<string, mixed>>  $operations
     * @return array<int, array<string, mixed>>
     */
    public function push(Device $device, array $operations): array
    {
        $receipts = [];

        // Client sequence is the device's own ordering; honour it over arrival.
        usort($operations, fn ($a, $b) => ($a['client_seq'] ?? 0) <=> ($b['client_seq'] ?? 0));

        $applied = [];

        foreach ($operations as $payload) {
            $receipts[] = $this->applyOne($device, $payload, $applied);
        }

        $device->forceFill([
            'last_seen_at' => now(),
            'last_sync_at' => now(),
            'last_client_seq' => max(
                $device->last_client_seq,
                collect($operations)->max('client_seq') ?? 0
            ),
        ])->save();

        return $receipts;
    }

    /** @param array<string, true> $applied operation ids already applied in this batch */
    protected function applyOne(Device $device, array $payload, array &$applied): array
    {
        $idempotencyKey = $payload['idempotency_key'] ?? $payload['id'] ?? null;

        if (! $idempotencyKey) {
            return [
                'operation_id' => $payload['id'] ?? null,
                'status' => 'rejected',
                'error_code' => 'sync.missing_idempotency_key',
                'error_message' => 'العملية بدون مفتاح عدم تكرار.',
            ];
        }

        // A replay short-circuits here with the original outcome.
        $existing = SyncOperation::query()->where('idempotency_key', $idempotencyKey)->first();

        if ($existing && $existing->status !== 'pending') {
            return $existing->toReceipt();
        }

        $operation = $existing ?? $this->recordOperation($device, $payload, $idempotencyKey);

        // Ordering guard: hold an operation whose prerequisite has not landed.
        if ($operation->depends_on
            && ! isset($applied[$operation->depends_on])
            && ! SyncOperation::query()->where('id', $operation->depends_on)->where('status', 'applied')->exists()) {
            $operation->forceFill([
                'status' => 'pending',
                'error_code' => 'sync.waiting_dependency',
                'error_message' => 'بانتظار وصول عملية سابقة مرتبطة.',
            ])->save();

            return $operation->toReceipt();
        }

        try {
            $result = DB::transaction(function () use ($operation, $device) {
                $this->assertDeviceMayAct($device, $operation);

                return match ($operation->op_type) {
                    'sales_order.create' => $this->applySalesOrder($operation),
                    'sales_invoice.create' => $this->applyDirectInvoice($operation, $device),
                    'receipt.create' => $this->applyReceipt($operation),
                    'sales_return.create' => $this->applySalesReturn($operation),
                    'visit.record' => $this->applyVisit($operation, $device),
                    default => throw DomainException::make('sync.unknown_op_type',
                        "نوع عملية غير مدعوم: {$operation->op_type}", ['op_type' => $operation->op_type]),
                };
            });

            $operation->forceFill([
                'status' => 'applied',
                'server_doc_type' => $result['doc_type'],
                'server_doc_id' => $result['doc_id'],
                'server_doc_code' => $result['doc_code'] ?? null,
                'processed_at' => now(),
                'error_code' => null,
                'error_message' => null,
            ])->save();

            $applied[$operation->id] = true;

            return $operation->toReceipt();
        } catch (DomainException $e) {
            return $this->recordFailure($operation, $e->errorCode, $e->getMessage(), $e->context);
        } catch (\Throwable $e) {
            Log::error('Sync operation failed', [
                'operation_id' => $operation->id,
                'op_type' => $operation->op_type,
                'exception' => $e->getMessage(),
            ]);

            return $this->recordFailure($operation, 'sync.server_error',
                'تعذر تنفيذ العملية على السيرفر. سيتم عرضها للمراجعة.');
        }
    }

    protected function recordOperation(Device $device, array $payload, string $idempotencyKey): SyncOperation
    {
        try {
            return SyncOperation::create([
                'id' => $payload['id'] ?? (string) \Illuminate\Support\Str::uuid(),
                'company_id' => CompanyContext::idOrFail(),
                'device_id' => $device->id,
                'user_id' => $device->user_id,
                'idempotency_key' => $idempotencyKey,
                'client_seq' => $payload['client_seq'] ?? 0,
                'op_type' => $payload['op_type'],
                'payload' => $payload['payload'] ?? [],
                'depends_on' => $payload['depends_on'] ?? null,
                'status' => 'pending',
                'client_created_at' => $payload['client_created_at'] ?? now(),
                'app_version' => $payload['app_version'] ?? $device->app_version,
                'received_at' => now(),
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            // Two retries raced; the winner's row is the one that counts.
            return SyncOperation::query()->where('idempotency_key', $idempotencyKey)->firstOrFail();
        }
    }

    /**
     * Failures that mean "a human must look at this" become conflicts rather
     * than silent rejections — money the rep actually collected must never
     * simply disappear.
     */
    protected function recordFailure(SyncOperation $operation, string $code, string $message, array $context = []): array
    {
        $isConflict = in_array($code, [
            'stock.insufficient',
            'credit.limit_exceeded',
            'credit.customer_on_hold',
            'treasury.over_allocation',
            'sales.return_exceeds_sold',
        ], true);

        $operation->forceFill([
            'status' => $isConflict ? 'conflict' : 'rejected',
            'error_code' => $code,
            'error_message' => $message,
            'attempts' => $operation->attempts + 1,
            'processed_at' => now(),
        ])->save();

        if ($isConflict) {
            SyncConflict::firstOrCreate(
                ['company_id' => $operation->company_id, 'sync_operation_id' => $operation->id],
                [
                    'kind' => $code,
                    'details' => $context + ['payload' => $operation->payload],
                    'status' => 'open',
                ]
            );
        }

        return $operation->toReceipt();
    }

    /**
     * Offline authority check.
     *
     * A device may only create documents while it holds a live grant. Blocking a
     * device takes effect the next time it connects or when its grant runs out —
     * this system does not pretend it can reach a phone that is switched off.
     */
    protected function assertDeviceMayAct(Device $device, SyncOperation $operation): void
    {
        if ($device->status !== 'active') {
            throw DomainException::make('sync.device_blocked',
                'الجهاز موقوف. تواصل مع المشرف.', ['device_id' => $device->id]);
        }

        if (! in_array($operation->op_type, ['sales_invoice.create', 'sales_order.create'], true)) {
            return;
        }

        $grant = OfflineGrant::query()
            ->where('device_id', $device->id)
            ->where('status', 'active')
            ->where('valid_from', '<=', $operation->client_created_at ?? now())
            ->where('valid_to', '>=', $operation->client_created_at ?? now())
            ->first();

        if (! $grant) {
            throw DomainException::make('sync.no_offline_grant',
                'لا يوجد تفويض بيع أوفلاين ساري لهذا الجهاز في وقت العملية.',
                ['device_id' => $device->id]);
        }

        $docValue = Num::money(data_get($operation->payload, 'header.total', '0'));

        if (Num::isPositive($grant->max_doc_value, Num::MONEY_SCALE)
            && Num::cmp($docValue, $grant->max_doc_value, Num::MONEY_SCALE) > 0) {
            throw DomainException::make('sync.doc_value_exceeds_grant', sprintf(
                'قيمة المستند (%s) تتجاوز حد التفويض الأوفلاين (%s).',
                $docValue, $grant->max_doc_value
            ), ['limit' => (string) $grant->max_doc_value]);
        }
    }

    // ------------------------------------------------------------- handlers

    protected function applySalesOrder(SyncOperation $operation): array
    {
        $payload = $operation->payload;

        $order = $this->orders->create(
            array_merge($payload['header'], [
                'source' => 'mobile',
                'device_id' => $operation->device_id,
                'client_uuid' => $operation->id,
                'rep_id' => $payload['header']['rep_id'] ?? $operation->user_id,
            ]),
            $payload['lines']
        );

        // An order from the field is a request, not a fait accompli: it is
        // approved only if it passes the same credit and stock checks as one
        // typed in the office. A failure surfaces as a conflict to review.
        try {
            $this->orders->approve($order);
        } catch (DomainException $e) {
            if ($e->errorCode === 'credit.limit_exceeded') {
                $covered = $this->credit->consumeDeviceReservation(
                    $order->customer, $operation->device_id, (string) $order->total
                );

                if (Num::cmp($covered, $order->total, Num::MONEY_SCALE) >= 0) {
                    $this->orders->approve($order, creditOverrideApproved: true);

                    return ['doc_type' => 'sales_order', 'doc_id' => $order->id, 'doc_code' => $order->code];
                }
            }
            throw $e;
        }

        return ['doc_type' => 'sales_order', 'doc_id' => $order->id, 'doc_code' => $order->code];
    }

    protected function applyDirectInvoice(SyncOperation $operation, Device $device): array
    {
        $payload = $operation->payload;
        $header = $payload['header'];

        $customer = Customer::findOrFail($header['customer_id']);
        $isCredit = ($header['payment_type'] ?? 'cash') !== 'cash';

        $invoice = $this->invoices->createDirect(
            array_merge($header, [
                'source' => 'mobile',
                'device_id' => $device->id,
                'client_uuid' => $operation->id,
                // The device's own reference. It is NOT a tax number and is kept
                // distinct from the server-issued code for exactly that reason.
                'field_no' => $header['field_no'] ?? null,
                'rep_id' => $header['rep_id'] ?? $operation->user_id,
            ]),
            $payload['lines']
        );

        $creditOverride = false;

        if ($isCredit) {
            // A credit sale made offline must be backed by a reserved slice;
            // otherwise it goes through the normal live credit check.
            $covered = $this->credit->consumeDeviceReservation(
                $customer, $device->id, (string) $invoice->total
            );
            $creditOverride = Num::cmp($covered, $invoice->total, Num::MONEY_SCALE) >= 0;
        }

        $invoice = $this->invoices->post($invoice, creditOverrideApproved: $creditOverride);

        return ['doc_type' => 'sales_invoice', 'doc_id' => $invoice->id, 'doc_code' => $invoice->code];
    }

    /**
     * A field collection is always recorded, even when it does not fit.
     *
     * If the allocations no longer match (the invoice was settled centrally in
     * the meantime), the money is kept as an unallocated credit for review
     * instead of being dropped. The rep took real cash from a real customer.
     */
    protected function applyReceipt(SyncOperation $operation): array
    {
        $payload = $operation->payload;

        $receipt = $this->collections->create(
            array_merge($payload['header'], [
                'source' => 'mobile',
                'device_id' => $operation->device_id,
                'client_uuid' => $operation->id,
                'rep_id' => $payload['header']['rep_id'] ?? $operation->user_id,
                'destination' => $payload['header']['destination'] ?? 'custody',
                'field_no' => $payload['header']['field_no'] ?? null,
            ])
        );

        $receipt = $this->collections->post($receipt);

        if (! empty($payload['allocations'])) {
            try {
                $this->collections->allocate($receipt, $payload['allocations']);
            } catch (DomainException $e) {
                // Keep the money, flag the mismatch.
                SyncConflict::firstOrCreate(
                    ['company_id' => $operation->company_id, 'sync_operation_id' => $operation->id],
                    [
                        'kind' => 'receipt_allocation_mismatch',
                        'details' => [
                            'receipt_id' => $receipt->id,
                            'receipt_code' => $receipt->code,
                            'amount' => (string) $receipt->amount,
                            'reason' => $e->getMessage(),
                            'requested_allocations' => $payload['allocations'],
                        ],
                        'status' => 'open',
                        'note' => 'المبلغ محفوظ كدفعة غير موزعة بانتظار المراجعة.',
                    ]
                );
            }
        }

        return ['doc_type' => 'receipt', 'doc_id' => $receipt->id, 'doc_code' => $receipt->code];
    }

    protected function applySalesReturn(SyncOperation $operation): array
    {
        $payload = $operation->payload;

        $return = $this->returns->create(
            array_merge($payload['header'], [
                'source' => 'mobile',
                'device_id' => $operation->device_id,
                'client_uuid' => $operation->id,
                'rep_id' => $payload['header']['rep_id'] ?? $operation->user_id,
            ]),
            $payload['lines']
        );

        // Received into the van; financial approval stays a separate decision.
        $return = $this->returns->receive($return);

        return ['doc_type' => 'sales_return', 'doc_id' => $return->id, 'doc_code' => $return->code];
    }

    protected function applyVisit(SyncOperation $operation, Device $device): array
    {
        $payload = $operation->payload;

        $visit = Visit::updateOrCreate(
            ['company_id' => $operation->company_id, 'client_uuid' => $operation->id],
            [
                'rep_id' => $payload['rep_id'] ?? $operation->user_id,
                'customer_id' => $payload['customer_id'],
                'visit_plan_line_id' => $payload['visit_plan_line_id'] ?? null,
                'business_date' => $payload['business_date'] ?? now()->toDateString(),
                'started_at' => $payload['started_at'] ?? null,
                'ended_at' => $payload['ended_at'] ?? null,
                'outcome' => $payload['outcome'] ?? null,
                'reason_code' => $payload['reason_code'] ?? null,
                'is_productive' => in_array($payload['outcome'] ?? '', ['order', 'collection', 'return'], true),
                'gps_lat' => $payload['gps_lat'] ?? null,
                'gps_lng' => $payload['gps_lng'] ?? null,
                'gps_accuracy_m' => $payload['gps_accuracy_m'] ?? null,
                'is_unplanned' => empty($payload['visit_plan_line_id']),
                'device_id' => $device->id,
                'notes' => $payload['notes'] ?? null,
            ]
        );

        return ['doc_type' => 'visit', 'doc_id' => $visit->id];
    }
}
