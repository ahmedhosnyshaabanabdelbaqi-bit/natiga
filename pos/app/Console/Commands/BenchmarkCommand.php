<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Modules\Catalog\Services\ProductLookupService;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Core\Services\PosContext;
use App\Modules\Reporting\Services\ReportService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\SaleService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Measures the operations the cashier actually waits for, and reports p50/p95/p99
 * against the stated targets.
 *
 * These are MEASUREMENT targets, not claims: the command prints what it observed
 * on the machine it ran on, including the slowest cases.
 */
class BenchmarkCommand extends Command
{
    protected $signature = 'pos:benchmark
        {--scans=300 : barcode lookups to time}
        {--searches=100 : text searches to time}
        {--checkouts=50 : full checkouts to time}
        {--user=owner}
        {--terminal=POS1}';

    protected $description = 'Measures POS latency (p50/p95/p99) on the current dataset.';

    /** Targets from the acceptance criteria, in milliseconds. */
    private const TARGET_SCAN_MS = 150;

    private const TARGET_CHECKOUT_MS = 2000;

    public function handle(): int
    {
        $user = User::query()->where('username', $this->option('user'))->firstOrFail();
        $terminal = Terminal::query()->where('code', $this->option('terminal'))->firstOrFail();
        app(PosContext::class)->set($user, $terminal, (int) $terminal->branch_id);

        $warehouse = Warehouse::query()->where('is_default', true)->firstOrFail();

        $this->line('');
        $this->info('=== بيئة القياس ===');
        $this->table(['البند', 'القيمة'], [
            ['PHP', PHP_VERSION],
            ['PostgreSQL', DB::selectOne('SHOW server_version')->server_version],
            ['المعالج', trim((string) @shell_exec("grep -m1 'model name' /proc/cpuinfo | cut -d: -f2")) ?: 'غير معروف'],
            ['الأنوية', (string) (trim((string) @shell_exec('nproc')) ?: '?')],
            ['الذاكرة', trim((string) @shell_exec("grep MemTotal /proc/meminfo | awk '{printf \"%.1f GB\", \$2/1048576}'")) ?: '?'],
            ['عدد الأصناف', number_format(DB::table('product_variants')->count())],
            ['عدد الفواتير', number_format(DB::table('sales')->count())],
            ['عدد بنود الفواتير', number_format(DB::table('sale_lines')->count())],
        ]);

        $results = [];
        $results[] = $this->benchScan((int) $this->option('scans'), (int) $warehouse->id);
        $results[] = $this->benchSearch((int) $this->option('searches'), (int) $warehouse->id);
        $results[] = $this->benchReport();
        $results[] = $this->benchCheckout((int) $this->option('checkouts'), $terminal);

        $this->line('');
        $this->info('=== النتائج (مللي ثانية) ===');
        $this->table(
            ['العملية', 'عدد', 'p50', 'p95', 'p99', 'أبطأ', 'الهدف', 'الحالة'],
            array_map(fn (array $r) => [
                $r['name'], $r['count'],
                $this->fmt($r['p50']), $this->fmt($r['p95']), $this->fmt($r['p99']), $this->fmt($r['max']),
                $r['target'] ? $r['target'].' (p95)' : '—',
                $r['target'] === null ? '—' : ($r['p95'] <= $r['target'] ? 'ضمن الهدف' : 'خارج الهدف'),
            ], array_filter($results)),
        );

        $this->line('');
        $this->warn('هذه أرقام قياس فعلية على هذه البيئة، وليست ضمانًا. زمن الأجهزة (الطابعة، الميزان)');
        $this->warn('وخدمات الدفع الخارجية خارج نطاق القياس.');

        return self::SUCCESS;
    }

    private function fmt(float $ms): string
    {
        return number_format($ms, 1);
    }

    /** @return array<string,mixed> */
    private function benchScan(int $iterations, int $warehouseId): array
    {
        $codes = DB::table('barcodes')->inRandomOrder()->limit($iterations)->pluck('code')->all();
        if ($codes === []) {
            return [];
        }

        $lookup = app(ProductLookupService::class);
        $timings = [];

        // Warm the connection and the query plan cache first.
        $lookup->scan($codes[0], $warehouseId);

        foreach ($codes as $code) {
            $start = hrtime(true);
            $lookup->scan($code, $warehouseId);
            $timings[] = (hrtime(true) - $start) / 1e6;
        }

        return $this->summarise('مسح باركود وإضافة صنف', $timings, self::TARGET_SCAN_MS);
    }

