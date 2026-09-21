<?php

namespace App\Domain\Sync;

use App\Domain\Sales\CustomerReceiptService;
use App\Domain\Sales\SalesInvoiceService;
use App\Domain\Sales\SalesReturnService;
use App\Domain\Shared\DomainException;
use App\Models\Device;
use App\Models\OfflineCreditQuota;
use App\Models\OfflineStockQuota;
use App\Models\SyncOperation;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * مزامنة عمليات الجهاز الميداني.
 *
 * ضمانات:
 *  - كل عملية لها UUID ومفتاح عدم تكرار (Idempotency Key). إعادة الإرسال بعد انقطاع
 *    الرد تُرجع نفس الإيصال ولا تنشئ فاتورة أو تحصيلًا أو حركة مخزون ثانية.
 *  - مصدر مركزي واحد للترحيل: الجهاز يقترح، والسيرفر هو من يرحّل.
 *  - لا يُستخدم «آخر تعديل يفوز» لحسم الأموال أو أرصدة المخزون؛ التعارض يُعرض للمراجعة
 *    مع الحفاظ على العملية الأصلية.
 *  - البيع الأوفلاين مقيد بحصة مخزون مخصصة للجهاز لا يستطيع جهاز آخر إنفاقها،
 *    وبحصة ائتمان محجوزة تُحتسب ضمن التعرض المركزي.
 */
class SyncService
{
    public function __construct(
        private readonly SalesInvoiceService $invoices,
        private readonly SalesReturnService $returns,
        private readonly CustomerReceiptService $receipts,
    ) {}

    /**
     * استقبال دفعة عمليات. الترتيب داخل الدفعة يُحترم، ولا يُعتمد على ترتيب وصول الشبكة.
     *
     * @param  array<int, array{uuid:string, idempotency_key:string, device_seq:int, op_type:string, payload:array}>  $operations
     * @return array<int, array{uuid:string, status:string, doc_type?:string|null, doc_id?:int|null, doc_no?:string|null, error_code?:string|null, message?:string|null}>
     */
    public function push(Device $device, array $operations): array
    {
        $this->assertDeviceUsable($device);

        $receipts = [];

        // الترتيب بتسلسل الجهاز يضمن اتساق العمليات المرتبطة
        usort($operations, fn ($a, $b) => ($a['device_seq'] ?? 0) <=> ($b['device_seq'] ?? 0));

        foreach ($operations as $operation) {
            $receipts[] = $this->processOne($device, $operation);
        }

        $device->last_sync_at = now();
        $device->save();

        return $receipts;
    }

    private function processOne(Device $device, array $operation): array
    {
        $companyId = (int) $device->company_id;
        $idempotencyKey = $operation['idempotency_key'];
        $uuid = $operation['uuid'];

        // 1) إيصال محفوظ؟ أعده كما هو دون إعادة تنفيذ
        $existing = SyncOperation::where('company_id', $companyId)
            ->where(fn ($q) => $q->where('idempotency_key', $idempotencyKey)->orWhere('operation_uuid', $uuid))
            ->first();

        if ($existing && in_array($existing->status, ['applied', 'rejected', 'conflict'], true)) {
            return $this->receiptFor($existing, replayed: true);
        }

        // 2) تسجيل العملية أولًا — حتى لو انقطع الاتصال بعد الحفظ، الإيصال موجود
        $record = $existing ?? SyncOperation::create([
            'company_id' => $companyId,
            'device_id' => $device->id,
            'operation_uuid' => $uuid,
            'idempotency_key' => $idempotencyKey,
            'device_seq' => $operation['device_seq'] ?? 0,
            'op_type' => $operation['op_type'],
            'payload' => $operation['payload'],
            'payload_hash' => hash('sha256', json_encode($operation['payload'], JSON_UNESCAPED_UNICODE)),
            'status' => 'received',
        ]);

        $record->attempts = (int) $record->attempts + 1;
        $record->status = 'processing';
        $record->save();

        try {
            $result = DB::transaction(fn () => $this->apply($device, $record));

            $record->status = 'applied';
            $record->server_doc_type = $result['doc_type'];
            $record->server_doc_id = $result['doc_id'];
            $record->server_doc_no = $result['doc_no'];
            $record->processed_at = now();
            $record->error_code = null;
            $record->error_message = null;
            $record->save();

            return $this->receiptFor($record);
        } catch (DomainException $e) {
            // خطأ قاعدة عمل: يُعرض للمراجعة ولا يُسقط العملية الأصلية
            $isConflict = in_array($e->errorCode, [
                'stock.insufficient', 'credit.limit_exceeded', 'quota.exceeded',
                'return.exceeds_sold', 'reservation.insufficient',
            ], true);

            $record->status = $isConflict ? 'conflict' : 'rejected';
            $record->error_code = $e->errorCode;
            $record->error_message = $e->getMessage();
            $record->conflict_details = $e->context;
            $record->processed_at = now();
            $record->save();

            return $this->receiptFor($record);
        } catch (Throwable $e) {
            $record->status = 'rejected';
            $record->error_code = 'server.error';
            $record->error_message = $e->getMessage();
            $record->processed_at = now();
            $record->save();

            return $this->receiptFor($record);
        }
    }

