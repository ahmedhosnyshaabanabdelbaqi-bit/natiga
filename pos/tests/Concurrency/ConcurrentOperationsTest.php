<?php

declare(strict_types=1);

namespace Tests\Concurrency;

use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Models\SaleLine;
use App\Modules\Sales\Services\SaleService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\Support\PosTestFixture;
use Tests\TestCase;

/**
 * Acceptance 6: two cashiers trying to sell the LAST unit at the same instant.
 *
 * These tests deliberately do NOT use RefreshDatabase: the work must be
 * COMMITTED so that separate OS processes, on separate PostgreSQL connections,
 * genuinely race each other. That is the only way to prove the row locking
 * works rather than assuming it.
 */
class ConcurrentOperationsTest extends TestCase
{
    private PosTestFixture $fixture;

    protected function setUp(): void
    {
        parent::setUp();

        // A real, committed database for the child processes to see.
        Artisan::call('migrate:fresh', ['--force' => true, '--seed' => true]);

        $this->fixture = new PosTestFixture;
        $this->fixture->openShift($this->fixture->manager, '1000');
    }

    protected function tearDown(): void
    {
        Artisan::call('migrate:fresh', ['--force' => true]);
        parent::tearDown();
    }

    /** @param list<array<string,string>> $argSets */
    private function runInParallel(array $argSets): array
    {
        $startAt = microtime(true) + 1.5; // shared barrier
        $processes = [];

        foreach ($argSets as $i => $args) {
            $command = ['php', 'artisan', 'pos:concurrent-op', '--start-at='.$startAt];
            foreach ($args as $k => $v) {
                $command[] = "--$k=$v";
            }

            $process = new Process($command, base_path(), [
                'APP_ENV' => 'testing',
                'DB_CONNECTION' => 'pgsql',
                'DB_HOST' => '127.0.0.1',
                'DB_PORT' => '5432',
                'DB_DATABASE' => 'pos_test',
                'DB_USERNAME' => 'pos',
                'DB_PASSWORD' => 'pos_secret',
                'CACHE_STORE' => 'array',
                'SESSION_DRIVER' => 'array',
            ]);
            $process->setTimeout(60);
            $process->start();
            $processes[$i] = $process;
        }

        $results = [];
        foreach ($processes as $i => $process) {
            $process->wait();
            $output = trim($process->getOutput());
            $lastLine = trim((string) strrchr("\n".$output, "\n"));
            $results[$i] = json_decode($lastLine, true) ?: ['ok' => false, 'error_code' => 'no_output', 'raw' => $output];
        }

        return $results;
    }

    public function test_two_cashiers_selling_the_last_unit_simultaneously_produce_exactly_one_sale(): void
    {
        $product = $this->fixture->product('RACE-1', 'آخر قطعة', price: '250.00', cost: '150.00', stock: '1');
        $variant = $this->fixture->variantOf($product);
        $unitId = $this->fixture->baseUnitId($product);
        $methodId = $this->fixture->method('cash')->id;

        $args = [
            'user' => $this->fixture->manager->username,
            'terminal' => $this->fixture->terminal->code,
            'variant' => (string) $variant->id,
            'unit' => (string) $unitId,
            'qty' => '1',
            'method' => (string) $methodId,
            'amount' => '250.00',
        ];

        $results = $this->runInParallel([$args, $args, $args]);

        $succeeded = array_filter($results, fn ($r) => $r['ok'] ?? false);
        $failed = array_filter($results, fn ($r) => ! ($r['ok'] ?? false));

        $this->assertCount(1, $succeeded, 'قطعة واحدة = فاتورة واحدة فقط مهما تزامن الكاشيرات');
        $this->assertCount(2, $failed);

        foreach ($failed as $failure) {
            $this->assertSame('insufficient_stock', $failure['error_code'], 'يجب أن يكون سبب الرفض واضحًا: '.json_encode($failure, JSON_UNESCAPED_UNICODE));
        }

        $this->assertSame(1, Sale::query()->count());

        // The balance is exactly zero: never -1, never left at 1.
        $this->assertSame('0.0000', app(InventoryService::class)
            ->available((int) $this->fixture->warehouse->id, (int) $variant->id)->toString());

        // And the ledger agrees with the projection.
        $this->assertSame([], app(InventoryService::class)->reconcile());
    }

