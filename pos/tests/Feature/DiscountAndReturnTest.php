<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Cash\Services\CashService;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Models\SaleLine;
use App\Modules\Sales\Models\SaleReturnLine;
use App\Modules\Sales\Services\ReturnService;
use App\Modules\Sales\Services\SaleService;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Acceptance 4 & 5: an invoice-level discount followed by a partial return that
 * is valued from the ORIGINAL invoice, and a hard stop on returning more than
 * was sold.
 */
class DiscountAndReturnTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        // The manager's own limits allow the discount used below.
        $this->shop->openShift($this->shop->manager, '500');
    }

    public function test_invoice_discount_is_spread_over_lines_and_a_partial_return_uses_the_original_values(): void
    {
        $a = $this->shop->product('P-A', 'صنف أ', price: '100.00', cost: '60.00', stock: '10');
        $b = $this->shop->product('P-B', 'صنف ب', price: '50.00', cost: '30.00', stock: '10');

        // 3 x 100 + 4 x 50 = 500, minus a 10% invoice discount = 450.
        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [
                ['variant_id' => $this->shop->variantOf($a)->id, 'product_unit_id' => $this->shop->baseUnitId($a), 'qty' => '3'],
                ['variant_id' => $this->shop->variantOf($b)->id, 'product_unit_id' => $this->shop->baseUnitId($b), 'qty' => '4'],
            ],
            'invoice_discount_type' => 'percent',
            'invoice_discount_value' => '10',
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '450.00', 'tendered_amount' => '500.00']],
        ]))['sale'];

        $this->assertSame('500.0000', $sale->subtotal);
        $this->assertSame('50.0000', $sale->invoice_discount_total);
        $this->assertSame('450.0000', $sale->grand_total);
        $this->assertSame('50.0000', $sale->change_total);

        $lines = $sale->lines->keyBy('line_no');
        // The discount lands on each line in proportion to its value:
        //   line A: 300/500 x 50 = 30   -> net 270
        //   line B: 200/500 x 50 = 20   -> net 180
        $this->assertSame('30.0000', $lines[1]->invoice_discount_share);
        $this->assertSame('20.0000', $lines[2]->invoice_discount_share);
        $this->assertSame('270.0000', $lines[1]->net_amount);
        $this->assertSame('180.0000', $lines[2]->net_amount);

        // The parts add back up to the whole: no money created or lost.
        $this->assertSame(
            $sale->grand_total,
            Money::sum($sale->lines->map(fn ($l) => Money::of($l->total_amount)))->toString(4),
        );

        // --- return 1 of the 3 units of A -------------------------------------
        $cashBefore = app(CashService::class)->expectedCash($this->shop->shift->fresh());

        $return = app(ReturnService::class)->process([
            'sale_id' => $sale->id,
            'lines' => [['sale_line_id' => $lines[1]->id, 'qty' => '1', 'disposition' => 'resalable']],
            'reason' => 'العميل غيّر رأيه',
        ])['response'];

        // 270 charged for 3 units -> exactly 90 refunded for 1 unit,
        // NOT the 100 list price.
        $this->assertSame('90.0000', $return['grand_total']);
        $this->assertSame('90.0000', $return['refund_cash']);

        $cashAfter = app(CashService::class)->expectedCash($this->shop->shift->fresh());
        $this->assertSame('-90.00', $cashAfter->minus($cashBefore)->toString());

        // A resalable return goes back into the selling warehouse.
        $this->assertSame('8.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, (int) $this->shop->variantOf($a)->id)->toString());

        // The cost reversed is the ORIGINAL cost of goods sold (60), not today's.
        $returnLine = SaleReturnLine::query()
            ->where('sale_return_id', $return['id'])->firstOrFail();
        $this->assertSame('60.0000', $returnLine->cost_amount);
        $this->assertSame('90.0000', $returnLine->total_amount);

        $this->assertSame('1.0000', SaleLine::query()->whereKey($lines[1]->id)->value('returned_qty_base'));
    }

    public function test_returning_more_than_was_sold_is_refused(): void
    {
        $product = $this->shop->product('P-C', 'صنف ج', price: '25.00', cost: '15.00', stock: '10');

        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '2']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '50.00', 'tendered_amount' => '50.00']],
        ]))['sale'];

        $lineId = $sale->lines->first()->id;

        // Return both units: allowed.
        app(ReturnService::class)->process([
            'sale_id' => $sale->id,
            'lines' => [['sale_line_id' => $lineId, 'qty' => '2']],
        ]);

        // A third unit was never sold.
        $this->expectExceptionMessage('الكمية المطلوب إرجاعها تتجاوز المتاح من هذا البند.');

        app(ReturnService::class)->process([
            'sale_id' => $sale->id,
            'lines' => [['sale_line_id' => $lineId, 'qty' => '1']],
        ]);
    }

    public function test_a_damaged_return_does_not_go_back_on_the_shelf(): void
    {
        $product = $this->shop->product('P-D', 'صنف د', price: '80.00', cost: '50.00', stock: '5');
        $variant = $this->shop->variantOf($product);

        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $variant->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '80.00', 'tendered_amount' => '80.00']],
        ]))['sale'];

        app(ReturnService::class)->process([
            'sale_id' => $sale->id,
            'lines' => [['sale_line_id' => $sale->lines->first()->id, 'qty' => '1', 'disposition' => 'damaged']],
            'reason' => 'تالف',
        ]);

        // 5 received, 1 sold, and the damaged unit is quarantined - the sellable
        // balance stays at 4.
        $this->assertSame('4.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, (int) $variant->id)->toString());
        $this->assertSame('1.0000', app(InventoryService::class)
            ->available((int) $this->shop->returnsWarehouse->id, (int) $variant->id)->toString());
    }
}
