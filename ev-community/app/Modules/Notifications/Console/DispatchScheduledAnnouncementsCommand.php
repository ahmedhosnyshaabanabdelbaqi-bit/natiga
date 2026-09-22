<?php

namespace App\Modules\Notifications\Console;

use App\Modules\Notifications\Services\AnnouncementService;
use Illuminate\Console\Command;

class DispatchScheduledAnnouncementsCommand extends Command
{
    protected $signature = 'notifications:dispatch-scheduled';

    protected $description = 'Queue announcement campaigns whose scheduled time has arrived';

    public function handle(AnnouncementService $service): int
    {
        $count = $service->dispatchDue();
        $this->info("Dispatched {$count} scheduled announcement(s).");

        return self::SUCCESS;
    }
}
