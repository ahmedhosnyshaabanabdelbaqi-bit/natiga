<?php

use App\Modules\Auth\Http\Controllers\LocaleController;
use App\Modules\Auth\Http\Controllers\PortalLoginController;
use Illuminate\Support\Facades\Route;

/*
| Root: redirect to the preferred public locale. Module routes are registered by ModuleServiceProvider.
*/
Route::get('/', function () {
    $locale = session('locale') ?? request()->cookie('locale') ?? request()->getPreferredLanguage(ev_locales()) ?? config('ev.default_locale', 'ar');
    if (! in_array($locale, ev_locales(), true)) {
        $locale = config('ev.default_locale', 'ar');
    }

    return redirect()->to('/'.$locale);
})->name('home');

Route::post('locale', [LocaleController::class, 'switch'])->middleware(['throttle:locale'])->name('locale.switch');

Route::get('admin/login', [PortalLoginController::class, 'admin'])->middleware('guest')->name('admin.login');
Route::get('partner/login', [PortalLoginController::class, 'partner'])->middleware('guest')->name('partner.login');

require __DIR__.'/settings.php';
