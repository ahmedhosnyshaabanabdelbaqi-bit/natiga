<?php

use App\Modules\Garage\Http\Controllers\Member\GarageController;
use App\Modules\Garage\Http\Controllers\Member\VehicleOdometerController;
use App\Modules\Garage\Http\Controllers\Member\VehiclePrimaryController;
use App\Modules\Garage\Http\Controllers\Member\VehicleStatusController;
use App\Modules\Garage\Http\Controllers\Member\VehicleVinController;
use Illuminate\Support\Facades\Route;

Route::middleware('module:garage')->prefix('garage')->name('garage.')->group(function () {
    Route::get('/', [GarageController::class, 'index'])->name('index');                 // /account/garage
    Route::get('create', [GarageController::class, 'create'])->name('create');
    Route::post('/', [GarageController::class, 'store'])->name('store');
    Route::get('{vehicle}', [GarageController::class, 'show'])->name('show');
    Route::get('{vehicle}/edit', [GarageController::class, 'edit'])->name('edit');
    Route::put('{vehicle}', [GarageController::class, 'update'])->name('update');
    Route::delete('{vehicle}', [GarageController::class, 'destroy'])->name('destroy');

    Route::post('{vehicle}/status', VehicleStatusController::class)->name('status');
    Route::post('{vehicle}/primary', VehiclePrimaryController::class)->name('primary');
    Route::post('{vehicle}/odometer', VehicleOdometerController::class)->name('odometer');
    Route::post('{vehicle}/vin/reveal', VehicleVinController::class)->middleware('throttle:vin-reveal')->name('vin.reveal');
});
