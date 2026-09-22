<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sync\Models\OfflineOperation;
use App\Modules\Sync\Services\OfflineSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Acceptance 13 & 14: syncing the same local operation more than once must not
 * duplicate its effect, and a conflict must reach a manager WITHOUT erasing the
 * amount that was collected from the customer.
 */
class OfflineSyncTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootShop();
        $this->shop->openShift();
    }

    private function operation(array $overrides = []): array
    {
        $product = $this->shop->product('OFF-1', 'صنف أوفلاين', price: '45.00', cost: '25.00', stock: '10');

        return array_merge([
            'uuid' => (string) Str::uuid7(),
            'type' => 'sale',
            'client_created_at' => now()->subMinutes(20)->toIso8601String(),
            'payload' => [
                'lines' => [[
                    'variant_id' => $this->shop->variantOf($product)->id,
                    'product_unit_id' => $this->shop->baseUnitId($product),
                    'qty' => '2',
                ]],
                'payments' => [[
                    'payment_method_id' => $this->shop->method('cash')->id,
                    'amount' => '90.00',
                    'tendered_amount' => '100.00',
                ]],
                'expected_grand_total' => '90.00',
            ],
        ], $overrides);
    }

    public function test_pushing_the_same_local_operation_twice_applies_it_once(): void
    {
        $operation = $this->operation();
        $variantId = $operation['payload']['lines'][0]['variant_id'];

        $first = app(OfflineSyncService::class)->push($this->shop->terminal, [$operation]);
        $second = app(OfflineSyncService::class)->push($this->shop->terminal, [$operation]);

        $this->assertSame(1, $first['accepted']);
        $this->assertSame(0, $second['accepted']);
        $this->assertSame(1, $second['duplicates'], 'الإرسال المكرر لا يُطبَّق مرة أخرى');

        $this->assertSame(1, Sale::query()->count());

        // Stock moved once: 10 - 2 = 8.
        $this->assertSame('8.0000', app(InventoryService::class)
            ->available((int) $this->shop->warehouse->id, $variantId)->toString());

        $sale = Sale::query()->firstOrFail();
        $this->assertSame(Sale::ORIGIN_OFFLINE, $sale->origin);
        $this->assertSame($operation['uuid'], $sale->offline_uid);
        $this->assertNotNull($sale->synced_at);
        $this->assertFalse($sale->isProvisional(), 'بعد المزامنة لم يعد المستند مؤقتًا');
    }

    public function test_a_credit_sale_is_blocked_offline_and_parked_with_its_collected_amount(): void
    {
        $customer = $this->shop->customer(credit: true);
        $operation = $this->operation();
        $operation['payload']['is_credit'] = true;
        $operation['payload']['customer_id'] = $customer->id;

        $result = app(OfflineSyncService::class)->push($this->shop->terminal, [$operation]);

        $this->assertSame(1, $result['rejected']);
        $this->assertSame(0, Sale::query()->count());

        $parked = OfflineOperation::query()->where('uuid', $operation['uuid'])->firstOrFail();
        $this->assertSame('rejected', $parked->status);
        $this->assertContains('credit_blocked_offline', array_column($parked->conflicts, 'type'));

        // The money the customer actually handed over is preserved and echoed
        // back — nothing about it is silently rewritten.
        $this->assertSame('90.00', $result['results'][0]['collected_amount']);
        $this->assertSame('90.00', $parked->payload['expected_grand_total']);
    }

    public function test_a_sale_over_the_device_ceiling_is_parked_for_the_manager(): void
    {
        $this->shop->terminal->forceFill(['offline_max_sale_amount' => '50'])->save();

        $result = app(OfflineSyncService::class)->push($this->shop->terminal, [$this->operation()]);

        $this->assertSame(1, $result['rejected']);
        $this->assertSame('offline_amount_exceeded', $result['results'][0]['conflicts'][0]['type']);
    }

    public function test_a_serial_sale_is_never_accepted_offline(): void
    {
        $operation = $this->operation();
        $operation['payload']['lines'][0]['serials'] = ['IMEI-X'];

        $result = app(OfflineSyncService::class)->push($this->shop->terminal, [$operation]);

        $this->assertSame(1, $result['rejected']);
        $this->assertContains('serial_sale_blocked_offline', array_column($result['results'][0]['conflicts'], 'type'));
    }

    public function test_a_stock_conflict_is_parked_and_a_manager_can_resolve_it(): void
    {
        // Only 1 in stock, but the terminal sold 2 while it was offline.
        $product = $this->shop->product('OFF-2', 'صنف نادر', price: '45.00', cost: '25.00', stock: '1');

        $operation = [
            'uuid' => (string) Str::uuid7(),
            'type' => 'sale',
            'client_created_at' => now()->subMinutes(5)->toIso8601String(),
            'payload' => [
                'lines' => [[
                    'variant_id' => $this->shop->variantOf($product)->id,
                    'product_unit_id' => $this->shop->baseUnitId($product),
                    'qty' => '2',
                ]],
                'payments' => [[
                    'payment_method_id' => $this->shop->method('cash')->id,
                    'amount' => '90.00',
                    'tendered_amount' => '90.00',
                ]],
                'expected_grand_total' => '90.00',
            ],
        ];

        $result = app(OfflineSyncService::class)->push($this->shop->terminal, [$operation]);

        $this->assertSame(1, $result['conflicts']);
        $this->assertSame(0, Sale::query()->count());

        $parked = OfflineOperation::query()->where('uuid', $operation['uuid'])->firstOrFail();
        $this->assertSame('conflict', $parked->status);
        $this->assertSame('insufficient_stock', $parked->conflicts[0]['type']);
        // The operation and its amount are kept for review.
        $this->assertSame('90.00', $parked->payload['expected_grand_total']);

        // The manager restocks and accepts the operation.
        $this->shop->receive($product, '5', '25.00');
        $this->shop->actAs($this->shop->manager);

        $resolved = app(OfflineSyncService::class)->resolve(
            $parked, $this->shop->manager, 'accept', 'تمت المراجعة واعتماد العملية',
        );

        $this->assertSame('applied', $resolved->status);
        $this->assertSame($this->shop->manager->id, $resolved->resolved_by);
        $this->assertSame(1, Sale::query()->count());
    }

    public function test_a_manager_can_reject_a_parked_operation_without_deleting_its_record(): void
    {
        $operation = $this->operation();
        $operation['payload']['is_credit'] = true;
        $operation['payload']['customer_id'] = $this->shop->customer()->id;

        app(OfflineSyncService::class)->push($this->shop->terminal, [$operation]);
        $parked = OfflineOperation::query()->where('uuid', $operation['uuid'])->firstOrFail();

        $resolved = app(OfflineSyncService::class)->resolve(
            $parked, $this->shop->manager, 'reject', 'العملية غير صحيحة، سيتم تسويتها يدويًا',
        );

        $this->assertSame('resolved', $resolved->status);
        $this->assertNotNull($resolved->payload, 'السجل والمبلغ محفوظان');
        $this->assertSame('العملية غير صحيحة، سيتم تسويتها يدويًا', $resolved->resolution_note);
        $this->assertDatabaseHas('audit_logs', ['action' => 'offline.operation_resolved']);
    }

    public function test_a_terminal_not_authorized_for_offline_selling_is_refused(): void
    {
        $this->shop->terminal->forceFill(['offline_allowed' => false])->save();

        $result = app(OfflineSyncService::class)->push($this->shop->terminal->fresh(), [$this->operation()]);

        $this->assertSame(1, $result['rejected']);
        $this->assertContains('terminal_not_authorized', array_column($result['results'][0]['conflicts'], 'type'));
    }
}
