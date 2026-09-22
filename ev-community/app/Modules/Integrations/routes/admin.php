<?php

use App\Modules\Integrations\Http\Controllers\Admin\ExchangeRatesController;
use App\Modules\Integrations\Http\Controllers\Admin\IntegrationsController;
use App\Modules\Integrations\Http\Controllers\Admin\WebhookEventsController;
use Illuminate\Support\Facades\Route;

Route::middleware('module:integrations')->prefix('integrations')->name('integrations.')->group(function () {
    Route::middleware('permission:integrations.view')->group(function () {
        Route::get('/', [IntegrationsController::class, 'index'])->name('index');                                    // admin.integrations.index
        Route::get('webhook-events', [WebhookEventsController::class, 'index'])->name('webhook-events.index');
        Route::get('webhook-events/{event}', [WebhookEventsController::class, 'show'])->whereNumber('event')->name('webhook-events.show');
    });

    Route::middleware('permission:integrations.manage')->group(function () {
        // Checks call external services (SMTP connect, Nominatim...): throttled like the other test tools.
        Route::post('check/{key}', [IntegrationsController::class, 'check'])->where('key', '[a-z_]+')->middleware('throttle:integrations-tests')->name('check');
        Route::post('test-email', [IntegrationsController::class, 'sendTestEmail'])->middleware('throttle:integrations-tests')->name('test-email');
        Route::post('geocode-test', [IntegrationsController::class, 'geocodeTest'])->middleware('throttle:integrations-tests')->name('geocode-test');
        Route::post('webhook-events/{event}/retry', [WebhookEventsController::class, 'retry'])->whereNumber('event')->name('webhook-events.retry');
    });

    Route::middleware('permission:exchange_rates.view')->get('exchange-rates', [ExchangeRatesController::class, 'index'])->name('exchange-rates.index');
    Route::middleware('permission:exchange_rates.manage')->group(function () {
        Route::post('exchange-rates', [ExchangeRatesController::class, 'store'])->name('exchange-rates.store');
        Route::post('exchange-rates/sync', [ExchangeRatesController::class, 'sync'])->name('exchange-rates.sync');
    });
});
