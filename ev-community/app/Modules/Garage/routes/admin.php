<?php

use App\Modules\Garage\Http\Controllers\Admin\GarageOverviewController;
use Illuminate\Support\Facades\Route;

Route::middleware(['module:garage', 'permission:vehicles.view'])->prefix('garage')->name('garage.')->group(function () {
    Route::get('/', GarageOverviewController::class)->name('index');   // /admin/garage
});