    /** @return array{doc_type:string, doc_id:int, doc_no:string} */
    private function apply(Device $device, SyncOperation $record): array
    {
        $payload = $record->payload;
        $companyId = (int) $device->company_id;
        $payload['company_id'] = $companyId;
        $payload['user_id'] = $device->user_id;

        return match ($record->op_type) {
            'sales_invoice' => $this->applySalesInvoice($device, $payload),
            'sales_return' => $this->applySalesReturn($device, $payload),
            'customer_receipt' => $this->applyCustomerReceipt($device, $payload),
            'visit' => $this->applyVisit($device, $payload),
            default => throw DomainException::make('sync.unknown_op', "نوع عملية غير مدعوم: {$record->op_type}"),
        };
    }

    private function applySalesInvoice(Device $device, array $payload): array
    {
        $companyId = (int) $device->company_id;

        // الرقم الميداني من الجهاز يُحفظ، والرقم المركزي يولّده السيرفر
        $payload['field_no'] = $payload['field_no'] ?? null;
        unset($payload['invoice_no']);

        $isCredit = ($payload['payment_type'] ?? 'credit') !== 'cash';

        // حصة المخزون المخصصة للجهاز
        $this->consumeStockQuota($device, $payload);

        $invoice = $this->invoices->create($payload);

        // حصة الائتمان الأوفلاين: تُستهلك ولا تُعدّ مرتين مع الفاتورة
        if ($isCredit) {
            $this->consumeCreditQuota($device, (int) $invoice->customer_id, $invoice->total_amount);
        }

        $invoice = $this->invoices->post($invoice, $device->user_id);

        return ['doc_type' => 'sales_invoice', 'doc_id' => (int) $invoice->id, 'doc_no' => $invoice->invoice_no];
    }

    private function applySalesReturn(Device $device, array $payload): array
    {
        unset($payload['return_no']);

        $return = $this->returns->create($payload);
        $return = $this->returns->receive($return, $device->user_id);
        $return = $this->returns->post($return, $device->user_id);

        return ['doc_type' => 'sales_return', 'doc_id' => (int) $return->id, 'doc_no' => $return->return_no];
    }

    private function applyCustomerReceipt(Device $device, array $payload): array
    {
        unset($payload['voucher_no']);

        // سند ميداني قيد المزامنة ثم يُطابق بالفواتير
        $receipt = $this->receipts->create($payload);
        $receipt = $this->receipts->post($receipt, $device->user_id);

        return ['doc_type' => 'customer_receipt', 'doc_id' => (int) $receipt->id, 'doc_no' => $receipt->voucher_no];
    }

    private function applyVisit(Device $device, array $payload): array
    {
        $visit = \App\Models\Visit::updateOrCreate(
            ['company_id' => $device->company_id, 'client_uuid' => $payload['client_uuid']],
            [
                'salesman_id' => $payload['salesman_id'],
                'customer_id' => $payload['customer_id'],
                'visit_date' => $payload['visit_date'],
                'started_at' => $payload['started_at'] ?? null,
                'ended_at' => $payload['ended_at'] ?? null,
                'result' => $payload['result'] ?? null,
                'no_purchase_reason' => $payload['no_purchase_reason'] ?? null,
                'is_planned' => $payload['is_planned'] ?? true,
                'start_latitude' => $payload['latitude'] ?? null,
                'start_longitude' => $payload['longitude'] ?? null,
                'gps_accuracy_m' => $payload['gps_accuracy_m'] ?? null,
                'gps_available' => $payload['gps_available'] ?? true,
                'notes' => $payload['notes'] ?? null,
            ],
        );

        return ['doc_type' => 'visit', 'doc_id' => (int) $visit->id, 'doc_no' => (string) $visit->id];
    }

