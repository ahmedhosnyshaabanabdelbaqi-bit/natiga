<?php

namespace App\Modules\Imports\Console;

use App\Modules\Imports\Services\ExportService;
use Illuminate\Console\Command;

/**
 * Deletes the files of exports past `expires_at` (the rows stay, status `expired`) and marks exports
 * stuck in the queue for more than ExportService::STALLED_AFTER_HOURS as failed. Scheduled hourly.
 */
class PurgeExpiredExportsCommand extends Command
{
    protected $signature = 'exports:purge-expired {--dry-run : Only report what would be purged}';

    protected $description = 'Delete expired export files and fail exports stuck in the queue';

    public function handle(ExportService $exports): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $result = $exports->purgeExpired($dryRun);

        $this->info(sprintf(
            '%s %d expired export file(s); %s %d stalled export(s).',
            $dryRun ? 'Would purge' : 'Purged',
            $result['expired'],
            $dryRun ? 'would fail' : 'failed',
            $result['stalled'],
        ));

        return self::SUCCESS;
    }
}
