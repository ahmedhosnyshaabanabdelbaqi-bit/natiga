<?php

namespace App\Modules\Files;

use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Policies\AttachmentPolicy;
use App\Modules\Files\Services\AttachmentService;
use App\Support\Barcode\BarcodeService;
use App\Support\Pdf\PdfService;
use App\Support\Qr\QrService;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class FilesServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(AttachmentService::class);
        $this->app->singleton(PdfService::class);
        $this->app->singleton(QrService::class);
        $this->app->singleton(BarcodeService::class);
    }

    public function boot(): void
    {
        Gate::policy(Attachment::class, AttachmentPolicy::class);

        $this->callAfterResolving(Schedule::class, function (Schedule $schedule) {
            $schedule->command('files:purge-orphans --force')->dailyAt('03:30')->onOneServer()->withoutOverlapping();
            $schedule->command('qr:purge-expired')->dailyAt('03:40')->onOneServer();
        });
    }
}