    private function consumeStockQuota(Device $device, array $payload): void
    {
        $warehouseId = (int) $payload['warehouse_id'];

        foreach ($payload['lines'] as $line) {
            $quota = OfflineStockQuota::where('device_id', $device->id)
                ->where('warehouse_id', $warehouseId)
                ->where('item_id', $line['item_id'])
                ->where('status', 'active')
                ->lockForUpdate()
                ->first();

            // بلا حصة مخصصة: الرصيد المشترك يسمح بطلب مبدئي فقط،
            // والتحقق الفعلي من الرصيد يتم في دفتر المخزون عند الترحيل.
            if (! $quota) {
                continue;
            }

            $factor = DB::table('item_uoms')
                ->where('item_id', $line['item_id'])
                ->where('uom_id', $line['uom_id'])
                ->value('factor') ?? '1';

            $qtyBase = Dec::mul($line['qty_uom'], $factor);
            $remaining = Dec::sub($quota->qty_base, $quota->consumed_qty_base);

            if (Dec::gt($qtyBase, $remaining)) {
                throw DomainException::make(
                    'quota.exceeded',
                    "الكمية المباعة أوفلاين ({$qtyBase}) تتجاوز الحصة المخصصة لهذا الجهاز ({$remaining}).",
                    ['item_id' => $line['item_id'], 'remaining' => (string) $remaining],
                );
            }

            $quota->consumed_qty_base = (string) Dec::add($quota->consumed_qty_base, $qtyBase);
            $quota->save();
        }
    }

    private function consumeCreditQuota(Device $device, int $customerId, mixed $amount): void
    {
        $quota = OfflineCreditQuota::where('device_id', $device->id)
            ->where('customer_id', $customerId)
            ->where('status', 'active')
            ->lockForUpdate()
            ->first();

        if (! $quota) {
            return;
        }

        $remaining = Dec::sub($quota->amount, $quota->consumed_amount);

        if (Dec::gt($amount, $remaining)) {
            throw DomainException::make(
                'quota.exceeded',
                "المبلغ الآجل يتجاوز حصة الائتمان المحجوزة لهذا الجهاز (المتبقي {$remaining}).",
                ['customer_id' => $customerId, 'remaining' => (string) $remaining],
            );
        }

        $quota->consumed_amount = (string) Dec::add($quota->consumed_amount, $amount);
        $quota->save();
    }

    private function assertDeviceUsable(Device $device): void
    {
        if (! $device->is_active) {
            throw DomainException::make(
                'sync.device_inactive',
                "الجهاز موقوف: {$device->deactivation_reason}. الإيقاف يسري عند الاتصال أو انتهاء التفويض الأوفلاين.",
            );
        }
    }

    private function receiptFor(SyncOperation $record, bool $replayed = false): array
    {
        return [
            'uuid' => $record->operation_uuid,
            'idempotency_key' => $record->idempotency_key,
            'status' => $record->status,
            'replayed' => $replayed,
            'doc_type' => $record->server_doc_type,
            'doc_id' => $record->server_doc_id !== null ? (int) $record->server_doc_id : null,
            'doc_no' => $record->server_doc_no,
            'error_code' => $record->error_code,
            'message' => $record->error_message,
            'conflict' => $record->conflict_details,
            'processed_at' => $record->processed_at?->toIso8601String(),
        ];
    }

    /** حالة المزامنة للعرض في التطبيق ولوحة المشرف. */
    public function status(Device $device): array
    {
        $counts = SyncOperation::where('device_id', $device->id)
            ->selectRaw('status, COUNT(*) AS c')
            ->groupBy('status')
            ->pluck('c', 'status');

        return [
            'device_uid' => $device->device_uid,
            'last_sync_at' => $device->last_sync_at?->toIso8601String(),
            'offline_authorized_until' => $device->offline_authorized_until?->toIso8601String(),
            'is_active' => (bool) $device->is_active,
            'pending' => (int) ($counts['received'] ?? 0) + (int) ($counts['processing'] ?? 0),
            'applied' => (int) ($counts['applied'] ?? 0),
            'rejected' => (int) ($counts['rejected'] ?? 0),
            'conflicts' => (int) ($counts['conflict'] ?? 0),
        ];
    }
}
