<?php

use App\Modules\Referrals\Http\Controllers\Admin\ReferralController;
use Illuminate\Support\Facades\Route;

Route::middleware(['module:referrals', 'permission:referrals.view'])->get('referrals', ReferralController::class)->name('referrals.index');
