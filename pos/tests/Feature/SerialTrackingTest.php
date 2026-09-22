<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Catalog\Models\Serial;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\ReturnService;
use App\Modules\Sales\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Acceptance 11: the same serial can never be sold twice. */
class SerialTrackingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift();
    }

    private function phone(): array
    {
        $product = $this->shop->product('PHONE-1', 'هاتف ذكي', price: '15000.00', overrides: [
            'tracking' => 'serial',
            'warranty_months' => 12,
            'prices' => [['price_list' => 'RETAIL', 'price' => '15000.00']],
        ]);

        $this->shop->receive($product, '2', '12000.00', serials: ['IMEI-0001', 'IMEI-0002']);

        return [$product, $this->shop->variantOf($product)];
    }

    public function test_selling_a_serial_marks_it_sold_and_a_second_sale_of_it_is_refused(): void
    {
        [$product, $variant] = $this->phone();

        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $variant->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '1',
                'serials' => ['IMEI-0001'],
            ]],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '15000.00', 'tendered_amount' => '15000.00']],
        ]))['sale'];

        $serial = Serial::query()->where('serial', 'IMEI-0001')->firstOrFail();
        $this->assertSame('sold', $serial->status);
        $this->assertNotNull($serial->sale_line_id);
        $this->assertNotNull($serial->warranty_until, 'يبدأ الضمان من تاريخ البيع');

        // The same handset cannot leave the shop twice.
        $this->expectExceptionMessage('الرقم التسلسلي غير متاح للبيع');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $variant->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '1',
                'serials' => ['IMEI-0001'],
            ]],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '15000.00', 'tendered_amount' => '15000.00']],
        ]));
    }

    public function test_a_serial_product_requires_one_serial_per_unit(): void
    {
        [$product, $variant] = $this->phone();

        $this->expectExceptionMessage('يجب إدخال رقم تسلسلي لكل وحدة مباعة.');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $variant->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '2',
                'serials' => ['IMEI-0001'], // only one supplied for two units
            ]],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '30000.00', 'tendered_amount' => '30000.00']],
        ]));
    }

    public function test_an_unknown_serial_is_refused(): void
    {
        [$product, $variant] = $this->phone();

        $this->expectExceptionMessage('الرقم التسلسلي غير معروف لهذا الصنف.');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $variant->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '1',
                'serials' => ['IMEI-NOT-OURS'],
            ]],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '15000.00', 'tendered_amount' => '15000.00']],
        ]));
    }

    public function test_returning_a_serial_makes_it_sellable_again_and_a_faulty_one_is_quarantined(): void
    {
        [$product, $variant] = $this->phone();

        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $variant->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '1',
                'serials' => ['IMEI-0001'],
            ]],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '15000.00', 'tendered_amount' => '15000.00']],
        ]))['sale'];

        app(ReturnService::class)->process([
            'sale_id' => $sale->id,
            'lines' => [[
                'sale_line_id' => $sale->lines->first()->id,
                'qty' => '1',
                'disposition' => 'damaged',
                'serials' => ['IMEI-0001'],
            ]],
            'reason' => 'شاشة مكسورة',
        ]);

        $serial = Serial::query()->where('serial', 'IMEI-0001')->firstOrFail();
        $this->assertSame('defective', $serial->status, 'الجهاز المعيب لا يعود لرصيد البيع');
        $this->assertSame((int) $this->shop->returnsWarehouse->id, (int) $serial->warehouse_id);
    }

    public function test_the_same_serial_cannot_be_received_twice_while_in_stock(): void
    {
        [$product] = $this->phone();

        $this->expectExceptionMessage('الرقم التسلسلي موجود بالفعل في المخزون.');

        $this->shop->receive($product, '1', '12000.00', serials: ['IMEI-0001']);
    }
}
