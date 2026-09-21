<?php

namespace Tests\Feature;

use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Sales\SalesInvoiceService;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Salesman;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * الصلاحيات ونطاق الوصول عبر الـ API (البنود ٥ و٢٢).
 *
 *  - الرفض الافتراضي بغياب الإذن.
 *  - المندوب لا يصل إلى عميل مندوب آخر حتى بتغيير معرّف السجل في الطلب.
 *  - التكلفة لا تُرسل في الـ API لمن لا يملك صلاحيتها — إخفاء العمود لا يكفي.
 *  - تغيير صلاحية المستخدم لا يمحو مسؤوليته عن العمليات السابقة (سجل المراجعة باقٍ).
 */
class ApiSecurityTest extends TestCase
{
    use RefreshDatabase;

    private ScenarioBuilder $env;
    private User $salesmanUser;
    private Salesman $otherSalesman;
    private Customer $otherCustomer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = (new ScenarioBuilder)->build();

        // مندوب ثانٍ وعميل مسند إليه
        $this->otherSalesman = Salesman::create([
            'company_id' => $this->env->company->id,
            'branch_id' => $this->env->branch->id,
            'code' => 'SLM-002',
            'name' => 'مندوب المنطقة الثانية',
            'primary_role' => 'van_sale',
        ]);

        $this->otherCustomer = Customer::create([
            'company_id' => $this->env->company->id,
            'branch_id' => $this->env->branch->id,
            'code' => 'CUS-002',
            'name' => 'بقالة الأمل',
            'salesman_id' => $this->otherSalesman->id,
            'price_list_id' => $this->env->priceList->id,
            'credit_limit' => '10000',
        ]);

        // مستخدم بدور «مندوب» مرتبط بالمندوب الأول
        $this->salesmanUser = User::create([
            'company_id' => $this->env->company->id,
            'branch_id' => $this->env->branch->id,
            'name' => 'مستخدم المندوب الأول',
            'username' => 'salesman1',
            'password' => 'salesman-test-password',
            'is_active' => true,
            'is_super_admin' => false,
        ]);

        $this->env->salesman->user_id = $this->salesmanUser->id;
        $this->env->salesman->save();

