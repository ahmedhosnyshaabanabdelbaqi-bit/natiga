<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Acceptance 3: selling one carton plus two loose pieces must take 14 pieces
 * out of stock when a carton holds 12.
 */
class UnitConversionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift();
    }

    public function test_selling_a_carton_and_two_pieces_deducts_fourteen_base_units(): void
    {
        $product = $this->shop->product('JUICE-1', 'عصير برتقال', price: '10.00', overrides: [
            'units' => [['unit' => 'carton', 'factor' => '12']],
            'prices' => [
                ['price_list' => 'RETAIL', 'price' => '10.00'],                    // per piece
                ['price_list' => 'RETAIL', 'price' => '110.00', 'unit' => 'carton'], // carton is cheaper than 12x
            ],
        ]);

        // Receive 5 cartons = 60 pieces at 90 per carton (7.5 per piece).
        $this->shop->receive($product, '5', '90.00', unitCode: 'carton');

        $variant = $this->shop->variantOf($product);
        $pieceUnit = $product->units()->where('is_base', true)->firstOrFail();
        $cartonUnit = $product->units()->whereHas('unit', fn ($q) => $q->where('code', 'carton'))->firstOrFail();

        $this->assertSame('60.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, (int) $variant->id)->toString());
        // 90 per carton / 12 = 7.5 per base piece
        $this->assertSame('7.500000', app(InventoryService::class)
            ->averageCost((int) $this->shop->warehouse->id, (int) $variant->id)->toString(6));

        $result = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [
                ['variant_id' => $variant->id, 'product_unit_id' => $cartonUnit->id, 'qty' => '1'],
                ['variant_id' => $variant->id, 'product_unit_id' => $pieceUnit->id, 'qty' => '2'],
            ],
            'payments' => [[
                'payment_method_id' => $this->shop->method('cash')->id,
                'amount' => '130.00', // 110 carton + 2 x 10
                'tendered_amount' => '130.00',
            ]],
        ]));

        $sale = $result['sale'];
        $this->assertSame('130.0000', $sale->grand_total);

        // 60 - 12 - 2 = 46 pieces left.
        $this->assertSame('46.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, (int) $variant->id)->toString());

        // Cost follows the same conversion: 14 pieces x 7.5 = 105.
        $this->assertSame('105.0000', $sale->cost_total);

        $lines = $sale->lines->keyBy('line_no');
        $this->assertSame('12.0000', $lines[1]->qty_base, 'الكرتونة = 12 قطعة في المخزون');
        $this->assertSame('1.0000', $lines[1]->qty, 'ويُعرض في الفاتورة ككرتونة واحدة');
        $this->assertSame('2.0000', $lines[2]->qty_base);
    }

    public function test_a_piece_product_refuses_a_fractional_quantity(): void
    {
        $product = $this->shop->product('SHOE-1', 'حذاء رياضي', price: '500.00', cost: '300.00', stock: '10');
        $variant = $this->shop->variantOf($product);

        $this->expectExceptionMessage('هذا الصنف يُباع بالقطعة الكاملة ولا يقبل كسورًا.');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $variant->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1.5']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '750.00']],
        ]));
    }

    public function test_a_weighted_product_accepts_fractional_quantities(): void
    {
        $product = $this->shop->product('MEAT-1', 'لحم مفروم', price: '400.00', overrides: [
            'type' => 'weighted',
            'base_unit' => 'kg',
            'allow_fractional_qty' => true,
            'prices' => [['price_list' => 'RETAIL', 'price' => '400.00']],
        ]);
        $this->shop->receive($product, '20', '300.00');

        $variant = $this->shop->variantOf($product);

        $result = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $variant->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '0.750']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '300.00', 'tendered_amount' => '300.00']],
        ]));

        $this->assertSame('300.0000', $result['sale']->grand_total, '0.750 كجم × 400 = 300');
        $this->assertSame('19.2500', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, (int) $variant->id)->toString());
    }
}
