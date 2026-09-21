<?php

namespace Tests\Feature;

use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Sync\SyncService;
use App\Models\Device;
use App\Models\OfflineCreditQuota;
use App\Models\OfflineStockQuota;
use App\Models\SalesInvoice;
use App\Support\Dec;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * المزامنة والعمل دون اتصال (البند ١٨ و٢٢):
 *  - إعادة إرسال نفس الفاتورة/التحصيل لا تنشئ مستندًا ثانيًا.
 *  - انقطاع الشبكة بعد حفظ السيرفر وقبل وصول الرد: إعادة المحاولة تُرجع نفس الإيصال.
 *  - البيع الأوفلاين مقيد بحصة مخزون لا يستطيع جهاز آخر إنفاقها.
 *  - البيع الآجل الأوفلاين مقيد بحصة ائتمان محجوزة تُحتسب ضمن التعرض المركزي.
 *  - التعارض يُعرض للمراجعة ولا يُسقط العملية الأصلية.
 *  - الرقم الميداني يختلف عن الرقم المركزي.
 */
class SyncIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private ScenarioBuilder $env;
    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = (new ScenarioBuilder)->build();

        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'receipt_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '100',
                'unit_price' => '50',
            ]],
        ]);

        $this->device = Device::create([
            'company_id' => $this->env->company->id,
            'user_id' => $this->env->user->id,
            'salesman_id' => $this->env->salesman->id,
            'device_uid' => 'ANDROID-TEST-001',
            'label' => 'جهاز مندوب اختبار',
            'platform' => 'android',
            'is_active' => true,
            'offline_authorized_until' => now()->addDay(),
        ]);
    }

    private function invoiceOperation(string $uuid, string $key, string $qty = '5', int $seq = 1): array
    {
        return [
            'uuid' => $uuid,
            'idempotency_key' => $key,
            'device_seq' => $seq,
            'op_type' => 'sales_invoice',
            'payload' => [
                'customer_id' => $this->env->customer->id,
                'salesman_id' => $this->env->salesman->id,
                'warehouse_id' => $this->env->vanWarehouse->id,
                'invoice_date' => now()->toDateString(),
                'payment_type' => 'credit',
                'channel' => 'van_sale',
                'field_no' => 'FIELD-0001',
                'lines' => [[
                    'item_id' => $this->env->item->id,
                    'uom_id' => $this->env->pieceUom->id,
                    'qty_uom' => $qty,
                    'unit_price' => '80',
                ]],
            ],
        ];
    }

    public function test_resending_the_same_invoice_does_not_create_a_second_document(): void
    {
        $uuid = (string) Str::uuid();
        $key = 'INV-'.$uuid;

        $first = app(SyncService::class)->push($this->device, [$this->invoiceOperation($uuid, $key)]);

        $this->assertSame('applied', $first[0]['status']);
        $this->assertFalse($first[0]['replayed']);
        $this->assertSame(1, SalesInvoice::count());

        // إعادة الإرسال بعد انقطاع الرد — نفس المفتاح
        $second = app(SyncService::class)->push($this->device, [$this->invoiceOperation($uuid, $key)]);

        $this->assertSame('applied', $second[0]['status']);
        $this->assertTrue($second[0]['replayed'], 'يجب إرجاع الإيصال المحفوظ وليس تنفيذ العملية مرة ثانية');
        $this->assertSame($first[0]['doc_id'], $second[0]['doc_id'], 'نفس المستند');
        $this->assertSame($first[0]['doc_no'], $second[0]['doc_no']);

        $this->assertSame(1, SalesInvoice::count(), 'لا تُنشأ فاتورة ثانية');
        $this->assertSame(
            '95.000000',
            Dec::qty(DB::table('stock_balances')->where('warehouse_id', $this->env->vanWarehouse->id)->sum('qty_base')),
            'لا تُخصم البضاعة مرتين',
        );

        $lines = DB::table('journal_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->where('journal_entries.source_type', 'sales_invoice')
            ->count();
        $this->assertSame(2, $lines, 'قيد إيراد واحد فقط بسطرين');
    }

    public function test_field_number_is_kept_separate_from_the_central_number(): void
    {
        $uuid = (string) Str::uuid();
        $result = app(SyncService::class)->push($this->device, [$this->invoiceOperation($uuid, 'K-'.$uuid)]);

        $invoice = SalesInvoice::findOrFail($result[0]['doc_id']);

        $this->assertSame('FIELD-0001', $invoice->field_no, 'الرقم الميداني محفوظ كما أرسله الجهاز');
        $this->assertNotSame('FIELD-0001', $invoice->invoice_no, 'الرقم المركزي يولّده السيرفر');
        $this->assertStringStartsWith('INV-', $invoice->invoice_no);
        $this->assertSame('not_submitted', $invoice->etax_status, 'لا يُدّعى قبول مستند ضريبي قبل التقديم');
    }

    public function test_resending_the_same_receipt_does_not_double_credit_the_customer(): void
    {
        $uuid = (string) Str::uuid();
        $invoiceResult = app(SyncService::class)->push($this->device, [$this->invoiceOperation($uuid, 'K-'.$uuid)]);
        $invoiceId = $invoiceResult[0]['doc_id'];

        $receiptUuid = (string) Str::uuid();
        $receiptOp = [
            'uuid' => $receiptUuid,
            'idempotency_key' => 'RCT-'.$receiptUuid,
            'device_seq' => 2,
            'op_type' => 'customer_receipt',
            'payload' => [
                'customer_id' => $this->env->customer->id,
                'salesman_id' => $this->env->salesman->id,
                'receipt_date' => now()->toDateString(),
                'payment_method' => 'cash',
                'amount' => '200',
                'field_no' => 'FRCT-0001',
                'allocations' => [['sales_invoice_id' => $invoiceId, 'amount' => '200']],
            ],
        ];

        app(SyncService::class)->push($this->device, [$receiptOp]);
        app(SyncService::class)->push($this->device, [$receiptOp]);
        app(SyncService::class)->push($this->device, [$receiptOp]);

        $this->assertSame(1, DB::table('customer_receipts')->count(), 'سند قبض واحد فقط');
        $this->assertSame('200.0000', Dec::money(SalesInvoice::find($invoiceId)->paid_amount), 'لا يُسدد العميل مرتين');
    }

    public function test_offline_stock_quota_limits_what_a_device_can_sell(): void
    {
        OfflineStockQuota::create([
            'company_id' => $this->env->company->id,
            'device_id' => $this->device->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'item_id' => $this->env->item->id,
            'qty_base' => '10',
            'expires_at' => now()->addDay(),
            'status' => 'active',
        ]);

        $u1 = (string) Str::uuid();
        $ok = app(SyncService::class)->push($this->device, [$this->invoiceOperation($u1, 'K1-'.$u1, '8')]);
        $this->assertSame('applied', $ok[0]['status']);

        // المتبقي 2 فقط — محاولة بيع 5 تُعرض كتعارض للمراجعة
        $u2 = (string) Str::uuid();
        $conflict = app(SyncService::class)->push($this->device, [$this->invoiceOperation($u2, 'K2-'.$u2, '5', 2)]);

        $this->assertSame('conflict', $conflict[0]['status']);
        $this->assertSame('quota.exceeded', $conflict[0]['error_code']);
        $this->assertSame(1, SalesInvoice::count(), 'العملية المرفوضة لا تنشئ مستندًا');

        // العملية الأصلية محفوظة للمراجعة ولم تُسقط
        $this->assertDatabaseHas('sync_operations', [
            'operation_uuid' => $u2,
            'status' => 'conflict',
        ]);
    }

    public function test_offline_credit_quota_is_counted_in_central_exposure_and_limits_credit_sales(): void
    {
        $this->env->customer->update(['credit_limit' => '1000']);

        OfflineCreditQuota::create([
            'company_id' => $this->env->company->id,
            'device_id' => $this->device->id,
            'customer_id' => $this->env->customer->id,
            'amount' => '400',
            'expires_at' => now()->addDay(),
            'status' => 'active',
            'granted_by' => $this->env->user->id,
        ]);

        // الحصة المحجوزة تظهر في التعرض المركزي وتُستبعد من المتاح للآخرين
        $exposure = app(\App\Domain\Credit\CreditService::class)
            ->exposure((int) $this->env->company->id, (int) $this->env->customer->id);

        $this->assertSame('400.0000', $exposure['offline_reserved']);
        $this->assertSame('400.0000', $exposure['total_exposure']);
        $this->assertSame('600.0000', $exposure['available_credit']);

        // بيع 5 × 80 = 400 ضمن الحصة
        $u1 = (string) Str::uuid();
        $ok = app(SyncService::class)->push($this->device, [$this->invoiceOperation($u1, 'C1-'.$u1, '5')]);
        $this->assertSame('applied', $ok[0]['status']);

        // تجاوز الحصة يُرفض كتعارض
        $u2 = (string) Str::uuid();
        $conflict = app(SyncService::class)->push($this->device, [$this->invoiceOperation($u2, 'C2-'.$u2, '1', 2)]);

        $this->assertSame('conflict', $conflict[0]['status']);
        $this->assertSame('quota.exceeded', $conflict[0]['error_code']);
    }

    public function test_deactivated_device_cannot_sync(): void
    {
        $this->device->update(['is_active' => false, 'deactivation_reason' => 'فقدان الجهاز']);

        $this->expectException(\App\Domain\Shared\DomainException::class);
        $this->expectExceptionMessageMatches('/الجهاز موقوف/u');

        $u = (string) Str::uuid();
        app(SyncService::class)->push($this->device, [$this->invoiceOperation($u, 'D-'.$u)]);
    }

    public function test_sync_status_reports_pending_and_conflicts(): void
    {
        OfflineStockQuota::create([
            'company_id' => $this->env->company->id,
            'device_id' => $this->device->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'item_id' => $this->env->item->id,
            'qty_base' => '1',
            'status' => 'active',
        ]);

        $u = (string) Str::uuid();
        app(SyncService::class)->push($this->device, [$this->invoiceOperation($u, 'S-'.$u, '5')]);

        $status = app(SyncService::class)->status($this->device->fresh());

        $this->assertSame(1, $status['conflicts']);
        $this->assertSame(0, $status['applied']);
        $this->assertNotNull($status['last_sync_at']);
    }
}
