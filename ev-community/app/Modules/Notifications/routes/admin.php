<?php

use App\Modules\Notifications\Http\Controllers\Admin\AnnouncementController;
use App\Modules\Notifications\Http\Controllers\Admin\DeliveryController;
use App\Modules\Notifications\Http\Controllers\Admin\EmailTemplateController;
use App\Modules\Notifications\Http\Controllers\Admin\InboxController;
use Illuminate\Support\Facades\Route;

Route::prefix('notifications')->name('notifications.')->group(function () {
    // ---- Personal inbox of the staff member (no extra permission: every query is scoped to the signed-in user) ----
    Route::get('inbox', [InboxController::class, 'index'])->name('inbox');                                                              // admin.notifications.inbox
    Route::prefix('inbox')->name('inbox.')->group(function () {
        Route::get('unread-count', [InboxController::class, 'unreadCount'])->middleware('throttle:notifications-poll')->name('unread-count'); // admin.notifications.inbox.unread-count
        Route::middleware('throttle:notifications-write')->group(function () {
            Route::post('read-all', [InboxController::class, 'markAllRead'])->name('read-all');                                         // admin.notifications.inbox.read-all
            Route::post('{notification}/read', [InboxController::class, 'markRead'])->where('notification', '[0-9A-Za-z]{26}')->name('read'); // admin.notifications.inbox.read
        });
    });

    // ---- Email templates ----
    Route::prefix('templates')->name('templates.')->group(function () {
        $key = '[A-Za-z0-9_\-]+(\.[A-Za-z0-9_\-]+)*';
        Route::get('/', [EmailTemplateController::class, 'index'])->middleware('permission:notifications.view|notifications.manage')->name('index'); // admin.notifications.templates.index
        Route::middleware('permission:notifications.manage')->group(function () use ($key) {
            Route::get('{key}/edit', [EmailTemplateController::class, 'edit'])->where('key', $key)->name('edit');                        // admin.notifications.templates.edit
            Route::put('{key}', [EmailTemplateController::class, 'update'])->where('key', $key)->name('update');                         // admin.notifications.templates.update
            Route::delete('{key}', [EmailTemplateController::class, 'reset'])->where('key', $key)->name('reset');                        // admin.notifications.templates.reset
            Route::post('{key}/preview', [EmailTemplateController::class, 'preview'])->where('key', $key)->middleware('throttle:notifications-write')->name('preview'); // admin.notifications.templates.preview
        });
    });

    // ---- Deliveries (failed / skipped channel deliveries, retry) ----
    Route::get('deliveries', [DeliveryController::class, 'index'])->middleware('permission:notifications.view|notifications.manage')->name('deliveries.index'); // admin.notifications.deliveries.index
    Route::post('deliveries/{notification}/{channel}/retry', [DeliveryController::class, 'retry'])
        ->where(['notification' => '[0-9A-Za-z]{26}', 'channel' => 'email|sms|whatsapp'])
        ->middleware(['permission:notifications.manage', 'throttle:notifications-write'])->name('deliveries.retry');                   // admin.notifications.deliveries.retry

    // ---- Announcements ----
    Route::get('/', [AnnouncementController::class, 'index'])->middleware('permission:notifications.view|notifications.manage')->name('index'); // admin.notifications.index
    Route::middleware('permission:notifications.manage')->group(function () {
        Route::get('create', [AnnouncementController::class, 'create'])->name('create');                                                // admin.notifications.create
        Route::post('/', [AnnouncementController::class, 'store'])->name('store');                                                       // admin.notifications.store
        Route::middleware('throttle:notifications-write')->group(function () {
            Route::post('estimate', [AnnouncementController::class, 'estimate'])->name('estimate');                                     // admin.notifications.estimate
            Route::post('preview', [AnnouncementController::class, 'preview'])->name('preview');                                        // admin.notifications.preview
        });
    });
    Route::where(['campaign' => '[0-9A-Za-z]{26}'])->group(function () {
        Route::get('{campaign}', [AnnouncementController::class, 'show'])->middleware('permission:notifications.view|notifications.manage')->name('show'); // admin.notifications.show
        Route::middleware('permission:notifications.manage')->group(function () {
            Route::get('{campaign}/edit', [AnnouncementController::class, 'edit'])->name('edit');                                       // admin.notifications.edit
            Route::put('{campaign}', [AnnouncementController::class, 'update'])->name('update');                                        // admin.notifications.update
            Route::delete('{campaign}', [AnnouncementController::class, 'destroy'])->name('destroy');                                   // admin.notifications.destroy
            Route::middleware('throttle:notifications-write')->group(function () {
                Route::post('{campaign}/send', [AnnouncementController::class, 'send'])->name('send');                                  // admin.notifications.send
                Route::post('{campaign}/schedule', [AnnouncementController::class, 'schedule'])->name('schedule');                      // admin.notifications.schedule
                Route::post('{campaign}/cancel', [AnnouncementController::class, 'cancel'])->name('cancel');                            // admin.notifications.cancel
            });
        });
    });
});
