<?php

use App\Modules\Notifications\Http\Controllers\Partner\NotificationController;
use Illuminate\Support\Facades\Route;

// Partner notification center (personal to the signed-in partner user; never center-wide).
Route::prefix('notifications')->name('notifications.')->group(function () {
    Route::get('/', [NotificationController::class, 'index'])->name('index');                                                           // partner.notifications.index
    Route::get('unread-count', [NotificationController::class, 'unreadCount'])->middleware('throttle:notifications-poll')->name('unread-count'); // partner.notifications.unread-count
    Route::middleware('throttle:notifications-write')->group(function () {
        Route::post('read-all', [NotificationController::class, 'markAllRead'])->name('read-all');                                     // partner.notifications.read-all
        Route::post('{notification}/read', [NotificationController::class, 'markRead'])->where('notification', '[0-9A-Za-z]{26}')->name('read'); // partner.notifications.read
    });
});
