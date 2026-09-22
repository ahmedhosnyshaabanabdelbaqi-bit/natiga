<?php

use App\Modules\System\Http\Controllers\Partner\DashboardController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/partner/dashboard');
Route::get('dashboard', DashboardController::class)->name('dashboard');
