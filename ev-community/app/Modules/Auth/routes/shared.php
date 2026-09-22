<?php

use App\Modules\Auth\Http\Controllers\Settings\SessionsController;
use Illuminate\Support\Facades\Route;

// Personal "active sessions" page, available to every authenticated user regardless of portal.
// {session} is the opaque key from SessionKeys (never the raw session id).
Route::middleware(['auth', 'active'])->prefix('settings')->name('settings.')->group(function () {
    Route::get('sessions', [SessionsController::class, 'index'])->name('sessions.index');                                                                   // shared.settings.sessions.index → /settings/sessions
    Route::post('sessions/logout-others', [SessionsController::class, 'logoutOthers'])->middleware('throttle:6,1')->name('sessions.logout-others');           // shared.settings.sessions.logout-others
    Route::delete('sessions/{session}', [SessionsController::class, 'destroy'])->where('session', '[a-f0-9]{40}')->middleware('throttle:30,1')->name('sessions.destroy'); // shared.settings.sessions.destroy
});
