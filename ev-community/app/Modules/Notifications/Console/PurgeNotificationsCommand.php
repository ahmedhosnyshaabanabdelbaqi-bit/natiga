<?php

namespace App\Modules\Notifications\Console;

use App\Modules\Notifications\Models\Notification;
use App\Modules\System\Services\Settings;
use Illuminate\Console\Command;

/**
 * Deletes read notifications older than `notifications.retention_days` (default 180). Unread notifications are kept.
 * Delivery rows cascade with their notification; audit rows are never touched.
 */
class PurgeNotificationsCommand extends Command
{
    protected $signature = 'notifications:purge {--days= : Override the retention period in days}';

    protected $description = 'Delete read notifications older than the retention period';

    public function handle(): int
    {
        $days = (int) ($this->option('days') ?: Settings::int('notifications.retention_days', 180));
        $days = max(7, $days);
        $cutoff = now()->subDays($days);
        $deleted = 0;
        do {
            $ids = Notification::query()->whereNotNull('read_at')->where('created_at', '<', $cutoff)->orderBy('id')->limit(1000)->pluck('id');
            if ($ids->isEmpty()) {
                break;
            }
            $deleted += Notification::query()->whereIn('id', $ids)->delete();
        } while (true);

        $this->info("Purged {$deleted} read notification(s) older than {$days} days.");

        return self::SUCCESS;
    }
}
