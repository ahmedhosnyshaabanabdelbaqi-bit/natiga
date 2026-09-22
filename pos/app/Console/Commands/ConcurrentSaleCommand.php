<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Services\PosContext;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\ReturnService;
use App\Modules\Sales\Services\SaleService;
use App\Support\Exceptions\DomainException;
use Illuminate\Console\Command;

/**
 * Test helper: performs ONE checkout (or return) in its own OS process, so the
 * concurrency suite exercises real PostgreSQL row locking across connections
 * rather than simulating it in a single thread.
 *
 * `--start-at` is a shared microsecond timestamp all participating processes
 * busy-wait for, which makes them collide as tightly as possible.
 */
class ConcurrentSaleCommand extends Command
{
    protected $signature = 'pos:concurrent-op
        {--user= : username}
        {--terminal= : terminal code}
        {--variant= : variant id}
        {--unit= : product unit id}
        {--qty=1 : quantity}
        {--method= : payment method id}
        {--amount= : amount tendered}
        {--start-at= : unix timestamp with microseconds to begin at}
        {--op=sale : sale|return}
        {--sale-line= : sale line id for a return}
        {--sale= : sale id for a return}';

    protected $description = 'Runs a single POS operation, for concurrency testing.';

    public function handle(): int
    {
        $user = User::query()->where('username', $this->option('user'))->firstOrFail();
        $terminal = Terminal::query()->where('code', $this->option('terminal'))->firstOrFail();

        app(PosContext::class)->set($user, $terminal, (int) $terminal->branch_id);

        if ($startAt = $this->option('start-at')) {
            $target = (float) $startAt;
            while (microtime(true) < $target) {
                usleep(200);
            }
        }

        try {
            $result = $this->option('op') === 'return'
                ? app(ReturnService::class)->process([
                    'sale_id' => (int) $this->option('sale'),
                    'lines' => [[
                        'sale_line_id' => (int) $this->option('sale-line'),
                        'qty' => (string) $this->option('qty'),
                    ]],
                ])['response']
                : app(SaleService::class)->checkout(SaleRequest::fromArray([
                    'lines' => [[
                        'variant_id' => (int) $this->option('variant'),
                        'product_unit_id' => (int) $this->option('unit'),
                        'qty' => (string) $this->option('qty'),
                    ]],
                    'payments' => [[
                        'payment_method_id' => (int) $this->option('method'),
                        'amount' => (string) $this->option('amount'),
                        'tendered_amount' => (string) $this->option('amount'),
                    ]],
                ]))['response'];

            $this->line(json_encode(['ok' => true, 'result' => $result], JSON_UNESCAPED_UNICODE));

            return self::SUCCESS;
        } catch (DomainException $e) {
            $this->line(json_encode([
                'ok' => false,
                'error_code' => $e->errorCode(),
                'message' => $e->getMessage(),
            ], JSON_UNESCAPED_UNICODE));

            return self::FAILURE;
        } catch (\Throwable $e) {
            $this->line(json_encode([
                'ok' => false,
                'error_code' => 'unexpected',
                'message' => $e->getMessage(),
            ], JSON_UNESCAPED_UNICODE));

            return self::FAILURE;
        }
    }
}
