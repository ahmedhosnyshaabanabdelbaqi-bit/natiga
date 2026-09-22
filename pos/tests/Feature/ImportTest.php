<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Catalog\Models\Product;
use App\Modules\Core\Services\ImportService;
use App\Modules\Inventory\Services\InventoryService;
use App\Support\Exceptions\InvalidOperationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Bulk import: the wizard must show what is wrong, with row numbers, BEFORE
 * anything is written.
 */
class ImportTest extends TestCase
{
    use RefreshDatabase;

    private string $path;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->actAs($this->shop->manager);
        $this->path = sys_get_temp_dir().'/pos-import-'.uniqid().'.csv';
    }

    protected function tearDown(): void
    {
        @unlink($this->path);
        parent::tearDown();
    }

    private function write(string $contents): void
    {
        file_put_contents($this->path, "\u{FEFF}".$contents);
    }

    public function test_preview_reports_errors_with_row_numbers_and_writes_nothing(): void
    {
        $this->write(<<<'CSV'
        sku,name,barcode,unit,cost,price,opening_qty
        A-1,شاي أحمد,6221031492016,piece,22.50,30.00,48
        ,بدون كود,6221031492017,piece,10,15,5
        A-3,سعر خاطئ,6221031492018,piece,abc,20,5
        A-4,وحدة مجهولة,6221031492019,barrel,10,20,5
        A-1,كود مكرر,6221031492020,piece,10,20,5
        A-6,رصيد بلا تكلفة,6221031492021,piece,,20,5
        CSV);

        $preview = app(ImportService::class)->preview($this->path);

        $this->assertSame(6, $preview['summary']['total']);
        $this->assertSame(1, $preview['summary']['valid']);
        $this->assertSame(5, $preview['summary']['invalid']);

        $byRow = collect($preview['errors'])->groupBy('row');

        // Row numbers match what the user sees in Excel (header is row 1).
        $this->assertSame('الكود مطلوب.', $byRow[3][0]['message']);
        $this->assertStringContainsString('قيمة غير صالحة', $byRow[4][0]['message']);
        $this->assertStringContainsString('وحدة غير معروفة', $byRow[5][0]['message']);
        $this->assertStringContainsString('مكرر داخل الملف', $byRow[6][0]['message']);
        $this->assertStringContainsString('يحتاج سعر تكلفة', $byRow[7][0]['message']);

        // Nothing was written by the preview.
        $this->assertSame(0, Product::query()->count());
    }

    public function test_import_refuses_a_file_with_errors_unless_skipping_is_chosen(): void
    {
        $this->write("sku,name,unit,cost,price,opening_qty\nB-1,صنف سليم,piece,10,20,5\n,بدون كود,piece,10,20,5\n");

        try {
            app(ImportService::class)->import($this->path, (int) $this->shop->warehouse->id);
            $this->fail('كان يجب رفض الاستيراد');
        } catch (InvalidOperationException $e) {
            $this->assertSame('import_has_errors', $e->errorCode());
        }

        $this->assertSame(0, Product::query()->count());
    }

    public function test_a_clean_import_creates_products_and_posts_opening_stock_as_real_movements(): void
    {
        $this->write(<<<'CSV'
        sku,name,barcode,unit,cost,price,wholesale_price,opening_qty,min_stock,carton_factor
        C-1,زيت عافية 1 لتر,6221031492030,piece,48.00,60.00,55.00,120,12,12
        C-2,سكر 1 كجم,6221031492031,kg,28.00,34.00,32.00,200,20,
        CSV);

        $result = app(ImportService::class)->import($this->path, (int) $this->shop->warehouse->id);

        $this->assertSame(2, $result['created']);
        $this->assertSame(0, $result['skipped']);
        $this->assertSame(2, $result['opening_stock_rows']);

        $product = Product::query()->where('sku', 'C-1')->with(['variants', 'units.unit', 'barcodes'])->firstOrFail();
        $this->assertSame('زيت عافية 1 لتر', $product->name);
        // Leading-zero-safe text barcode.
        $this->assertSame('6221031492030', $product->barcodes->first()->code);
        // The carton unit came through with its factor.
        $this->assertSame('12.000000', $product->units->firstWhere('is_base', false)?->factor);

        $variantId = (int) $product->variants->first()->id;

        // Opening stock exists AND is explained by the movement ledger.
        $this->assertSame('120.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, $variantId)->toString());
        $this->assertSame('48.000000', app(InventoryService::class)
            ->averageCost((int) $this->shop->warehouse->id, $variantId)->toString(6));

        $this->assertDatabaseHas('stock_movements', [
            'variant_id' => $variantId,
            'reason' => 'purchase_receipt',
            'qty_base' => '120.0000',
        ]);

        // The derived balances agree with the ledger.
        $this->assertSame([], app(InventoryService::class)->reconcile());
    }

    public function test_skipping_invalid_rows_imports_the_rest(): void
    {
        $this->write("sku,name,unit,cost,price,opening_qty\nD-1,صنف سليم,piece,10,20,5\n,بدون كود,piece,10,20,5\n");

        $result = app(ImportService::class)->import($this->path, (int) $this->shop->warehouse->id, skipInvalid: true);

        $this->assertSame(1, $result['created']);
        $this->assertSame(1, $result['skipped']);
        $this->assertSame(1, Product::query()->count());
    }

    public function test_the_template_is_excel_friendly_arabic(): void
    {
        $template = app(ImportService::class)->template();

        $this->assertStringStartsWith("\u{FEFF}", $template, 'BOM حتى تفتح العربية صحيحة في Excel');
        $this->assertStringContainsString('sku,name', $template);
        $this->assertStringContainsString('الرصيد الافتتاحي', $template);
    }
}
