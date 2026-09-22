<?php

use App\Modules\System\Http\Controllers\Admin\DashboardController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/admin/dashboard');
Route::get('dashboard', DashboardController::class)->name('dashboard');
