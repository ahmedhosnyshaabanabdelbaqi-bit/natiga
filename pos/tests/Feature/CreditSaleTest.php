<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Cash\Services\CashService;
use App\Modules\Customers\Services\CollectionService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\ReturnService;
use App\Modules\Sales\Services\SaleService;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Acceptance 10: a credit sale, then a partial collection, then a return —
 * the return must reduce the DEBT before any cash is handed over.
 */
class CreditSaleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        // Credit selling needs `sales.credit`, which the cashier role lacks.
        $this->shop->openShift($this->shop->manager, '0');
    }

    public function test_credit_sale_then_partial_collection_then_return(): void
    {
        $customer = $this->shop->customer(credit: true, limit: '5000');
        $product = $this->shop->product('CR-1', 'ثلاجة', price: '1000.00', cost: '700.00', stock: '5');

        // --- 1. sell 1 on credit, customer pays 200 now -----------------------
        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'customer_id' => $customer->id,
            'is_credit' => true,
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '200.00', 'tendered_amount' => '200.00']],
        ]))['sale'];

        $this->assertSame('1000.0000', $sale->grand_total);
        $this->assertSame('200.0000', $sale->paid_total);
        $this->assertSame('800.0000', $sale->due_total);
        $this->assertTrue($sale->is_credit);

        $this->assertSame('800.0000', $customer->fresh()->balance, 'المديونية 800');
        // The drawer only ever holds what was actually handed over.
        $this->assertSame('200.00', app(CashService::class)->expectedCash($this->shop->shift->fresh())->toString());

        // --- 2. collect 300 later ---------------------------------------------
        app(CollectionService::class)->collect([
            'customer_id' => $customer->id,
            'payment_method_id' => $this->shop->method('cash')->id,
            'amount' => '300.00',
        ]);

        $this->assertSame('500.0000', $customer->fresh()->balance, 'المديونية 800 - 300 = 500');
        // 200 sale + 300 collection: the same pound is never counted twice.
        $this->assertSame('500.00', app(CashService::class)->expectedCash($this->shop->shift->fresh())->toString());

        $breakdown = app(CashService::class)->breakdown($this->shop->shift);
        $this->assertSame('200.00', $breakdown['sale_cash']);
        $this->assertSame('300.00', $breakdown['collection']);

        // --- 3. return the item ------------------------------------------------
        $return = app(ReturnService::class)->process([
            'sale_id' => $sale->id,
            'lines' => [['sale_line_id' => $sale->lines->first()->id, 'qty' => '1']],
            'reason' => 'عيب صناعة',
        ])['response'];

        $this->assertSame('1000.0000', $return['grand_total']);
        // The outstanding 500 is cleared FIRST; only the remaining 500 is money.
        $this->assertSame('500.0000', $return['credit_applied']);
        $this->assertSame('500.0000', $return['refund_cash']);

        $this->assertSame('0.0000', $customer->fresh()->balance, 'المديونية صفر بعد المرتجع');

        // 500 in the drawer, 500 refunded -> zero.
        $this->assertSame('0.00', app(CashService::class)->expectedCash($this->shop->shift->fresh())->toString());
    }

    public function test_a_credit_sale_without_a_customer_is_refused(): void
    {
        $product = $this->shop->product('CR-2', 'غسالة', price: '500.00', cost: '350.00', stock: '2');

        $this->expectExceptionMessage('البيع الآجل يتطلب اختيار عميل معروف.');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'is_credit' => true,
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'payments' => [],
        ]));
    }

    public function test_the_credit_limit_is_enforced(): void
    {
        $customer = $this->shop->customer('C-LIMIT', 'عميل محدود', credit: true, limit: '300');
        $product = $this->shop->product('CR-3', 'بوتاجاز', price: '500.00', cost: '350.00', stock: '2');

        $this->expectExceptionMessage('تجاوز الحد الائتماني المسموح به للعميل.');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'customer_id' => $customer->id,
            'is_credit' => true,
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'payments' => [],
        ]));
    }

    public function test_collecting_more_than_the_debt_is_refused(): void
    {
        $customer = $this->shop->customer('C-OVER', 'عميل', credit: true, limit: '5000');
        $product = $this->shop->product('CR-4', 'مروحة', price: '200.00', cost: '120.00', stock: '5');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'customer_id' => $customer->id,
            'is_credit' => true,
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'payments' => [],
        ]));

        $this->expectExceptionMessage('قيمة التحصيل تتجاوز مديونية العميل.');

        app(CollectionService::class)->collect([
            'customer_id' => $customer->id,
            'payment_method_id' => $this->shop->method('cash')->id,
            'amount' => '250.00',
        ]);
    }
}
