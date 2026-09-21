<?php

namespace Tests\Feature;

use App\Domain\Inventory\StockLedger;
use App\Domain\Inventory\StockPoster;
use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Shared\DomainException;
use App\Support\Dec;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\Support\ScenarioBuilder;
use Tests\TestCase;

/**
 * اختبار التزامن الحقيقي — بيانات مُثبَّتة (committed) واتصالان منفصلان.
 *
 * لا يستخدم RefreshDatabase لأن لفّ الاختبار داخل معاملة يخفي البيانات عن
 * الاتصال الثاني ويُبطل معنى الاختبار.
 *
 * المطلوب إثباته: مستخدمان يبيعان آخر كمية في نفس اللحظة — واحد فقط ينجح،
 * والمنع يأتي من قاعدة البيانات (قفل الصف + قيد CHECK) وليس من فحص الواجهة.
 */
class ConcurrencyTest extends TestCase
{
    private ScenarioBuilder $env;

    protected function setUp(): void
    {
        parent::setUp();

        // قاعدة نظيفة بلا معاملة خارجية
        Artisan::call('migrate:fresh', ['--force' => true]);

        $this->env = (new ScenarioBuilder)->build();

        app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $this->env->company->id,
            'supplier_id' => $this->env->supplier->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'receipt_date' => now()->toDateString(),
            'user_id' => $this->env->user->id,
            'lines' => [[
                'item_id' => $this->env->item->id,
                'uom_id' => $this->env->pieceUom->id,
                'qty_uom' => '1',          // قطعة واحدة فقط — آخر كمية
                'unit_price' => '50',
            ]],
        ]);
    }

    protected function tearDown(): void
    {
        Artisan::call('migrate:fresh', ['--force' => true]);
        parent::tearDown();
    }

    public function test_row_lock_blocks_a_second_transaction_reading_the_same_balance(): void
    {
        $second = DB::connection('pgsql_second');
        $second->statement("SET lock_timeout = '500ms'");

        $blocked = false;

        DB::beginTransaction();

        // المعاملة الأولى تخصم آخر قطعة وتقفل صف الرصيد
        app(StockPoster::class)->issue([
            'company_id' => $this->env->company->id,
            'item_id' => $this->env->item->id,
            'warehouse_id' => $this->env->mainWarehouse->id,
            'status_bucket' => StockLedger::BUCKET_AVAILABLE,
            'doc_type' => 'concurrent_sale_a',
            'doc_id' => 1,
            'qty_base' => '1',
            'unit_cost' => '0',
            'movement_date' => now()->toDateString(),
        ]);

        // المعاملة الثانية تحاول قفل نفس الصف — يجب أن تنتظر ثم تنتهي بمهلة
        try {
            $second->select(
                'SELECT qty_base FROM stock_balances
                 WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND status_bucket = ?
                 FOR UPDATE',
                [$this->env->company->id, $this->env->item->id, $this->env->mainWarehouse->id, 'available'],
            );
        } catch (\Throwable $e) {
            $blocked = str_contains($e->getMessage(), 'lock timeout')
                || str_contains($e->getMessage(), 'canceling statement');
        }

        DB::commit();

        $this->assertTrue($blocked, 'المعاملة الثانية يجب أن تُحجب بقفل الصف، لا أن تقرأ رصيدًا قديمًا');
        $this->assertSame('0.000000', $this->qty(), 'الرصيد صفر بعد خصم آخر قطعة');
    }

    public function test_only_one_of_two_sellers_gets_the_last_unit(): void
    {
        $this->assertSame('1.000000', $this->qty());

        $attempt = function (string $docType, int $docId) {
            return DB::transaction(function () use ($docType, $docId) {
                app(StockPoster::class)->issue([
                    'company_id' => $this->env->company->id,
                    'item_id' => $this->env->item->id,
                    'warehouse_id' => $this->env->mainWarehouse->id,
                    'status_bucket' => StockLedger::BUCKET_AVAILABLE,
                    'doc_type' => $docType,
                    'doc_id' => $docId,
                    'qty_base' => '1',
                    'unit_cost' => '0',
                    'movement_date' => now()->toDateString(),
                ]);

                return true;
            });
        };

        $this->assertTrue($attempt('seller_a', 1), 'البائع الأول ينجح');

        $secondSucceeded = true;
        try {
            $attempt('seller_b', 2);
        } catch (DomainException $e) {
            $secondSucceeded = false;
            $this->assertContains($e->errorCode, ['stock.insufficient', 'cost.negative_stock']);
        }

        $this->assertFalse($secondSucceeded, 'البائع الثاني يجب أن يُرفض — لا يُباع نفس الرصيد مرتين');
        $this->assertSame('0.000000', $this->qty());
    }

    public function test_database_check_constraint_rejects_negative_balance_even_via_raw_sql(): void
    {
        // محاولة تجاوز طبقة التطبيق بالكامل — القاعدة نفسها ترفض
        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::statement(
            'UPDATE stock_balances SET qty_base = -1
             WHERE company_id = ? AND item_id = ? AND warehouse_id = ?',
            [$this->env->company->id, $this->env->item->id, $this->env->mainWarehouse->id],
        );
    }

    private function qty(): string
    {
        return Dec::qty(
            DB::table('stock_balances')
                ->where('company_id', $this->env->company->id)
                ->where('item_id', $this->env->item->id)
                ->where('warehouse_id', $this->env->mainWarehouse->id)
                ->where('status_bucket', StockLedger::BUCKET_AVAILABLE)
                ->sum('qty_base')
        );
    }
}
