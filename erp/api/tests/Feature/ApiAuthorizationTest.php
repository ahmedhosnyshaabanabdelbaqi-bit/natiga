<?php

namespace Tests\Feature;

use App\Domain\Inventory\InventoryService;
use App\Models\Customer;
use App\Models\CustomerAssignment;
use App\Models\Item;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Authorisation is enforced on the server for every request.
 *
 * These tests call the HTTP layer directly and change record ids in the URL,
 * because that is what an attacker does — hiding a button proves nothing.
 */
class ApiAuthorizationTest extends TestCase
{
    private Item $item;

    private Warehouse $main;

    protected function setUp(): void
    {
        parent::setUp();

        $this->item = Item::where('code', 'DET-001')->firstOrFail();
        $this->main = Warehouse::where('code', 'MAIN')->firstOrFail();

        DB::transaction(fn () => app(InventoryService::class)->receive(
            $this->main->id, $this->item->id, '100', '30', 'opening_balance', 1
        ));
    }

    private function customerFor(?int $repId): Customer
    {
        $customer = Customer::create([
            'company_id' => $this->company->id,
            'code' => 'C'.fake()->unique()->numberBetween(1000, 9999),
            'name' => 'عميل',
            'kind' => 'retail',
            'credit_limit' => '10000',
            'is_active' => true,
        ]);

        if ($repId) {
            CustomerAssignment::create([
                'company_id' => $this->company->id,
                'customer_id' => $customer->id,
                'rep_id' => $repId,
                'from_date' => now()->subMonth()->toDateString(),
            ]);
        }

        return $customer;
    }

