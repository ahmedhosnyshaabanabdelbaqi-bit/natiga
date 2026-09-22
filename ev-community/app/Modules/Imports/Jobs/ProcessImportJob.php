<?php

namespace App\Modules\Imports\Jobs;

use App\Modules\Imports\Models\Enums\ImportStatus;
use App\Modules\Imports\Models\Import;
use App\Modules\Imports\Services\ImportService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Imports the valid rows of a confirmed import in time-boxed slices on the `reports` queue.
 * Every row is imported in its own transaction under a row lock and only while still `valid`, so a
 * retried or continued run never imports a row twice. The last slice checks the counts invariant
 * and writes the final report (ImportService::finish()).
 */
class ProcessImportJob implements ShouldQueue
{
    use Queueable;

    public const SLICE_SECONDS = 50;

    public const LOCK_SECONDS = 120;

    public int $tries = 5;

    public int $timeout = 80;

    public function __construct(public readonly int $importId)
    {
        $this->onQueue('reports');
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [15, 60, 120];
    }

    public function handle(ImportService $imports): void
    {
        $lock = Cache::lock('imports:work:'.$this->importId, self::LOCK_SECONDS);
        if (! $lock->get()) {
            $this->release(30);

            return;
        }
        try {
            $import = Import::query()->find($this->importId);
            if ($import === null || $import->status !== ImportStatus::Processing) {
                return;
            }
            $import = $imports->runProcessing($import, microtime(true) + self::SLICE_SECONDS);
        } finally {
            $lock->release();
        }

        if ($import->status === ImportStatus::Processing) {
            // Deadline reached: continue with the rows still `valid` (or finish when none are left).
            self::dispatch($this->importId);
        }
    }

    public function failed(?Throwable $exception): void
    {
        $import = Import::query()->find($this->importId);
        if ($import !== null && $import->status === ImportStatus::Processing) {
            app(ImportService::class)->markFailed($import, 'processing', 'imports.errors.processing_crashed');
        }
    }
}
