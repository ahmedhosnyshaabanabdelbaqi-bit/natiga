<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\Printing\Services\PrintService;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Models\SaleReturn;
use App\Modules\Sync\Services\OutboxService;
use Illuminate\Console\Command;

/**
 * Drains the transactional outbox.
 *
 * Runs AFTER the money transactions have committed, so a failure here can never
 * roll back or repeat a sale. Each message is retried with backoff and gives up
 * into a `dead` state that a human can inspect.
 */
class ProcessOutboxCommand extends Command
{
    protected $signature = 'pos:outbox {--limit=100} {--once}';

    protected $description = 'Processes queued side effects (printing, integrations).';

    public function __construct(
        private readonly OutboxService $outbox,
        private readonly PrintService $printing,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $processed = 0;

        foreach ($this->outbox->due((int) $this->option('limit')) as $message) {
            try {
                match ($message->topic) {
                    'sale.completed' => $this->onSaleCompleted($message->payload),
                    'sale_return.completed' => $this->onReturnCompleted($message->payload),
                    // Unknown topics are acknowledged rather than retried forever.
                    default => null,
                };

                $this->outbox->markSent($message);
                $processed++;
            } catch (\Throwable $e) {
                $this->outbox->markFailed($message, $e->getMessage());
                $this->warn("فشلت رسالة {$message->topic}: {$e->getMessage()}");
            }
        }

        $this->info("تمت معالجة $processed رسالة.");

        return self::SUCCESS;
    }

    /** @param array<string,mixed> $payload */
    private function onSaleCompleted(array $payload): void
    {
        if (empty($payload['print'])) {
            return;
        }

        $sale = Sale::query()->find($payload['sale_id'] ?? 0);
        if ($sale) {
            $this->printing->queueReceipt($sale);
        }
    }

    /** @param array<string,mixed> $payload */
    private function onReturnCompleted(array $payload): void
    {
        $return = SaleReturn::query()->find($payload['sale_return_id'] ?? 0);
        if ($return) {
            $this->printing->queue('receipt', $return, ['number' => $return->number, 'type' => 'return']);
        }
    }
}
