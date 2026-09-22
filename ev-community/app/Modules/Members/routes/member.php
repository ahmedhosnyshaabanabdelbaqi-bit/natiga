<?php

use App\Modules\Members\Http\Controllers\Member\MemberDashboardController;
use App\Modules\Members\Http\Controllers\Member\MemberStatusController;
use Illuminate\Support\Facades\Route;

Route::get('/', MemberDashboardController::class)->name('dashboard');
Route::get('status', MemberStatusController::class)->name('status');
