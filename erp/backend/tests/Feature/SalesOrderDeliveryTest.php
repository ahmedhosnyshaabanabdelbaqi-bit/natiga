<?php

namespace Tests\Feature;

use App\Domain\Accounting\PostingMatrix;
use App\Domain\Inventory\AvailabilityService;
use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Sales\DeliveryNoteService;
use App\Domain\Sales\SalesInvoiceService;
use App\Domain\Sales\SalesOrderService;
use App\Models\DeliveryNote;
use App\Models\SalesOrder;
use App\Models\StockReservation;
use App\Support\Dec;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Illuminate\Support\Facades\DB;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * دورة البيع الكاملة: أمر بيع ← حجز ← إذن تسليم ← تسليم جزئي ← فاتورة.
 *
 * ما يثبته هذا الملف:
 *  - الحجز يقلّل المتاح دون أن يقلّل الرصيد.
 *  - إذن التسليم هو مالك حركة المخزون؛ الفاتورة المرتبطة به لا تخصم مرة ثانية.
 *  - البضاعة الخارجة غير المفوترة تظهر في حساب مستقل، لا في المخزون ولا في التكلفة.
 *  - الكمية المرفوضة تعود للمخزن بتكلفتها الأصلية.
 *  - الأمر لا يُحمَّل عليه أكثر مما فيه، ولا يُلغى بعد تنفيذ جزء منه.
 */
class SalesOrderDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private ScenarioBuilder $env;

    protected function setUp(): void
    {
        parent::setUp();
        $this->env = (new ScenarioBuilder)->build();

        // استلام 100 قطعة بسعر 50 — المخزون 5000
        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
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

    private function makeOrder(string $qty = '30'): SalesOrder
    {
        return app(SalesOrderService::class)->create([
            'company_id' => $this->env->company->id,
            'branch_id' => $this->env->branch->id,
            'customer_id' => $this->env->customer->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'order_date' => now()->toDateString(),
            'payment_type' => 'credit',
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => $qty,
                'unit_price' => '80',
            ]],
        ]);
    }

    private function availability(): array
    {
        return app(AvailabilityService::class)->forItem(
            (int) $this->env->company->id,
            (int) $this->env->item->id,
            (int) $this->env->mainWarehouse->id,
        );
    }

    private function accountBalance(string $roleKey, string $docType = 'delivery_note'): string
    {
        $accountId = app(PostingMatrix::class)->accountId((int) $this->env->company->id, $docType, $roleKey);

        // تُجمع كل القيود بلا استثناء: القيد المعكوس وقيد عكسه يلغي أحدهما الآخر.
        // استبعاد المعكوس وحده يترك أثر العكس منفردًا فيقلب الرصيد.
        $row = DB::table('journal_lines')
            ->where('account_id', $accountId)
            ->selectRaw('COALESCE(SUM(debit - credit), 0) AS balance')
            ->first();

        return Dec::money($row->balance);
    }

    public function test_approving_an_order_reserves_stock_without_moving_it(): void
    {
        $order = $this->makeOrder('30');

        $this->assertSame('draft', $order->status);
        $this->assertSame('0.000000', $order->lines[0]->reserved_qty_base);

        $before = $this->availability();
        $this->assertSame('100.000000', $before['on_hand']);
        $this->assertSame('100.000000', $before['available']);

        $approved = app(SalesOrderService::class)->approve($order, $this->env->user->id);

        $this->assertSame('approved', $approved->status);
        $this->assertSame('30.000000', $approved->lines[0]->reserved_qty_base);

        $after = $this->availability();
        // الرصيد لم يتحرك، والمتاح نقص بمقدار الحجز
        $this->assertSame('100.000000', $after['on_hand']);
        $this->assertSame('30.000000', $after['reserved']);
        $this->assertSame('70.000000', $after['available']);

        // ولا قيد محاسبي: الأمر ليس مستندًا ماليًا
        $this->assertSame(0, DB::table('journal_entries')->where('source_type', 'sales_order')->count());
    }

    public function test_full_cycle_order_to_delivery_to_invoice_moves_stock_once(): void
    {
        $order = app(SalesOrderService::class)->approve($this->makeOrder('30'), $this->env->user->id);

        // الإرسال: البضاعة تخرج من المخزن
        $note = app(DeliveryNoteService::class)->createAndDispatch([
            'company_id' => $this->env->company->id,
            'sales_order_id' => $order->id,
            'user_id' => $this->env->user->id,
        ]);

        $this->assertSame('out_for_delivery', $note->status);
        $this->assertSame('50.000000', $note->lines[0]->unit_cost);

        $afterDispatch = $this->availability();
        $this->assertSame('70.000000', $afterDispatch['on_hand']);
        // الحجز استُهلك عند الإرسال فلا يُخصم مرتين من المتاح
        $this->assertSame('0.000000', $afterDispatch['reserved']);
        $this->assertSame('70.000000', $afterDispatch['available']);

        // 30 × 50 = 1500 خرجت من المخزون إلى «مسلّمة غير مفوترة»
        $this->assertSame('1500.0000', $this->accountBalance('delivered_not_invoiced'));
        $this->assertSame('3500.0000', $this->accountBalance('inventory'));

        // التسليم الكامل
        $confirmed = app(DeliveryNoteService::class)->confirm(
            $note,
            [['line_id' => $note->lines[0]->id, 'delivered_qty_base' => '30']],
            ['receiver_name' => 'محمد أمين المخزن'],
            $this->env->user->id,
        );

        $this->assertSame('delivered', $confirmed->status);
        $this->assertSame('محمد أمين المخزن', $confirmed->receiver_name);

        $order->refresh();
        $this->assertSame('delivered', $order->delivery_status);
        $this->assertSame('pending', $order->invoice_status);
        // سُلّم ولم يُفوتر — الأمر لا يُغلق
        $this->assertSame('approved', $order->status);

        // الفوترة على الإذن
        $invoice = app(SalesInvoiceService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'branch_id' => $this->env->branch->id,
            'customer_id' => $this->env->customer->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'sales_order_id' => $order->id,
            'delivery_note_id' => $note->id,
            'invoice_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '30',
                'unit_price' => '80',
                'sales_order_line_id' => $order->lines[0]->id,
                'delivery_note_line_id' => $confirmed->lines[0]->id,
            ]],
        ]);

        $this->assertFalse((bool) $invoice->is_stock_owner);
        $this->assertSame('2400.0000', $invoice->total_amount);
        $this->assertSame('1500.0000', $invoice->total_cost);

        // الرصيد لم ينقص ثانيةً — الإذن هو من أخرج البضاعة
        $afterInvoice = $this->availability();
        $this->assertSame('70.000000', $afterInvoice['on_hand']);

        // التكلفة انتقلت من «مسلّمة غير مفوترة» إلى تكلفة المبيعات
        $this->assertSame('0.0000', $this->accountBalance('delivered_not_invoiced'));
        $this->assertSame('1500.0000', $this->accountBalance('cogs', 'sales_invoice_cogs'));
        $this->assertSame('3500.0000', $this->accountBalance('inventory'));

        $order->refresh();
        $this->assertSame('invoiced', $order->invoice_status);
        $this->assertSame('closed', $order->status);

        $this->assertTrue((bool) DeliveryNote::find($note->id)->is_invoiced);

        // لا قيد غير متوازن في الدورة كلها
        $unbalanced = DB::table('journal_entries')
            ->whereRaw('total_debit <> total_credit')
            ->count();
        $this->assertSame(0, $unbalanced);
    }

    public function test_rejected_quantity_returns_to_stock_at_its_original_cost(): void
    {
        $order = app(SalesOrderService::class)->approve($this->makeOrder('30'), $this->env->user->id);

        $note = app(DeliveryNoteService::class)->createAndDispatch([
            'company_id' => $this->env->company->id,
            'sales_order_id' => $order->id,
            'user_id' => $this->env->user->id,
        ]);

        // العميل رفض 10 قطع
        $confirmed = app(DeliveryNoteService::class)->confirm(
            $note,
            [[
                'line_id' => $note->lines[0]->id,
                'delivered_qty_base' => '20',
                'rejection_reason' => 'عبوات تالفة',
            ]],
            [],
            $this->env->user->id,
        );

        $this->assertSame('partially_delivered', $confirmed->status);
        $this->assertSame('20.000000', $confirmed->lines[0]->delivered_qty_base);
        $this->assertSame('10.000000', $confirmed->lines[0]->rejected_qty_base);
        $this->assertSame('عبوات تالفة', $confirmed->lines[0]->rejection_reason);

        // 10 عادت للمخزن: 70 + 10 = 80
        $this->assertSame('80.000000', $this->availability()['on_hand']);

        // المخزون 3500 + 500 = 4000، والمسلَّم غير المفوتر 1500 − 500 = 1000
        $this->assertSame('4000.0000', $this->accountBalance('inventory'));
        $this->assertSame('1000.0000', $this->accountBalance('delivered_not_invoiced'));

        // المتوسط لم يتغيّر: البضاعة عادت بتكلفتها لا بسعر بيعها
        $this->assertSame('50.000000', DB::table('item_costs')
            ->where('item_id', $this->env->item->id)->value('avg_cost'));

        $order->refresh();
        $this->assertSame('partial', $order->delivery_status);
    }

    public function test_failed_delivery_returns_everything_and_reverses_the_entry(): void
    {
        $order = app(SalesOrderService::class)->approve($this->makeOrder('30'), $this->env->user->id);

        $note = app(DeliveryNoteService::class)->createAndDispatch([
            'company_id' => $this->env->company->id,
            'sales_order_id' => $order->id,
            'user_id' => $this->env->user->id,
        ]);

        $failed = app(DeliveryNoteService::class)->fail(
            $note,
            'العميل مغلق',
            now()->addDay()->toDateString(),
            $this->env->user->id,
        );

        $this->assertSame('rescheduled', $failed->status);
        $this->assertSame('العميل مغلق', $failed->failure_reason);

        // كل البضاعة عادت والحسابان رجعا لما كانا عليه
        $this->assertSame('100.000000', $this->availability()['on_hand']);
        $this->assertSame('5000.0000', $this->accountBalance('inventory'));
        $this->assertSame('0.0000', $this->accountBalance('delivered_not_invoiced'));

        // القيد الأصلي وُسم معكوسًا ولم يُحذف، وقيد العكس موجود ويشير إليه
        $original = DB::table('journal_entries')
            ->where('source_type', 'delivery_note')->where('entry_type', 'normal')->first();
        $reversal = DB::table('journal_entries')
            ->where('source_type', 'delivery_note')->where('entry_type', 'reversal')->first();

        $this->assertSame('reversed', $original->status);
        $this->assertNotNull($reversal);
        $this->assertSame((int) $original->id, (int) $reversal->reverses_entry_id);

        // وأُعيد الحجز لأن الأمر ما زال قائمًا
        $this->assertSame('30.000000', $this->availability()['reserved']);
        $this->assertSame(1, StockReservation::where('doc_type', 'sales_order')
            ->where('doc_id', $order->id)->where('status', 'active')->count());
    }

    public function test_delivery_note_cannot_exceed_the_remaining_order_quantity(): void
    {
        $order = app(SalesOrderService::class)->approve($this->makeOrder('30'), $this->env->user->id);

        // إذن أول بـ20
        app(DeliveryNoteService::class)->createAndDispatch([
            'company_id' => $this->env->company->id,
            'sales_order_id' => $order->id,
            'user_id' => $this->env->user->id,
            'lines' => [[
                'sales_order_line_id' => $order->lines[0]->id,
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '20',
            ]],
        ]);

        // إذن ثانٍ بـ15 يتجاوز المتبقي (10)
        $this->expectExceptionMessage('تتجاوز المتبقي في سطر الأمر');

        app(DeliveryNoteService::class)->create([
            'company_id' => $this->env->company->id,
            'sales_order_id' => $order->id,
            'user_id' => $this->env->user->id,
            'lines' => [[
                'sales_order_line_id' => $order->lines[0]->id,
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '15',
            ]],
        ]);
    }

    public function test_cancelling_an_order_releases_reservations(): void
    {
        $order = app(SalesOrderService::class)->approve($this->makeOrder('30'), $this->env->user->id);
        $this->assertSame('30.000000', $this->availability()['reserved']);

        $cancelled = app(SalesOrderService::class)->cancel($order, 'العميل تراجع', $this->env->user->id);

        $this->assertSame('cancelled', $cancelled->status);
        $this->assertSame('0.000000', $this->availability()['reserved']);
        $this->assertSame('100.000000', $this->availability()['available']);
        $this->assertSame('0.000000', $cancelled->lines[0]->reserved_qty_base);
    }

    public function test_an_order_with_a_delivered_line_cannot_be_cancelled(): void
    {
        $order = app(SalesOrderService::class)->approve($this->makeOrder('30'), $this->env->user->id);

        $note = app(DeliveryNoteService::class)->createAndDispatch([
            'company_id' => $this->env->company->id,
            'sales_order_id' => $order->id,
            'user_id' => $this->env->user->id,
        ]);

        app(DeliveryNoteService::class)->confirm(
            $note,
            [['line_id' => $note->lines[0]->id, 'delivered_qty_base' => '30']],
            [],
            $this->env->user->id,
        );

        $this->expectExceptionMessage('لا يمكن إلغاء أمر سُلّم أو فُوتر');
        app(SalesOrderService::class)->cancel($order->fresh(), 'محاولة إلغاء', $this->env->user->id);
    }

    public function test_the_api_drives_the_whole_cycle_and_enforces_permissions(): void
    {
        Sanctum::actingAs($this->env->user);

        // إنشاء واعتماد في طلب واحد
        $created = $this->postJson('/api/v1/sales-orders', [
            'customer_id' => $this->env->customer->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'order_date' => now()->toDateString(),
            'payment_type' => 'credit',
            'approve' => true,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '12',
                'unit_price' => '80',
            ]],
        ])->assertStatus(201)->json('data');

        $this->assertSame('approved', $created['status']);
        $this->assertSame('960.0000', $created['total_amount']);

        // التعرض الائتماني يعكس الأمر المعتمد غير المفوتر
        $exposure = $this->getJson('/api/v1/sales-orders/credit-check?customer_id='.$this->env->customer->id)
            ->assertOk()->json('data');
        $this->assertSame('960.0000', $exposure['approved_uninvoiced_orders']);

        // إذن تسليم من الأمر
        $note = $this->postJson('/api/v1/delivery-notes', [
            'sales_order_id' => $created['id'],
            'delivery_date' => now()->toDateString(),
        ])->assertStatus(201)->json('data');

        $this->assertSame('out_for_delivery', $note['status']);

        // تأكيد التسليم
        $confirmed = $this->postJson("/api/v1/delivery-notes/{$note['id']}/confirm", [
            'receiver_name' => 'أمين المخزن',
            'results' => [['line_id' => $note['lines'][0]['id'], 'delivered_qty_base' => '12']],
        ])->assertOk()->json('data');

        $this->assertSame('delivered', $confirmed['status']);

        // الأذون غير المفوترة تظهر في شاشة المحاسب
        $uninvoiced = $this->getJson('/api/v1/delivery-notes?uninvoiced_only=1')->assertOk()->json('data');
        $this->assertCount(1, $uninvoiced);

        // مستخدم بلا صلاحيات لا يرى ولا ينشئ
        $plain = \App\Models\User::create([
            'company_id' => $this->env->company->id,
            'branch_id' => $this->env->branch->id,
            'name' => 'موظف بلا صلاحيات',
            'username' => 'plain-user',
            'password' => 'plain-test-password',
            'is_active' => true,
        ]);

        Sanctum::actingAs($plain);
        $this->getJson('/api/v1/sales-orders')->assertStatus(403);
        $this->getJson('/api/v1/delivery-notes')->assertStatus(403);
        $this->postJson('/api/v1/sales-orders', [])->assertStatus(403);
        $this->postJson("/api/v1/delivery-notes/{$note['id']}/confirm", [])->assertStatus(403);
    }

    public function test_cost_is_not_sent_in_the_delivery_note_api_to_unauthorised_users(): void
    {
        $order = app(SalesOrderService::class)->approve($this->makeOrder('30'), $this->env->user->id);
        $note = app(DeliveryNoteService::class)->createAndDispatch([
            'company_id' => $this->env->company->id,
            'sales_order_id' => $order->id,
            'user_id' => $this->env->user->id,
        ]);

        // المدير يرى التكلفة
        Sanctum::actingAs($this->env->user);
        $withCost = $this->getJson("/api/v1/delivery-notes/{$note->id}")->assertOk()->json('data');
        $this->assertSame('50.000000', $withCost['lines'][0]['unit_cost']);

        // مستخدم يملك العرض فقط لا يراها — غائبة من الاستجابة لا مخفية
        $viewer = \App\Models\User::create([
            'company_id' => $this->env->company->id,
            'branch_id' => $this->env->branch->id,
            'name' => 'مشاهد أذون',
            'username' => 'dn-viewer',
            'password' => 'viewer-test-password',
            'is_active' => true,
        ]);

        $role = \App\Models\Role::create([
            'company_id' => $this->env->company->id,
            'code' => 'dn_viewer',
            'name_ar' => 'مشاهد أذون التسليم',
        ]);
        $role->permissions()->sync(
            \App\Models\Permission::whereIn('code', ['delivery_note.view', 'customer.view_all'])->pluck('id')
        );
        $viewer->roles()->sync([$role->id]);

        Sanctum::actingAs($viewer->fresh());
        $withoutCost = $this->getJson("/api/v1/delivery-notes/{$note->id}")->assertOk()->json('data');
        $this->assertArrayNotHasKey('unit_cost', $withoutCost['lines'][0]);
    }

    public function test_approving_an_order_beyond_available_stock_is_rejected_when_backorder_is_off(): void
    {
        $order = app(SalesOrderService::class)->create([
            'company_id' => $this->env->company->id,
            'branch_id' => $this->env->branch->id,
            'customer_id' => $this->env->customer->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'order_date' => now()->toDateString(),
            'is_backorder_allowed' => false,
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '150',
                'unit_price' => '80',
            ]],
        ]);

        $this->expectExceptionMessage('المتاح للحجز');
        app(SalesOrderService::class)->approve($order, $this->env->user->id);
    }
}
