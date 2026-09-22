<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Catalog\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The till's HTTP surface, exercised the way a browser actually calls it.
 *
 * These exist because a real bug slipped through: query-string identifiers
 * arrive as STRINGS, and the strictly-typed service signatures behind the
 * controller rejected them with a 500. Unit-testing the service could never
 * catch that — only calling the endpoint the way the client does.
 */
class PosEndpointsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift();
        Sanctum::actingAs($this->shop->manager);
    }

    private function headers(): array
    {
        return ['X-POS-Terminal' => $this->shop->terminal->code];
    }

    public function test_search_accepts_query_string_identifiers(): void
    {
        $product = $this->shop->product('EP-1', 'شامبو للأطفال', price: '95.00', cost: '60.00', stock: '10');

        // Exactly what the browser sends: every value is a string.
        $response = $this->withHeaders($this->headers())->getJson(
            '/api/v1/pos/search?q=شامبو'
            .'&warehouse_id='.$this->shop->warehouse->id
            .'&category_id='
            .'&per_page=60'
            .'&page=1',
        );

        $response->assertOk();
        $response->assertJsonPath('data.0.name', 'شامبو للأطفال');
        $response->assertJsonPath('data.0.unit_price', '95.00');
        $response->assertJsonPath('data.0.available', '10.0000');
        $this->assertSame($product->id, $response->json('data.0.product_id'));
    }

    public function test_search_without_a_term_returns_the_catalogue_page(): void
    {
        $this->shop->product('EP-2', 'صنف أول', price: '10.00', cost: '5.00', stock: '3');
        $this->shop->product('EP-3', 'صنف ثانٍ', price: '20.00', cost: '9.00', stock: '4');

        // The till loads this on boot so the touch grid is never blank.
        $response = $this->withHeaders($this->headers())
            ->getJson('/api/v1/pos/search?warehouse_id='.$this->shop->warehouse->id);

        $response->assertOk();
        $this->assertGreaterThanOrEqual(2, $response->json('total'));
    }

    public function test_scan_resolves_a_barcode_into_a_cart_line(): void
    {
        $this->shop->product('EP-4', 'شاي أخضر', price: '42.50', cost: '30.00', stock: '7');

        $response = $this->withHeaders($this->headers())->postJson('/api/v1/pos/scan', [
            'code' => 'BC-EP-4',
            'warehouse_id' => (string) $this->shop->warehouse->id, // a string, as a client may send
        ]);

        $response->assertOk();
        $response->assertJsonPath('name', 'شاي أخضر');
        $response->assertJsonPath('unit_price', '42.50');
        $response->assertJsonPath('qty', '1.0000');
        $response->assertJsonPath('mergeable', true);
    }

    public function test_an_unknown_barcode_returns_a_distinct_code_and_never_invents_a_product(): void
    {
        $response = $this->withHeaders($this->headers())
            ->postJson('/api/v1/pos/scan', ['code' => 'NOT-A-REAL-BARCODE']);

        $response->assertNotFound();
        $response->assertJsonPath('error_code', 'barcode_not_found');
        $this->assertSame(0, Product::query()->count());
    }

    public function test_bootstrap_returns_everything_the_till_needs_to_start(): void
    {
        $response = $this->withHeaders($this->headers())->getJson('/api/v1/pos/bootstrap');

        $response->assertOk();
        $response->assertJsonPath('terminal.code', $this->shop->terminal->code);
        $response->assertJsonPath('shift.status', 'open');
        $response->assertJsonStructure([
            'terminal', 'branch_id', 'shift', 'layout', 'features',
            'currency' => ['code', 'scale', 'cash_step'],
            'payment_methods', 'categories', 'server_time',
        ]);

        // The cash method must be present, or the till cannot take money.
        $this->assertContains('cash', array_column($response->json('payment_methods'), 'code'));
    }
}
