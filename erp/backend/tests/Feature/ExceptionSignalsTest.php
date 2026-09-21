<?php

namespace Tests\Feature;

use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Sales\CustomerReceiptService;
use App\Domain\Sales\SalesInvoiceService;
use App\Models\ExceptionSignal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * مركز الاستثناءات: إشارات للمراجعة البشرية وليست اتهامات ولا جزاءات آلية.
 */
class ExceptionSignalsTest extends TestCase
{
    use RefreshDatabase;

    private ScenarioBuilder $env;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = (new ScenarioBuilder)->build();

        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'receipt_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '100',
                'unit_price' => '50',
            ]],
        ]);
    }

    public function test_low_margin_sale_raises_a_signal_for_review_only(): void
    {
        // بيع بسعر 51 وتكلفة 50 ← هامش ~2% أقل من الحد 5%
        $invoice = app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => 'cash',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '10',
                'unit_price' => '51',
            ]],
        ]);

        Artisan::call('schedule:test', ['--name' => 'generate-exception-signals']);

        $signal = ExceptionSignal::where('signal_type', 'low_margin')
            ->where('source_id', $invoice->id)
            ->first();

        $this->assertNotNull($signal, 'يجب أن تُرفع إشارة للبيع بهامش منخفض');
        $this->assertSame('open', $signal->status, 'الإشارة للمراجعة، لا إجراء آلي');
        $this->assertSame('warning', $signal->severity);
        $this->assertNull($signal->reviewed_by, 'لا يُتخذ قرار آليًا');
        $this->assertStringContainsString('هامش', $signal->description);

        // الفاتورة نفسها لم تتأثر: الإشارة ليست جزاءً
        $this->assertSame('posted', $invoice->fresh()->status);
    }

    public function test_healthy_margin_does_not_raise_a_signal(): void
    {
        app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => 'cash',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '10',
                'unit_price' => '80',
            ]],
        ]);

        Artisan::call('schedule:test', ['--name' => 'generate-exception-signals']);

        $this->assertSame(0, ExceptionSignal::where('signal_type', 'low_margin')->count());
    }

    public function test_undeposited_custody_older_than_two_days_raises_a_signal(): void
    {
        $invoice = app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'invoice_date' => now()->subDays(5)->toDateString(),
            'payment_type' => 'credit',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '10',
                'unit_price' => '80',
            ]],
        ]);

        // تحصيل قديم لم يُورَّد
        app(CustomerReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'receipt_date' => now()->subDays(4)->toDateString(),
            'payment_method' => 'cash',
            'amount' => '500',
            'user_id' => $this->env->user->id,
            'allocations' => [['sales_invoice_id' => $invoice->id, 'amount' => '500']],
        ]);

        Artisan::call('schedule:test', ['--name' => 'generate-exception-signals']);

        $signal = ExceptionSignal::where('signal_type', 'late_deposit')->first();

        $this->assertNotNull($signal, 'العهدة غير المورَّدة منذ أكثر من يومين يجب أن تُرفع للمراجعة');
        $this->assertSame('open', $signal->status);
        $this->assertStringContainsString('لم يُورَّد', $signal->description);
    }

    public function test_signals_are_not_duplicated_on_repeated_runs(): void
    {
        app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => 'cash',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '5',
                'unit_price' => '51',
            ]],
        ]);

        Artisan::call('schedule:test', ['--name' => 'generate-exception-signals']);
        Artisan::call('schedule:test', ['--name' => 'generate-exception-signals']);
        Artisan::call('schedule:test', ['--name' => 'generate-exception-signals']);

        $this->assertSame(1, ExceptionSignal::where('signal_type', 'low_margin')->count());
    }

    public function test_expired_offline_quotas_are_deactivated_by_the_scheduler(): void
    {
        $device = \App\Models\Device::create([
            'company_id' => $this->env->company->id,
            'salesman_id' => $this->env->salesman->id,
            'device_uid' => 'DEV-EXPIRE',
            'is_active' => true,
        ]);

        \App\Models\OfflineCreditQuota::create([
            'company_id' => $this->env->company->id,
            'device_id' => $device->id,
            'customer_id' => $this->env->customer->id,
            'amount' => '5000',
            'expires_at' => now()->subHour(),
            'status' => 'active',
        ]);

        // قبل التنظيف: الحصة المنتهية ما زالت active لكنها مستبعدة من التعرض
        $exposure = app(\App\Domain\Credit\CreditService::class)
            ->exposure((int) $this->env->company->id, (int) $this->env->customer->id);
        $this->assertSame('0.0000', $exposure['offline_reserved'], 'الحصة المنتهية لا تُحتسب في التعرض');

        Artisan::call('schedule:test', ['--name' => 'expire-offline-quotas']);

        $this->assertDatabaseHas('offline_credit_quotas', [
            'device_id' => $device->id,
            'status' => 'expired',
        ]);
    }
}
