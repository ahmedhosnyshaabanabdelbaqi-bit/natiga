<?php

declare(strict_types=1);

use App\Modules\Inventory\Models\StockReservation;
use App\Modules\Sync\Services\IdempotencyService;
use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Scheduled maintenance
|--------------------------------------------------------------------------
| Run with a single system cron entry:
|   * * * * * cd /path/to/pos && php artisan schedule:run >> /dev/null 2>&1
*/

// Side effects queued by committed transactions.
Schedule::command('pos:outbox')->everyMinute()->withoutOverlapping();

// Encrypted backup twice a day; keep two weeks.
Schedule::command('pos:backup --keep=14')
    ->twiceDaily(2, 14)
    ->withoutOverlapping()
    ->onFailure(fn () => logger()->error('فشل إنشاء النسخة الاحتياطية المجدولة.'));

// Housekeeping.
Schedule::call(fn () => app(IdempotencyService::class)->purgeExpired())
    ->daily()
    ->name('purge-idempotency-keys');

Schedule::call(function () {
    // Reservations that nobody converted must not hold stock forever.
    StockReservation::query()
        ->where('status', 'active')
        ->whereNotNull('expires_at')
        ->where('expires_at', '<', now())
        ->update(['status' => 'expired']);
})->everyFifteenMinutes()->name('expire-stock-reservations');