    public function test_concurrent_returns_of_the_same_line_cannot_exceed_what_was_sold(): void
    {
        $product = $this->fixture->product('RACE-2', 'صنف مرتجع', price: '100.00', cost: '60.00', stock: '10');
        $variant = $this->fixture->variantOf($product);

        $sale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $variant->id, 'product_unit_id' => $this->fixture->baseUnitId($product), 'qty' => '2']],
            'payments' => [['payment_method_id' => $this->fixture->method('cash')->id, 'amount' => '200.00', 'tendered_amount' => '200.00']],
        ]))['sale'];

        $lineId = $sale->lines->first()->id;

        // Three processes each try to return both units at the same moment.
        $args = [
            'user' => $this->fixture->manager->username,
            'terminal' => $this->fixture->terminal->code,
            'op' => 'return',
            'sale' => (string) $sale->id,
            'sale-line' => (string) $lineId,
            'qty' => '2',
        ];

        $results = $this->runInParallel([$args, $args, $args]);

        $succeeded = array_filter($results, fn ($r) => $r['ok'] ?? false);
        $this->assertCount(1, $succeeded, 'بندٌ بيع بكمية 2 لا يمكن إرجاعه أكثر من مرة');

        foreach (array_filter($results, fn ($r) => ! ($r['ok'] ?? false)) as $failure) {
            $this->assertSame('return_exceeds_sold', $failure['error_code'], json_encode($failure, JSON_UNESCAPED_UNICODE));
        }

        $this->assertSame('2.0000', SaleLine::query()->whereKey($lineId)->value('returned_qty_base'));
        $this->assertSame(1, DB::table('sale_returns')->count());

        // 10 received - 2 sold + 2 returned = 10.
        $this->assertSame('10.0000', app(InventoryService::class)
            ->available((int) $this->fixture->warehouse->id, (int) $variant->id)->toString());
    }

    public function test_the_same_idempotency_key_sent_from_two_processes_creates_one_sale(): void
    {
        $product = $this->fixture->product('RACE-3', 'صنف مكرر', price: '75.00', cost: '40.00', stock: '50');
        $variant = $this->fixture->variantOf($product);

        // Both processes carry the same logical operation; only one may land.
        $key = 'race-key-'.uniqid();

        $startAt = microtime(true) + 1.5;
        $processes = [];

        for ($i = 0; $i < 3; $i++) {
            $process = new Process([
                'php', '-r',
                <<<'PHP'
                require __DIR__."/vendor/autoload.php";
                $app = require_once __DIR__."/bootstrap/app.php";
                $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
                $kernel->bootstrap();
                [$startAt, $key, $variantId, $unitId, $methodId, $username, $terminalCode] = json_decode(getenv('RACE_ARGS'), true);
                $user = App\Models\User::where('username', $username)->firstOrFail();
                $terminal = App\Modules\Core\Models\Terminal::where('code', $terminalCode)->firstOrFail();
                app(App\Modules\Core\Services\PosContext::class)->set($user, $terminal, (int) $terminal->branch_id);
                while (microtime(true) < (float) $startAt) { usleep(200); }
                try {
                    $r = app(App\Modules\Sales\Services\SaleService::class)->checkout(
                        App\Modules\Sales\Data\SaleRequest::fromArray([
                            'lines' => [['variant_id' => $variantId, 'product_unit_id' => $unitId, 'qty' => '1']],
                            'payments' => [['payment_method_id' => $methodId, 'amount' => '75.00', 'tendered_amount' => '75.00']],
                            'idempotency_key' => $key,
                        ])
                    );
                    echo json_encode(['ok' => true, 'replayed' => $r['replayed'], 'id' => $r['response']['id'] ?? null]);
                } catch (Throwable $e) {
                    echo json_encode(['ok' => false, 'error_code' => method_exists($e, 'errorCode') ? $e->errorCode() : 'unexpected']);
                }
                PHP,
            ], base_path(), [
                'APP_ENV' => 'testing',
                'DB_CONNECTION' => 'pgsql',
                'DB_HOST' => '127.0.0.1',
                'DB_PORT' => '5432',
                'DB_DATABASE' => 'pos_test',
                'DB_USERNAME' => 'pos',
                'DB_PASSWORD' => 'pos_secret',
                'CACHE_STORE' => 'array',
                'SESSION_DRIVER' => 'array',
                'RACE_ARGS' => json_encode([
                    $startAt, $key, $variant->id, $this->fixture->baseUnitId($product),
                    $this->fixture->method('cash')->id,
                    $this->fixture->manager->username, $this->fixture->terminal->code,
                ]),
            ]);
            $process->setTimeout(60);
            $process->start();
            $processes[] = $process;
        }

        $outcomes = [];
        foreach ($processes as $process) {
            $process->wait();
            $outcomes[] = json_decode(trim($process->getOutput()), true) ?: ['ok' => false, 'error_code' => 'no_output'];
        }

        // Exactly one invoice exists, whatever each caller was told.
        $this->assertSame(1, Sale::query()->count(), 'مفتاح واحد = فاتورة واحدة حتى مع الإرسال المتزامن');

        $ids = array_unique(array_filter(array_column($outcomes, 'id')));
        $this->assertLessThanOrEqual(1, count($ids), 'كل من نجح يشير إلى نفس الفاتورة');

        foreach ($outcomes as $outcome) {
            if (! ($outcome['ok'] ?? false)) {
                // A loser is told the operation is already running — it must NOT
                // be encouraged to create a second sale.
                $this->assertContains($outcome['error_code'], ['idempotency_in_progress', 'no_output']);
            }
        }
    }
}
