<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Catalog\Models\Price;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Models\HeldCart;
use App\Modules\Sales\Services\HeldCartService;
use App\Modules\Sales\Services\SaleService;
use App\Support\Exceptions\ConcurrencyConflictException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Acceptance 12: a parked cart survives the page being closed, and the same
 * hold cannot be checked out from two terminals.
 */
class HeldCartTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift();
    }

    private function cartPayload(): array
    {
        $product = $this->shop->product('HC-1', 'صنف معلق', price: '75.00', cost: '40.00', stock: '10');

        return [
            'warehouse_id' => $this->shop->warehouse->id,
            'lines' => [[
                'variant_id' => $this->shop->variantOf($product)->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '2',
                'unit_price' => '75.00',
            ]],
        ];
    }

    public function test_a_parked_cart_is_restored_with_its_contents_after_the_page_closes(): void
    {
        $payload = $this->cartPayload();

        $cart = app(HeldCartService::class)->hold('الزبون صاحب القبعة', $payload);

        $this->assertSame('open', $cart->status);

        // A new browser session: the cart comes back from the SERVER, not from
        // browser storage.
        $restored = HeldCart::query()->where('uuid', $cart->uuid)->firstOrFail();
        $this->assertSame('2', $restored->payload['lines'][0]['qty']);
        $this->assertSame('75.00', $restored->payload['lines'][0]['unit_price']);

        $recalled = app(HeldCartService::class)->recall($restored, $restored->version);
        $this->assertSame('recalled', $recalled['cart']->status);
        $this->assertSame([], $recalled['differences'], 'لا فروق: السعر والرصيد كما هما');
    }

    public function test_parking_a_cart_does_not_reserve_stock(): void
    {
        $payload = $this->cartPayload();
        $variantId = $payload['lines'][0]['variant_id'];

        app(HeldCartService::class)->hold('معلقة', $payload);

        $this->assertSame('10.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, $variantId)->toString(),
            'التعليق لا يخصم المخزون');
    }

    public function test_the_same_hold_cannot_be_claimed_by_two_terminals(): void
    {
        $cart = app(HeldCartService::class)->hold('مشتركة', $this->cartPayload());
        $version = $cart->version;

        app(HeldCartService::class)->recall($cart->fresh(), $version);

        // The second till still holds the stale version.
        $this->expectException(ConcurrencyConflictException::class);
        $this->expectExceptionMessage('الفاتورة المعلقة مستخدمة بالفعل على جهاز آخر.');

        app(HeldCartService::class)->recall($cart->fresh(), $version);
    }

    public function test_recalling_an_old_cart_reports_price_and_stock_differences(): void
    {
        $payload = $this->cartPayload();
        $variantId = $payload['lines'][0]['variant_id'];

        // The cart was parked at 75; the shelf price moved to 90.
        $payload['lines'][0]['unit_price'] = '75.00';
        $cart = app(HeldCartService::class)->hold('قديمة', $payload);

        Price::query()
            ->where('variant_id', $variantId)
            ->update(['price' => '90.0000']);

        $result = app(HeldCartService::class)->recall($cart->fresh(), $cart->version);

        $this->assertNotEmpty($result['differences']);
        $this->assertSame('price_changed', $result['differences'][0]['type']);
        $this->assertSame('75.00', $result['differences'][0]['old']);
        $this->assertSame('90.00', $result['differences'][0]['new']);
    }

    public function test_converting_a_hold_into_a_sale_closes_it(): void
    {
        $payload = $this->cartPayload();
        $cart = app(HeldCartService::class)->hold('للتحويل', $payload);
        app(HeldCartService::class)->recall($cart->fresh(), $cart->version);

        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $payload['lines'][0]['variant_id'],
                'product_unit_id' => $payload['lines'][0]['product_unit_id'],
                'qty' => '2',
            ]],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '150.00', 'tendered_amount' => '150.00']],
            'held_cart_id' => $cart->id,
        ]))['sale'];

        $converted = $cart->fresh();
        $this->assertSame('converted', $converted->status);
        $this->assertSame($sale->id, $converted->sale_id);
    }

    public function test_an_optimistic_update_conflict_is_reported(): void
    {
        $cart = app(HeldCartService::class)->hold('تعديل متزامن', $this->cartPayload());
        $stale = $cart->version;

        app(HeldCartService::class)->update($cart->fresh(), $this->cartPayload(), $stale);

        $this->expectExceptionMessage('تم تعديل الفاتورة المعلقة من جهاز آخر.');
        app(HeldCartService::class)->update($cart->fresh(), $this->cartPayload(), $stale);
    }
}
