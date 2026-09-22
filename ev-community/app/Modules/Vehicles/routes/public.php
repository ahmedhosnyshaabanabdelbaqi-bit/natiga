<?php

use App\Modules\Vehicles\Http\Controllers\Public\SelectedVehicleController;
use App\Modules\Vehicles\Http\Controllers\Public\SupportedVehiclesController;
use App\Modules\Vehicles\Http\Controllers\Public\VehicleDataController;
use Illuminate\Support\Facades\Route;

Route::middleware('module:vehicles')->prefix('vehicles')->name('vehicles.')->group(function () {
    Route::get('/', SupportedVehiclesController::class)->name('index');                                   // /{locale}/vehicles
    Route::get('data', VehicleDataController::class)->middleware('throttle:vehicle-data')->name('data');    // cached JSON for the selector
    Route::get('selected', [SelectedVehicleController::class, 'show'])->name('selected');
    Route::post('select', [SelectedVehicleController::class, 'store'])->middleware('throttle:vehicle-select')->name('select');
    Route::delete('select', [SelectedVehicleController::class, 'destroy'])->middleware('throttle:vehicle-select')->name('deselect');
});
