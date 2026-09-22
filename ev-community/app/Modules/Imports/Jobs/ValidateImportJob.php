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
 * Validates a large import in time-boxed slices on the `reports` queue. Each run works for at most
 * SLICE_SECONDS (well below the queue's retry_after of 90 s), then queues its continuation.
 * A per-import cache lock keeps two workers from validating the same import at once.
 */
class ValidateImportJob implements ShouldQueue
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
            if ($import === null || $import->status !== ImportStatus::Validating) {
                return;
            }
            $import = $imports->runValidation($import, microtime(true) + self::SLICE_SECONDS);
        } finally {
            $lock->release();
        }

        if ($import->status === ImportStatus::Validating && $imports->hasPendingWork($import)) {
            self::dispatch($this->importId);
        }
    }

    public function failed(?Throwable $exception): void
    {
        $import = Import::query()->find($this->importId);
        if ($import !== null && $import->status === ImportStatus::Validating) {
            app(ImportService::class)->markFailed($import, 'validation', 'imports.errors.validation_crashed');
        }
    }
}
