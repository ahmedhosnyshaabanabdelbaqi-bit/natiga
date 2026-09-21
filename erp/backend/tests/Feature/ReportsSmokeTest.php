<?php

namespace Tests\Feature;

use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Sales\CustomerReceiptService;
use App\Domain\Sales\SalesInvoiceService;
use App\Support\Dec;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * تشغيل كل التقارير ببيانات حقيقية والتحقق من المطابقة.
 * يغطي الثغرة التي ظهرت عند التشغيل الفعلي: استعلامات تواريخ بلا تحويل نوع صريح.
 */
class ReportsSmokeTest extends TestCase
{
    use RefreshDatabase;

    private ScenarioBuilder $env;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = (new ScenarioBuilder)->build();

        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'receipt_date' => now()->subDays(5)->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '200',
                'unit_price' => '50',
            ]],
        ]);

        // فاتورة متأخرة السداد لتغطية شرائح أعمار الديون
        $overdue = app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'invoice_date' => now()->subDays(4)->toDateString(),
            'due_date' => now()->subDays(45)->toDateString(),
            'payment_type' => 'credit',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '10',
                'unit_price' => '80',
            ]],
        ]);

        // فاتورة جارية
        app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(30)->toDateString(),
            'payment_type' => 'credit',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '5',
                'unit_price' => '80',
            ]],
        ]);

        app(CustomerReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'receipt_date' => now()->toDateString(),
            'payment_method' => 'cash',
            'amount' => '200',
            'user_id' => $this->env->user->id,
            'allocations' => [['sales_invoice_id' => $overdue->id, 'amount' => '200']],
        ]);

        Sanctum::actingAs($this->env->user);
    }

    public function test_all_report_endpoints_return_data(): void
    {
        foreach ([
            '/api/v1/dashboard',
            '/api/v1/reports/sales',
            '/api/v1/reports/sales?group_by=customer',
            '/api/v1/reports/sales?group_by=salesman',
            '/api/v1/reports/sales?group_by=item',
            '/api/v1/reports/sales?group_by=brand',
            '/api/v1/reports/item-performance',
            '/api/v1/reports/inventory-valuation',
            '/api/v1/reports/aging',
            '/api/v1/reports/trial-balance',
            '/api/v1/reports/income-statement',
            '/api/v1/reports/salesmen',
            '/api/v1/customers/aging',
        ] as $endpoint) {
            $this->getJson($endpoint)->assertOk();
        }
    }

    public function test_aging_buckets_split_by_due_date_not_invoice_date(): void
    {
        $body = $this->getJson('/api/v1/reports/aging')->assertOk()->json('data');

        $this->assertNotEmpty($body['rows']);
        $row = $body['rows'][0];

        // فاتورة استحقاقها قبل 45 يومًا → شريحة 31-60، والجارية → current
        $this->assertSame('600.0000', $row['days_31_60'], '800 − 200 مسدد = 600 في شريحة 31-60');
        $this->assertSame('400.0000', $row['current'], 'الفاتورة الجارية 400');
        $this->assertSame('1000.0000', $row['total']);
    }

    public function test_inventory_valuation_reconciles_with_the_general_ledger(): void
    {
        $body = $this->getJson('/api/v1/reports/inventory-valuation')->assertOk()->json('data');

        $this->assertTrue($body['reconciled'], 'قيمة المخزون يجب أن تطابق حساب المخزون في الأستاذ');
        $this->assertSame($body['total_value'], $body['gl_inventory_balance']);
        $this->assertSame('المتوسط المرجح المتحرك', $body['method']);
    }

    public function test_trial_balance_is_balanced(): void
    {
        $body = $this->getJson('/api/v1/reports/trial-balance', )->assertOk()->json('data');

        $this->assertTrue($body['totals']['balanced']);
        $this->assertTrue(Dec::eq($body['totals']['debit'], $body['totals']['credit']));
    }

    public function test_income_statement_separates_gross_from_net_profit(): void
    {
        $summary = $this->getJson('/api/v1/reports/income-statement')->assertOk()->json('data.summary');

        $this->assertSame('1200.0000', $summary['revenue'], '15 قطعة × 80');
        $this->assertSame('750.0000', $summary['cost_of_sales'], '15 × 50');
        $this->assertSame('450.0000', $summary['gross_profit']);
        $this->assertSame('450.0000', $summary['net_profit'], 'لا مصروفات تشغيلية في هذه الفترة');
        $this->assertNotEmpty($this->getJson('/api/v1/reports/income-statement')->json('data.caveat'));
    }

    public function test_sales_report_totals_cover_all_results_not_just_the_page(): void
    {
        $body = $this->getJson('/api/v1/reports/sales')->assertOk()->json('data');

        $this->assertSame('1200.0000', $body['summary_all_results']['net_sales']);
        $this->assertSame(2, $body['summary_all_results']['invoices_count']);
        $this->assertArrayHasKey('gross_profit', $body['summary_all_results']);
        $this->assertNotNull($body['generated_at']);
    }

    public function test_list_endpoints_report_totals_across_all_results(): void
    {
        $meta = $this->getJson('/api/v1/sales-invoices?per_page=1')->assertOk()->json('meta');

        $this->assertSame(2, $meta['total'], 'الإجمالي يشمل كل النتائج لا الصفحة');
        $this->assertSame(1, count($this->getJson('/api/v1/sales-invoices?per_page=1')->json('data')));
        $this->assertArrayHasKey('totals_all_results', $meta);
        $this->assertSame('1200.0000', Dec::money($meta['totals_all_results']['total_amount']));
    }
}
