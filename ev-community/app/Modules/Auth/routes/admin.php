<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::prefix('security')->name('security.')->group(function () {
    Route::get('mfa-required', fn () => Inertia::render('admin/security/mfa-required'))->name('mfa-required');
});
