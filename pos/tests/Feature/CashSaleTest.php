<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Cash\Services\CashService;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Acceptance 1 & 2: a plain cash sale with change, and a mixed cash/card sale
 * that must NOT inflate the drawer by the card amount.
 */
class CashSaleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift(float: '500');
    }

    public function test_cash_sale_computes_change_and_moves_the_drawer_by_the_net_only(): void
    {
        $product = $this->shop->product('SKU-1', 'شاي أحمد', price: '35.00', cost: '25.00', stock: '10');
        $variant = $this->shop->variantOf($product);

        $before = app(CashService::class)->expectedCash($this->shop->shift);
        $this->assertSame('500.00', $before->toString(), 'الوردية تبدأ بالعهدة الافتتاحية فقط');

        $result = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $variant->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '2',
            ]],
            'payments' => [[
                'payment_method_id' => $this->shop->method('cash')->id,
                'amount' => '70.00',
                'tendered_amount' => '100.00', // customer hands over 100
            ]],
        ]));

        $sale = $result['sale'];

        $this->assertSame('70.0000', $sale->grand_total);
        $this->assertSame('70.0000', $sale->paid_total);
        $this->assertSame('30.0000', $sale->change_total, 'الباقي للعميل 30');
        $this->assertSame('0.0000', $sale->due_total);

        // The drawer grew by the NET receipt (70), not by the 100 handed over.
        $expected = app(CashService::class)->expectedCash($this->shop->shift->fresh());
        $this->assertSame('570.00', $expected->toString());

        // ... and both legs are auditable: 100 in, 30 out.
        $breakdown = app(CashService::class)->breakdown($this->shop->shift);
        $this->assertSame('100.00', $breakdown['sale_cash']);
        $this->assertSame('-30.00', $breakdown['change_out']);

        // Stock and cost of goods are real.
        $this->assertSame('8.0000', (string) app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, (int) $variant->id));
        $this->assertSame('50.0000', $sale->cost_total);
        $this->assertSame('20.0000', $sale->profit_total);
    }

    public function test_mixed_payment_does_not_increase_cash_by_the_card_amount(): void
    {
        $product = $this->shop->product('SKU-2', 'مكواة', price: '1000.00', cost: '700.00', stock: '5');
        $variant = $this->shop->variantOf($product);

        $result = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $variant->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '1',
            ]],
            'payments' => [
                ['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '400.00', 'tendered_amount' => '400.00'],
                ['payment_method_id' => $this->shop->method('card')->id, 'amount' => '600.00', 'reference' => 'APPR-99120'],
            ],
        ]));

        $sale = $result['sale'];
        $this->assertSame('1000.0000', $sale->grand_total);
        $this->assertSame('1000.0000', $sale->paid_total);

        // Invoice 1000 = 400 cash + 600 card -> the till rises by 400 ONLY.
        $expected = app(CashService::class)->expectedCash($this->shop->shift->fresh());
        $this->assertSame('900.00', $expected->toString(), '500 عهدة + 400 نقدي فقط');

        $this->assertSame(
            ['cash' => '400.0000', 'card' => '600.0000'],
            $sale->payments->pluck('amount', 'method_code')->all(),
        );
    }

    public function test_underpaid_cash_sale_is_refused(): void
    {
        $product = $this->shop->product('SKU-3', 'صابون', price: '20.00', cost: '12.00', stock: '10');
        $variant = $this->shop->variantOf($product);

        $this->expectExceptionMessage('المبلغ المدفوع لا يغطي قيمة الفاتورة.');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $variant->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '2',
            ]],
            'payments' => [[
                'payment_method_id' => $this->shop->method('cash')->id,
                'amount' => '30.00',
            ]],
        ]));
    }
}
