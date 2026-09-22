<?php

use App\Modules\Members\Http\Controllers\Public\VerifyController;
use Illuminate\Support\Facades\Route;

// Public QR landing page: /verify/{token} → shared.members.verify (no PII, throttled).
Route::get('verify/{token}', VerifyController::class)
    ->middleware('throttle:public-forms')
    ->where('token', '[A-Za-z0-9_-]{20,512}')
    ->name('members.verify');
