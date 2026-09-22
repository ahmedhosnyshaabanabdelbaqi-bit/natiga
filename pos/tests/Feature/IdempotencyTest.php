<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Services\SaleService;
use App\Modules\Sync\Services\IdempotencyService;
use App\Support\Exceptions\IdempotencyConflictException;
use App\Support\Exceptions\InsufficientStockException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Acceptance 7 & 8: a double-submitted sale (impatient tap, network retry) must
 * produce ONE invoice, and a terminal whose response was lost must be able to
 * recover the original outcome instead of creating a second one.
 */
class IdempotencyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift();
    }

    private function payload(string $key): array
    {
        $product = $this->shop->product('IDEM-1', 'صنف التكرار', price: '60.00', cost: '40.00', stock: '10');

        return [
            'lines' => [[
                'variant_id' => $this->shop->variantOf($product)->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '2',
            ]],
            'payments' => [[
                'payment_method_id' => $this->shop->method('cash')->id,
                'amount' => '120.00',
                'tendered_amount' => '120.00',
            ]],
            'idempotency_key' => $key,
        ];
    }

    public function test_sending_the_same_sale_twice_creates_one_invoice_and_deducts_stock_once(): void
    {
        $payload = $this->payload('dup-key-1');
        $variantId = $payload['lines'][0]['variant_id'];

        $first = app(SaleService::class)->checkout(SaleRequest::fromArray($payload));
        $second = app(SaleService::class)->checkout(SaleRequest::fromArray($payload));

        $this->assertFalse($first['replayed']);
        $this->assertTrue($second['replayed'], 'الإرسال الثاني يعيد نفس النتيجة ولا ينشئ فاتورة جديدة');

        $this->assertSame($first['response']['id'], $second['response']['id']);
        $this->assertSame($first['response']['number'], $second['response']['number']);

        $this->assertSame(1, Sale::query()->count(), 'فاتورة واحدة فقط');

        // Stock moved once: 10 - 2 = 8.
        $this->assertSame('8.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, $variantId)->toString());
    }

    public function test_reusing_a_key_with_different_content_is_refused(): void
    {
        $payload = $this->payload('dup-key-2');
        app(SaleService::class)->checkout(SaleRequest::fromArray($payload));

        $tampered = $payload;
        $tampered['lines'][0]['qty'] = '5'; // same key, different sale

        $this->expectException(IdempotencyConflictException::class);
        $this->expectExceptionMessage('تم استخدام نفس مفتاح منع التكرار بمحتوى مختلف.');

        app(SaleService::class)->checkout(SaleRequest::fromArray($tampered));
    }

    public function test_a_lost_response_is_recovered_by_key_instead_of_reselling(): void
    {
        $payload = $this->payload('lost-response-1');

        // The sale succeeded on the server; the terminal never saw the reply.
        $original = app(SaleService::class)->checkout(SaleRequest::fromArray($payload));

        $recovered = app(IdempotencyService::class)->lookup('sale', 'lost-response-1');

        $this->assertNotNull($recovered);
        $this->assertSame('completed', $recovered['status']);
        $this->assertSame(Sale::class, $recovered['resource_type']);
        $this->assertSame($original['response']['id'], $recovered['resource_id']);
        $this->assertSame($original['response']['number'], $recovered['response']['number']);

        $this->assertSame(1, Sale::query()->count());
    }

    public function test_a_failed_sale_releases_its_key_so_an_honest_retry_can_succeed(): void
    {
        $product = $this->shop->product('IDEM-2', 'صنف نافد', price: '30.00', cost: '20.00', stock: '1');

        $payload = [
            'lines' => [[
                'variant_id' => $this->shop->variantOf($product)->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '5', // more than the single unit in stock
            ]],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '150.00', 'tendered_amount' => '150.00']],
            'idempotency_key' => 'retry-key-1',
        ];

        try {
            app(SaleService::class)->checkout(SaleRequest::fromArray($payload));
            $this->fail('كان يجب رفض البيع لعدم كفاية الرصيد');
        } catch (InsufficientStockException) {
            // expected
        }

        $this->assertSame(0, Sale::query()->count(), 'لا فاتورة بعد الفشل');

        // The same key now works for a quantity that is actually available.
        $payload['lines'][0]['qty'] = '1';
        $payload['payments'][0]['amount'] = '30.00';
        $payload['payments'][0]['tendered_amount'] = '30.00';

        $result = app(SaleService::class)->checkout(SaleRequest::fromArray($payload));

        $this->assertFalse($result['replayed']);
        $this->assertSame(1, Sale::query()->count());
    }
}
