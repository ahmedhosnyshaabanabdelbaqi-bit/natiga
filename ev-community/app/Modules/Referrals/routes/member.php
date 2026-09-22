<?php

use App\Modules\Referrals\Http\Controllers\Member\ReferralController;
use Illuminate\Support\Facades\Route;

Route::middleware('module:referrals')->get('referrals', ReferralController::class)->name('referrals.index');