    /** @return array<string,mixed> */
    private function benchSearch(int $iterations, int $warehouseId): array
    {
        $terms = ['شامبو', 'صابون', 'زيت', 'كابل', 'قلم', 'عطر', 'شاي', 'مصباح'];
        $lookup = app(ProductLookupService::class);
        $timings = [];

        $lookup->search($terms[0], $warehouseId);

        for ($i = 0; $i < $iterations; $i++) {
            $term = $terms[$i % count($terms)];
            $start = hrtime(true);
            $lookup->search($term, $warehouseId, perPage: 50);
            $timings[] = (hrtime(true) - $start) / 1e6;
        }

        return $this->summarise('بحث نصي (50 نتيجة)', $timings, null);
    }

    /** @return array<string,mixed> */
    private function benchReport(): array
    {
        $reports = app(ReportService::class);
        $timings = [];
        $from = now()->subDays(30)->toDateString();
        $to = now()->toDateString();

        $reports->dashboard($from, $to);

        for ($i = 0; $i < 10; $i++) {
            $start = hrtime(true);
            $reports->dashboard($from, $to);
            $timings[] = (hrtime(true) - $start) / 1e6;
        }

        return $this->summarise('لوحة المالك (30 يومًا)', $timings, null);
    }

    /** @return array<string,mixed> */
    private function benchCheckout(int $iterations, Terminal $terminal): array
    {
        $shift = DB::table('shifts')->where('terminal_id', $terminal->id)->whereIn('status', ['open'])->first();
        if (! $shift) {
            $this->warn('لا توجد وردية مفتوحة؛ تم تخطي قياس اعتماد البيع. افتح وردية ثم أعد التشغيل.');

            return [];
        }

        app(PosContext::class)->forgetShift();

        $rows = DB::table('product_variants')
            ->join('product_units', function ($join) {
                $join->on('product_units.product_id', '=', 'product_variants.product_id')->where('product_units.is_base', true);
            })
            ->join('stock_balances', 'stock_balances.variant_id', '=', 'product_variants.id')
            ->where('stock_balances.qty_on_hand', '>', 1000)
            ->inRandomOrder()
            ->limit(max($iterations * 3, 30))
            ->get(['product_variants.id as variant_id', 'product_units.id as unit_id']);

        if ($rows->isEmpty()) {
            $this->warn('لا توجد أصناف برصيد كافٍ؛ تم تخطي قياس اعتماد البيع.');

            return [];
        }

        $cashMethodId = (int) DB::table('payment_methods')->where('code', 'cash')->value('id');
        $sales = app(SaleService::class);
        $timings = [];

        // Price a realistic three-line basket, then time the full committed checkout.
        foreach (range(1, $iterations) as $i) {
            $lines = [];
            $total = 0.0;
            for ($l = 0; $l < 3; $l++) {
                $row = $rows[($i * 3 + $l) % $rows->count()];
                $price = (float) DB::table('prices')->where('variant_id', $row->variant_id)->value('price');
                $lines[] = ['variant_id' => $row->variant_id, 'product_unit_id' => $row->unit_id, 'qty' => '1'];
                $total += $price;
            }

            $payload = SaleRequest::fromArray([
                'lines' => $lines,
                'payments' => [[
                    'payment_method_id' => $cashMethodId,
                    'amount' => number_format($total, 2, '.', ''),
                    'tendered_amount' => number_format($total, 2, '.', ''),
                ]],
                'idempotency_key' => 'bench-'.uniqid('', true),
            ]);

            $start = hrtime(true);
            $sales->checkout($payload);
            $timings[] = (hrtime(true) - $start) / 1e6;
        }

        return $this->summarise('اعتماد بيع كامل (3 بنود)', $timings, self::TARGET_CHECKOUT_MS);
    }

    /**
     * @param  list<float>  $timings
     * @return array<string,mixed>
     */
    private function summarise(string $name, array $timings, ?int $target): array
    {
        sort($timings);
        $count = count($timings);

        return [
            'name' => $name,
            'count' => $count,
            'p50' => $this->percentile($timings, 50),
            'p95' => $this->percentile($timings, 95),
            'p99' => $this->percentile($timings, 99),
            'max' => $timings[$count - 1] ?? 0.0,
            'target' => $target,
        ];
    }

    /** @param list<float> $sorted */
    private function percentile(array $sorted, int $percentile): float
    {
        $count = count($sorted);
        if ($count === 0) {
            return 0.0;
        }

        $index = (int) ceil(($percentile / 100) * $count) - 1;

        return $sorted[max(0, min($index, $count - 1))];
    }
}
