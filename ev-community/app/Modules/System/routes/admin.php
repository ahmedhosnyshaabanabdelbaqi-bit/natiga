<?php

use App\Modules\System\Http\Controllers\Admin\BannersController;
use App\Modules\System\Http\Controllers\Admin\DashboardController;
use App\Modules\System\Http\Controllers\Admin\FailedJobsController;
use App\Modules\System\Http\Controllers\Admin\ModulesController;
use App\Modules\System\Http\Controllers\Admin\SettingsController;
use App\Modules\System\Http\Controllers\Admin\SetupController;
use App\Modules\System\Http\Controllers\Admin\UsersController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/admin/dashboard');
Route::get('dashboard', DashboardController::class)->name('dashboard');

// ---- Settings ----
Route::prefix('settings')->name('settings.')->group(function () {
    Route::get('/', [SettingsController::class, 'index'])->middleware('permission:settings.view|settings.manage')->name('index');       // admin.settings.index
    Route::middleware('permission:settings.manage')->group(function () {
        Route::post('branding/{key}', [SettingsController::class, 'upload'])->middleware('throttle:uploads')->name('upload');           // admin.settings.upload
        Route::put('{group}', [SettingsController::class, 'update'])->name('update');                                                    // admin.settings.update
        Route::delete('{key}', [SettingsController::class, 'reset'])->name('reset');                                                     // admin.settings.reset
    });
});

// ---- Modules ----
Route::middleware('permission:modules.manage')->prefix('modules')->name('modules.')->group(function () {
    Route::get('/', [ModulesController::class, 'index'])->name('index');            // admin.modules.index
    Route::put('{module}', [ModulesController::class, 'update'])->name('update');    // admin.modules.update
});

// ---- Users ----
Route::prefix('users')->name('users.')->group(function () {
    Route::middleware('permission:users.view|users.manage')->group(function () {
        Route::get('/', [UsersController::class, 'index'])->name('index');           // admin.users.index
    });
    Route::middleware('permission:users.manage')->group(function () {
        Route::get('create', [UsersController::class, 'create'])->name('create');    // admin.users.create
        Route::post('/', [UsersController::class, 'store'])->name('store');          // admin.users.store
    });
    Route::middleware('permission:users.view|users.manage')->group(function () {
        Route::get('{user}', [UsersController::class, 'show'])->name('show');        // admin.users.show
    });
    Route::middleware('permission:users.manage')->group(function () {
        Route::get('{user}/edit', [UsersController::class, 'edit'])->name('edit');                          // admin.users.edit
        Route::put('{user}', [UsersController::class, 'update'])->name('update');                           // admin.users.update
        Route::post('{user}/disable', [UsersController::class, 'disable'])->name('disable');                // admin.users.disable
        Route::post('{user}/reactivate', [UsersController::class, 'reactivate'])->name('reactivate');       // admin.users.reactivate
        Route::post('{user}/reset-access', [UsersController::class, 'resetAccess'])->name('reset-access');  // admin.users.reset-access
        Route::delete('{user}/sessions', [UsersController::class, 'logoutAll'])->name('sessions.destroy-all');          // admin.users.sessions.destroy-all
        Route::delete('{user}/sessions/{session}', [UsersController::class, 'destroySession'])->name('sessions.destroy'); // admin.users.sessions.destroy
    });
    Route::middleware('permission:roles.manage')->group(function () {
        Route::put('{user}/access', [UsersController::class, 'updateAccess'])->name('access');              // admin.users.access
    });
});

// ---- Status banners ----
Route::middleware('permission:banners.manage')->prefix('banners')->name('banners.')->group(function () {
    Route::get('/', [BannersController::class, 'index'])->name('index');             // admin.banners.index
    Route::post('/', [BannersController::class, 'store'])->name('store');            // admin.banners.store
    Route::put('{banner}', [BannersController::class, 'update'])->name('update');    // admin.banners.update
    Route::delete('{banner}', [BannersController::class, 'destroy'])->name('destroy'); // admin.banners.destroy
});

// ---- Failed jobs ----
Route::middleware('permission:jobs.manage')->prefix('jobs')->name('jobs.')->group(function () {
    Route::get('failed', [FailedJobsController::class, 'index'])->name('failed.index');              // admin.jobs.failed.index
    Route::post('failed/{uuid}/retry', [FailedJobsController::class, 'retry'])->name('failed.retry'); // admin.jobs.failed.retry
    Route::delete('failed/{uuid}', [FailedJobsController::class, 'destroy'])->name('failed.destroy'); // admin.jobs.failed.destroy
});

// ---- First-run setup checklist ----
Route::get('setup', SetupController::class)->middleware('permission:settings.manage')->name('setup');   // admin.setup