        $role = Role::where('company_id', $this->env->company->id)->where('code', 'salesman')->firstOrFail();
        $this->salesmanUser->roles()->attach($role->id);

        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'receipt_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '100',
                'unit_price' => '50',
            ]],
        ]);
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/v1/customers')
            ->assertStatus(401)
            ->assertJsonPath('error_code', 'auth.unauthenticated');
    }

    /**
     * ظهر عند تجربة النشر: طلب بلا ترويسة Accept: application/json كان يعيد
     * صفحة خطأ 500 لأن Laravel يحاول التحويل إلى مسار اسمه login وهو غير موجود.
     * النظام واجهة برمجية بحتة، فالمتوقع 401 بصيغة JSON في كل الأحوال.
     */
    public function test_unauthenticated_request_without_json_header_returns_401_not_500(): void
    {
        $this->get('/api/v1/customers', ['Accept' => 'text/html'])
            ->assertStatus(401)
            ->assertJsonPath('error_code', 'auth.unauthenticated');
    }

    public function test_health_endpoint_reports_the_system_name(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('system', config('erp.system_name'));
    }

    public function test_user_without_permission_is_denied_by_default(): void
    {
        $plain = User::create([
            'company_id' => $this->env->company->id,
            'name' => 'مستخدم بلا أدوار',
            'username' => 'noperm',
            'password' => 'no-permission-user-pass',
            'is_active' => true,
        ]);

        Sanctum::actingAs($plain);

        $this->getJson('/api/v1/customers')
            ->assertStatus(403)
            ->assertJsonPath('error_code', 'auth.forbidden');

        $this->getJson('/api/v1/reports/income-statement')->assertStatus(403);
        $this->postJson('/api/v1/items', [])->assertStatus(403);
    }

    public function test_salesman_cannot_list_customers_of_another_salesman(): void
    {
        Sanctum::actingAs($this->salesmanUser);

        $response = $this->getJson('/api/v1/customers')->assertOk();

        $codes = array_column($response->json('data'), 'code');

        $this->assertContains('CUS-001', $codes);
        $this->assertNotContains('CUS-002', $codes, 'لا يظهر عميل مندوب آخر في القائمة');
    }

    public function test_salesman_cannot_open_another_salesmans_customer_by_changing_the_id(): void
    {
        Sanctum::actingAs($this->salesmanUser);

        // محاولة الوصول المباشر بتغيير معرّف السجل
        $this->getJson("/api/v1/customers/{$this->otherCustomer->id}")
            ->assertStatus(404)
            ->assertJsonPath('error_code', 'resource.not_found');

        $this->getJson("/api/v1/customers/{$this->otherCustomer->id}/statement")->assertStatus(404);

        // والعميل الخاص به يعمل طبيعيًا
        $this->getJson("/api/v1/customers/{$this->env->customer->id}")->assertOk();
    }

    public function test_salesman_cannot_invoice_a_customer_not_assigned_to_him(): void
    {
        Sanctum::actingAs($this->salesmanUser);

        $this->postJson('/api/v1/sales-invoices', [
            'customer_id' => $this->otherCustomer->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => 'credit',
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '1',
                'unit_price' => '80',
            ]],
        ])->assertStatus(403);

        $this->assertDatabaseCount('sales_invoices', 0);
    }

    public function test_cost_and_profit_are_not_sent_in_the_api_to_unauthorised_users(): void
    {
        $invoice = app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => 'credit',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '5',
                'unit_price' => '80',
            ]],
        ]);

        // المندوب لا يملك reports.cost.view
        Sanctum::actingAs($this->salesmanUser);
        $this->assertFalse($this->salesmanUser->canSeeCost());

        $body = $this->getJson("/api/v1/sales-invoices/{$invoice->id}")->assertOk()->json('data');

        $this->assertArrayNotHasKey('total_cost', $body, 'التكلفة يجب ألا تُرسل أصلًا في الاستجابة');
        $this->assertArrayNotHasKey('unit_cost', $body['lines'][0]);
        $this->assertArrayNotHasKey('total_cost', $body['lines'][0]);

        $items = $this->getJson('/api/v1/items')->assertOk()->json('data');
        $this->assertArrayNotHasKey('avg_cost', $items[0]);

        // تقييم المخزون محجوب تمامًا
        $this->getJson('/api/v1/reports/inventory-valuation')->assertStatus(403);

        // المستخدم المخوّل يراها
        Sanctum::actingAs($this->env->user);
        $adminBody = $this->getJson("/api/v1/sales-invoices/{$invoice->id}")->assertOk()->json('data');

        $this->assertArrayHasKey('total_cost', $adminBody);
        $this->assertSame('250.0000', $adminBody['total_cost']);
    }

    public function test_dashboard_hides_profit_cards_from_users_without_permission(): void
    {
        Sanctum::actingAs($this->salesmanUser);

        $cards = $this->getJson('/api/v1/dashboard')->assertOk()->json('data.cards');
        $keys = array_column($cards, 'key');

        $this->assertNotContains('gross_profit', $keys);
        $this->assertNotContains('net_profit', $keys);
        $this->assertNotContains('inventory_value', $keys);
        $this->assertContains('net_sales', $keys);
    }

    public function test_every_dashboard_card_has_a_formula_in_the_kpi_dictionary(): void
    {
        Sanctum::actingAs($this->env->user);

        $payload = $this->getJson('/api/v1/dashboard')->assertOk()->json('data');

        $this->assertNotEmpty($payload['cards']);

        foreach ($payload['cards'] as $card) {
            $this->assertNotNull($card['formula'], "المؤشر {$card['key']} بلا تعريف حسابي");
            $this->assertArrayHasKey($card['key'], $payload['dictionary']);
            $this->assertIsString($card['value']);
        }

        $this->assertNotNull($payload['generated_at'], 'اللوحة تعرض وقت آخر تحديث');
    }

    public function test_revoking_a_permission_does_not_erase_past_audit_records(): void
    {
        $invoice = app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'customer_id' => $this->env->customer->id,
            'salesman_id' => $this->env->salesman->id,
            'warehouse_id' => $this->env->vanWarehouse->id,
            'invoice_date' => now()->toDateString(),
            'payment_type' => 'credit',
            'user_id' => $this->salesmanUser->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '2',
                'unit_price' => '80',
            ]],
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'post',
            'entity_type' => 'sales_invoice',
            'entity_id' => $invoice->id,
        ]);

        // سحب كل أدوار المستخدم
        $this->salesmanUser->roles()->detach();
        $this->salesmanUser->refresh();

        // العملية السابقة وسجلها باقيان، والمسؤولية منسوبة كما كانت
        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => 'sales_invoice',
            'entity_id' => $invoice->id,
        ]);

        $this->assertDatabaseHas('sales_invoices', [
            'id' => $invoice->id,
            'status' => 'posted',
        ]);

        // ولم يعد قادرًا على إصدار فواتير جديدة
        Sanctum::actingAs($this->salesmanUser);
        $this->postJson('/api/v1/sales-invoices', [])->assertStatus(403);
    }

    public function test_login_returns_permission_list_and_enforces_password_change(): void
    {
        $this->salesmanUser->must_change_password = true;
        $this->salesmanUser->save();

        $response = $this->postJson('/api/v1/auth/login', [
            'username' => 'salesman1',
            'password' => 'salesman-test-password',
        ])->assertOk();

        $this->assertTrue($response->json('data.must_change_password'));
        $this->assertNotEmpty($response->json('data.token'));

        $permissions = $response->json('data.user.permissions');
        $this->assertContains('sales_invoice.create', $permissions);
        $this->assertNotContains('reports.cost.view', $permissions);
        $this->assertFalse($response->json('data.user.can_see_cost'));
    }

    /**
     * كلمة المرور المؤقتة تُعرض مرة واحدة على شاشة التثبيت، فمن قرأها يستطيع
     * الدخول. المنع هنا في السيرفر: لا شيء متاح غير تغييرها.
     */
    public function test_temporary_password_blocks_every_route_until_it_is_changed(): void
    {
        $this->salesmanUser->must_change_password = true;
        $this->salesmanUser->save();

        Sanctum::actingAs($this->salesmanUser);

        // كل المسارات مرفوضة
        $this->getJson('/api/v1/customers')
            ->assertStatus(403)
            ->assertJsonPath('error_code', 'auth.password_change_required');
        $this->getJson('/api/v1/dashboard')
            ->assertStatus(403)
            ->assertJsonPath('error_code', 'auth.password_change_required');
        $this->postJson('/api/v1/sales-invoices', [])
            ->assertStatus(403)
            ->assertJsonPath('error_code', 'auth.password_change_required');

        // ما عدا معرفة الهوية وتغيير كلمة المرور
        $this->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.must_change_password', true);

        $this->postJson('/api/v1/auth/change-password', [
            'current_password' => 'salesman-test-password',
            'new_password' => 'a-much-longer-password-9',
            'new_password_confirmation' => 'a-much-longer-password-9',
        ])->assertOk();

        // وبعد التغيير يعود النظام متاحًا بحدود صلاحيات المستخدم
        $this->getJson('/api/v1/customers')->assertOk();
        $this->getJson('/api/v1/auth/me')
            ->assertJsonPath('data.must_change_password', false);
    }

    public function test_login_with_wrong_password_is_rejected_and_throttled(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'username' => 'salesman1',
                'password' => 'wrong-password',
            ])->assertStatus(401);
        }

        $this->postJson('/api/v1/auth/login', [
            'username' => 'salesman1',
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }
}
