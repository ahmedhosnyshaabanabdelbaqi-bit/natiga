<?php

namespace App\Modules\Imports\Jobs;

use App\Modules\Imports\Models\Enums\ExportStatus;
use App\Modules\Imports\Models\Export;
use App\Modules\Imports\Services\ExportService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Generates a large export on the `reports` queue (exports above `exports.inline_rows`).
 * ExportService::generate() only claims a `queued` export, so a duplicate delivery is a no-op.
 */
class ProcessExportJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** Must stay below the queue's retry_after (90 s); `exports.max_rows` keeps exports inside it. */
    public int $timeout = 85;

    public function __construct(public readonly int $exportId)
    {
        $this->onQueue('reports');
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [30, 120];
    }

    public function handle(ExportService $exports): void
    {
        $export = Export::query()->find($this->exportId);
        if ($export === null || $export->status !== ExportStatus::Queued) {
            return;
        }
        $exports->generate($export);
    }

    public function failed(?Throwable $exception): void
    {
        $export = Export::query()->find($this->exportId);
        if ($export !== null) {
            app(ExportService::class)->markFailed($export, 'imports.errors.export_failed');
        }
    }
}
