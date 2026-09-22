<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Access\Models\Approval;
use App\Modules\Access\Services\ApprovalService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\SaleService;
use App\Support\Exceptions\ApprovalRequiredException;
use App\Support\Exceptions\PermissionDeniedException;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Acceptance 15: a cashier cannot change a price or read cost/margin — and not
 * just because the button is hidden. The checks live on the server and the API
 * responses are filtered.
 */
class PermissionEnforcementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift();
    }

    public function test_a_cashier_cannot_override_the_price(): void
    {
        $product = $this->shop->product('PERM-1', 'صنف', price: '100.00', cost: '60.00', stock: '5');

        $this->expectException(PermissionDeniedException::class);
        $this->expectExceptionMessage('ليست لديك صلاحية تنفيذ هذه العملية.');

        app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [[
                'variant_id' => $this->shop->variantOf($product)->id,
                'product_unit_id' => $this->shop->baseUnitId($product),
                'qty' => '1',
                'unit_price' => '1.00', // trying to sell a 100 item for 1
            ]],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '1.00', 'tendered_amount' => '1.00']],
        ]));
    }

    public function test_the_api_hides_cost_and_margin_from_a_cashier_but_shows_them_to_a_manager(): void
    {
        $product = $this->shop->product('PERM-2', 'صنف', price: '100.00', cost: '60.00', stock: '5');

        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '100.00', 'tendered_amount' => '100.00']],
        ]))['sale'];

        // The cost IS stored - it is simply not disclosed to this role.
        $this->assertSame('60.0000', $sale->cost_total);

        Sanctum::actingAs($this->shop->cashier);
        $asCashier = $this->withHeader('X-POS-Terminal', $this->shop->terminal->code)
            ->getJson("/api/v1/sales/{$sale->id}");

        $asCashier->assertOk();
        $asCashier->assertJsonMissingPath('cost_total');
        $asCashier->assertJsonMissingPath('profit_total');

        Sanctum::actingAs($this->shop->manager);
        $asManager = $this->withHeader('X-POS-Terminal', $this->shop->terminal->code)
            ->getJson("/api/v1/sales/{$sale->id}");

        $asManager->assertOk();
        $asManager->assertJsonPath('cost_total', '60.0000');
        $asManager->assertJsonPath('profit_total', '40.0000');
    }

    public function test_a_route_a_cashier_lacks_is_refused_at_the_server(): void
    {
        Sanctum::actingAs($this->shop->cashier);

        // `inventory.adjust` is a manager permission.
        $this->withHeader('X-POS-Terminal', $this->shop->terminal->code)
            ->postJson('/api/v1/inventory/adjust', [
                'warehouse_id' => $this->shop->warehouse->id,
                'variant_id' => 1,
                'qty_base' => '100',
                'reason' => 'محاولة غير مصرح بها',
            ])
            ->assertForbidden()
            ->assertJsonPath('error_code', 'permission_denied');
    }

    public function test_a_discount_over_the_cashier_limit_needs_a_manager_approval(): void
    {
        // The cashier's ceiling is 5% / 20 EGP (see the fixture).
        $product = $this->shop->product('PERM-3', 'صنف', price: '1000.00', cost: '600.00', stock: '5');

        $payload = [
            'lines' => [['variant_id' => $this->shop->variantOf($product)->id, 'product_unit_id' => $this->shop->baseUnitId($product), 'qty' => '1']],
            'invoice_discount_type' => 'amount',
            'invoice_discount_value' => '200.00', // 20%: far over the limit
            'payments' => [['payment_method_id' => $this->shop->method('cash')->id, 'amount' => '800.00', 'tendered_amount' => '800.00']],
        ];

        try {
            app(SaleService::class)->checkout(SaleRequest::fromArray($payload));
            $this->fail('كان يجب طلب موافقة المدير');
        } catch (ApprovalRequiredException $e) {
            $this->assertSame('approval_required', $e->errorCode());
        }

        // The manager approves, with their own identity, for this amount.
        $approval = app(ApprovalService::class)->request('sales.discount', Money::of('200.00'));
        app(ApprovalService::class)->approve($approval, $this->shop->manager, 'sales.discount.override');

        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray(
            $payload + ['approval_uuid' => $approval->uuid]
        ))['sale'];

        $this->assertSame('800.0000', $sale->grand_total);

        // The token is single use and names who granted it.
        $consumed = Approval::query()->whereKey($approval->id)->firstOrFail();
        $this->assertSame('consumed', $consumed->status);
        $this->assertSame($this->shop->manager->id, $consumed->approved_by);
    }

    public function test_a_manager_cannot_approve_their_own_request(): void
    {
        $this->shop->actAs($this->shop->manager);
        $approval = app(ApprovalService::class)->request('sales.discount', Money::of('100.00'));

        $this->expectExceptionMessage('لا يمكن اعتماد طلبك بنفسك.');

        app(ApprovalService::class)->approve($approval, $this->shop->manager, 'sales.discount.override');
    }

    public function test_an_approval_does_not_cover_a_larger_amount(): void
    {
        $approval = app(ApprovalService::class)->request('sales.discount', Money::of('50.00'));
        app(ApprovalService::class)->approve($approval, $this->shop->manager, 'sales.discount.override');

        $this->expectExceptionMessage('المبلغ يتجاوز القيمة المعتمدة.');

        app(ApprovalService::class)->consume($approval->uuid, 'sales.discount', Money::of('500.00'));
    }
}
