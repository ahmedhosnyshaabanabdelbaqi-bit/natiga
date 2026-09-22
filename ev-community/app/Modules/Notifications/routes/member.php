<?php

use App\Modules\Notifications\Http\Controllers\Member\NotificationController;
use App\Modules\Notifications\Http\Controllers\Member\PreferencesController;
use Illuminate\Support\Facades\Route;

// Notification center (personal: every query is scoped to the signed-in user).
Route::prefix('notifications')->name('notifications.')->group(function () {
    Route::get('/', [NotificationController::class, 'index'])->name('index');                                                           // member.notifications.index
    Route::get('unread-count', [NotificationController::class, 'unreadCount'])->middleware('throttle:notifications-poll')->name('unread-count'); // member.notifications.unread-count
    Route::middleware('throttle:notifications-write')->group(function () {
        Route::post('read-all', [NotificationController::class, 'markAllRead'])->name('read-all');                                     // member.notifications.read-all
        Route::post('{notification}/read', [NotificationController::class, 'markRead'])->where('notification', '[0-9A-Za-z]{26}')->name('read'); // member.notifications.read
    });
});

Route::get('notification-preferences', [PreferencesController::class, 'edit'])->name('notification-preferences.edit');                   // member.notification-preferences.edit
Route::put('notification-preferences', [PreferencesController::class, 'update'])->middleware('throttle:notifications-write')->name('notification-preferences.update'); // member.notification-preferences.update