    #[Test]
    public function an_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/api/v1/items')->assertUnauthorized();
        $this->getJson('/api/v1/dashboard')->assertUnauthorized();
    }

    #[Test]
    public function a_user_without_the_permission_is_refused(): void
    {
        // A driver has no business posting invoices.
        Sanctum::actingAs($this->userWithRole('driver'));

        $this->postJson('/api/v1/sales/invoices', [])
            ->assertForbidden()
            ->assertJsonPath('error', 'auth.forbidden');
    }

    #[Test]
    public function a_deactivated_user_loses_access_immediately(): void
    {
        $user = $this->userWithRole('company_admin');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/items')->assertOk();

        $user->forceFill(['is_active' => false])->save();

        $this->getJson('/api/v1/items')
            ->assertForbidden()
            ->assertJsonPath('error', 'auth.inactive');
    }

    #[Test]
    public function a_rep_cannot_reach_a_customer_assigned_to_someone_else(): void
    {
        $mine = $this->userWithRole('rep');
        $theirs = $this->userWithRole('rep');

        $myCustomer = $this->customerFor($mine->id);
        $theirCustomer = $this->customerFor($theirs->id);

        Sanctum::actingAs($mine);

        $this->getJson("/api/v1/customers/{$myCustomer->id}")->assertOk();

        // Changing the id in the URL must not work.
        $this->getJson("/api/v1/customers/{$theirCustomer->id}")->assertForbidden();
        $this->getJson("/api/v1/customers/{$theirCustomer->id}/statement")->assertForbidden();
        $this->getJson("/api/v1/customers/{$theirCustomer->id}/credit")->assertForbidden();
    }

    #[Test]
    public function a_reps_customer_list_contains_only_their_own(): void
    {
        $mine = $this->userWithRole('rep');
        $theirs = $this->userWithRole('rep');

        $myCustomer = $this->customerFor($mine->id);
        $this->customerFor($theirs->id);

        Sanctum::actingAs($mine);

        $response = $this->getJson('/api/v1/customers')->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame($myCustomer->id, $response->json('data.0.id'));
    }

    #[Test]
    public function cost_and_margin_are_absent_from_the_payload_for_a_user_who_may_not_see_them(): void
    {
        $rep = $this->userWithRole('rep');
        $this->assertFalse($rep->hasPermission('inventory.cost.view'));

        Sanctum::actingAs($rep);
        $row = $this->getJson('/api/v1/items')->assertOk()->json('data.0');

        // Not merely hidden in the UI — never sent.
        $this->assertArrayNotHasKey('avg_cost', $row);
        $this->assertArrayNotHasKey('stock_value', $row);

        Sanctum::actingAs($this->userWithRole('accountant'));
        $row = $this->getJson('/api/v1/items')->assertOk()->json('data.0');

        $this->assertArrayHasKey('avg_cost', $row);
    }

    #[Test]
    public function a_rep_cannot_see_stock_valuation(): void
    {
        Sanctum::actingAs($this->userWithRole('rep'));

        $this->getJson('/api/v1/inventory/valuation')->assertForbidden();

        Sanctum::actingAs($this->userWithRole('accountant'));
        $this->getJson('/api/v1/inventory/valuation')->assertOk();
    }

    #[Test]
    public function overriding_a_price_requires_its_own_permission(): void
    {
        $rep = $this->userWithRole('rep');
        $customer = $this->customerFor($rep->id);

        Sanctum::actingAs($rep);

        $payload = [
            'header' => [
                'customer_id' => $customer->id,
                'warehouse_id' => $this->main->id,
            ],
            'lines' => [[
                'item_id' => $this->item->id,
                'qty' => '5',
                'unit_price' => '1.00',   // a deep discount, typed by hand
            ]],
        ];

        $this->postJson('/api/v1/sales/orders', $payload)->assertForbidden();

        Sanctum::actingAs($this->userWithRole('sales_manager'));
        $this->postJson('/api/v1/sales/orders', $payload)->assertCreated();
    }

    #[Test]
    public function granting_a_line_discount_requires_its_own_permission(): void
    {
        $rep = $this->userWithRole('rep');
        $customer = $this->customerFor($rep->id);

        Sanctum::actingAs($rep);

        $this->postJson('/api/v1/sales/orders', [
            'header' => ['customer_id' => $customer->id, 'warehouse_id' => $this->main->id],
            'lines' => [['item_id' => $this->item->id, 'qty' => '5', 'discount_pct' => '50']],
        ])->assertForbidden();
    }

    #[Test]
    public function a_read_only_auditor_can_look_but_not_touch(): void
    {
        $auditor = $this->userWithRole('auditor');
        $customer = $this->customerFor(null);

        Sanctum::actingAs($auditor);

        $this->getJson('/api/v1/items')->assertOk();
        $this->getJson('/api/v1/customers')->assertOk();
        $this->getJson('/api/v1/inventory/valuation')->assertOk();
        $this->getJson('/api/v1/reports/trial-balance')->assertOk();

        $this->postJson('/api/v1/customers', [])->assertForbidden();
        $this->postJson('/api/v1/sales/orders', [])->assertForbidden();
        $this->putJson("/api/v1/customers/{$customer->id}", [])->assertForbidden();
        $this->postJson('/api/v1/admin/users', [])->assertForbidden();
    }

    #[Test]
    public function posting_and_creating_an_invoice_are_separate_permissions(): void
    {
        $rep = $this->userWithRole('rep');

        $this->assertTrue($rep->hasPermission('sales.invoice.create'));
        $this->assertFalse($rep->hasPermission('sales.invoice.post'),
            'A rep raises an invoice; an accountant posts it to the books');

        $accountant = $this->userWithRole('accountant');
        $this->assertTrue($accountant->hasPermission('sales.invoice.post'));
    }

    #[Test]
    public function a_dashboard_card_a_user_may_not_see_is_not_sent(): void
    {
        Sanctum::actingAs($this->userWithRole('rep'));
        $keys = collect($this->getJson('/api/v1/dashboard')->assertOk()->json('cards'))
            ->pluck('key');

        $this->assertFalse($keys->contains('gross_profit'));

        Sanctum::actingAs($this->userWithRole('finance_manager'));
        $keys = collect($this->getJson('/api/v1/dashboard')->assertOk()->json('cards'))
            ->pluck('key');

        $this->assertTrue($keys->contains('gross_profit'));
    }

    #[Test]
    public function every_kpi_card_carries_its_own_definition_and_a_way_to_open_it(): void
    {
        Sanctum::actingAs($this->userWithRole('finance_manager'));

        foreach ($this->getJson('/api/v1/dashboard')->assertOk()->json('cards') as $card) {
            $this->assertNotEmpty($card['definition'],
                "KPI {$card['key']} must state how it is calculated");
            $this->assertArrayHasKey('drilldown', $card,
                "KPI {$card['key']} must be openable to its source documents");
        }
    }

    #[Test]
    public function the_posting_matrix_reports_readiness_before_go_live(): void
    {
        Sanctum::actingAs($this->userWithRole('accountant'));

        $response = $this->getJson('/api/v1/admin/posting-matrix')->assertOk();

        $this->assertTrue($response->json('is_ready'));
        $this->assertSame([], $response->json('missing'));

        DB::table('account_mappings')->where('key', 'cogs')->delete();

        $response = $this->getJson('/api/v1/admin/posting-matrix')->assertOk();

        $this->assertFalse($response->json('is_ready'));
        $this->assertContains('cogs', $response->json('missing'));
    }

    #[Test]
    public function changing_a_password_invalidates_every_other_session(): void
    {
        $user = $this->userWithRole('rep');
        $user->createToken('old-phone');
        $user->createToken('old-tablet');

        Sanctum::actingAs($user);

        $this->assertSame(2, $user->tokens()->count());

        $this->postJson('/api/v1/auth/change-password', [
            'current_password' => 'password',
            'password' => 'a-new-strong-password',
            'password_confirmation' => 'a-new-strong-password',
        ])->assertOk();

        $this->assertLessThanOrEqual(1, $user->fresh()->tokens()->count(),
            'Other devices must be logged out when the password changes');
    }

    #[Test]
    public function login_does_not_reveal_whether_an_email_exists(): void
    {
        $user = $this->userWithRole('rep');

        $unknown = $this->postJson('/api/v1/auth/login', [
            'email' => 'nobody@example.test', 'password' => 'whatever',
        ])->assertStatus(422);

        $wrongPassword = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email, 'password' => 'wrong-password',
        ])->assertStatus(422);

        $this->assertSame(
            $unknown->json('errors.email'),
            $wrongPassword->json('errors.email'),
            'Both failures must look identical'
        );
    }
}
