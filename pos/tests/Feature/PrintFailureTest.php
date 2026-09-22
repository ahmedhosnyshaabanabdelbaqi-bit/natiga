<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Access\Models\AuditLog;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Printing\Services\PrintService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Services\SaleService;
use App\Modules\Sync\Models\OutboxMessage;
use App\Modules\Sync\Services\OutboxService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Acceptance 9: the printer failing AFTER a sale is committed must neither void
 * the sale nor cause it to be recorded a second time.
 */
class PrintFailureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift();
    }

    private function sell(): Sale
    {
        $product = $this->shop->product('PR-1', 'صنف طباعة', price: '120.00', cost: '80.00', stock: '5');

        return app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '120.00', 'tendered_amount' => '120.00']],
        ]))['sale'];
    }

    public function test_a_failed_print_leaves_the_sale_intact_and_is_retried_on_its_own(): void
    {
        $sale = $this->sell();
        $variantId = $sale->lines->first()->variant_id;

        // The side effect is queued AFTER the money transaction commits.
        $this->assertDatabaseHas('outbox_messages', ['topic' => 'sale.completed', 'status' => 'pending']);

        $job = app(PrintService::class)->queueReceipt($sale);
        app(PrintService::class)->markFailed($job, 'Printer offline: /dev/usb/lp0');

        $job->refresh();
        $this->assertSame('failed', $job->status);
        $this->assertSame(1, (int) $job->attempts);

        // The sale is untouched: still exactly one, still paid, stock still moved once.
        $this->assertSame(1, Sale::query()->count());
        $this->assertSame('completed', $sale->fresh()->status);
        $this->assertSame('120.0000', $sale->fresh()->paid_total);
        $this->assertSame('4.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, $variantId)->toString());

        // The failure shows up in a queue the cashier can act on.
        $this->assertCount(1, app(PrintService::class)->failedFor($this->shop->terminal->id));

        // Retrying prints only; it does not re-run the sale.
        app(PrintService::class)->retry($job);
        $this->assertSame('pending', $job->fresh()->status);
        $this->assertSame(1, Sale::query()->count());
    }

    public function test_a_reprint_is_marked_as_a_copy_and_logged(): void
    {
        $sale = $this->sell();

        $job = app(PrintService::class)->queueReceipt($sale, isReprint: true);

        $this->assertTrue($job->is_reprint);
        $this->assertSame('نسخة', $job->payload['copy_label']);
        $this->assertSame(1, (int) $sale->fresh()->print_count);

        $audit = AuditLog::query()->where('action', 'sale.reprinted')->firstOrFail();
        $this->assertSame($this->shop->cashier->id, $audit->user_id);
        $this->assertSame(Sale::class, $audit->auditable_type);
    }

    public function test_an_unsynced_offline_receipt_says_so_on_its_face(): void
    {
        $sale = $this->sell();
        // Simulate a receipt printed on the terminal before the server confirmed.
        $sale->forceFill(['origin' => Sale::ORIGIN_OFFLINE, 'synced_at' => null])->save();

        $payload = app(PrintService::class)->receiptPayload($sale->fresh());

        $this->assertTrue($payload['provisional']);
        $this->assertSame('مستند غير متزامن — في انتظار اعتماد الخادم', $payload['provisional_label']);
    }

    public function test_the_receipt_carries_the_figures_the_customer_needs(): void
    {
        $sale = $this->sell();
        $payload = app(PrintService::class)->receiptPayload($sale);

        $this->assertSame($sale->number, $payload['number']);
        $this->assertSame('120.0000', $payload['grand_total']);
        $this->assertSame($this->shop->cashier->name, $payload['cashier']);
        $this->assertCount(1, $payload['lines']);
        $this->assertSame('cash', $payload['payments'][0]['method']);
        $this->assertFalse($payload['is_reprint']);
    }

    public function test_the_outbox_backs_off_instead_of_repeating_the_effect(): void
    {
        $this->sell();
        $message = OutboxMessage::query()->where('topic', 'sale.completed')->firstOrFail();

        app(OutboxService::class)->markFailed($message, 'connection refused');

        $message->refresh();
        $this->assertSame(1, (int) $message->attempts);
        $this->assertSame('pending', $message->status);
        $this->assertTrue($message->available_at->isFuture(), 'إعادة المحاولة مؤجلة بتباعد متزايد');
    }
}
