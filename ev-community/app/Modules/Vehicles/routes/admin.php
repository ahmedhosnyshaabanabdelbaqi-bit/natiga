<?php

use App\Modules\Vehicles\Http\Controllers\Admin\BatteryVariantController;
use App\Modules\Vehicles\Http\Controllers\Admin\CompatibilityRuleController;
use App\Modules\Vehicles\Http\Controllers\Admin\ConnectorTypeController;
use App\Modules\Vehicles\Http\Controllers\Admin\MemberVehicleController;
use App\Modules\Vehicles\Http\Controllers\Admin\VehicleMakeController;
use App\Modules\Vehicles\Http\Controllers\Admin\VehicleModelController;
use App\Modules\Vehicles\Http\Controllers\Admin\VehicleVariantController;
use Illuminate\Support\Facades\Route;

Route::middleware('module:vehicles')->prefix('vehicles')->name('vehicles.')->group(function () {
    // ---- Master data: readable with vehicles.view or vehicles.manage_master, writable with vehicles.manage_master
    Route::middleware('permission:vehicles.view|vehicles.manage_master')->group(function () {
        Route::get('/', [VehicleMakeController::class, 'index'])->name('index');                 // /admin/vehicles (makes)
        Route::get('models', [VehicleModelController::class, 'index'])->name('models.index');
        Route::get('variants', [VehicleVariantController::class, 'index'])->name('variants.index');
        Route::get('connectors', [ConnectorTypeController::class, 'index'])->name('connectors.index');
    });

    Route::middleware('permission:vehicles.manage_master')->group(function () {
        Route::post('makes', [VehicleMakeController::class, 'store'])->name('makes.store');
        Route::put('makes/{make}', [VehicleMakeController::class, 'update'])->name('makes.update');
        Route::post('makes/{make}/toggle', [VehicleMakeController::class, 'toggle'])->name('makes.toggle');
        Route::delete('makes/{make}', [VehicleMakeController::class, 'destroy'])->name('makes.destroy');

        Route::post('models', [VehicleModelController::class, 'store'])->name('models.store');
        Route::put('models/{model}', [VehicleModelController::class, 'update'])->name('models.update');
        Route::post('models/{model}/toggle', [VehicleModelController::class, 'toggle'])->name('models.toggle');
        Route::delete('models/{model}', [VehicleModelController::class, 'destroy'])->name('models.destroy');

        Route::post('variants', [VehicleVariantController::class, 'store'])->name('variants.store');
        Route::put('variants/{variant}', [VehicleVariantController::class, 'update'])->name('variants.update');
        Route::post('variants/{variant}/toggle', [VehicleVariantController::class, 'toggle'])->name('variants.toggle');
        Route::delete('variants/{variant}', [VehicleVariantController::class, 'destroy'])->name('variants.destroy');

        Route::post('batteries', [BatteryVariantController::class, 'store'])->name('batteries.store');
        Route::put('batteries/{battery}', [BatteryVariantController::class, 'update'])->name('batteries.update');
        Route::delete('batteries/{battery}', [BatteryVariantController::class, 'destroy'])->name('batteries.destroy');

        Route::post('connectors', [ConnectorTypeController::class, 'store'])->name('connectors.store');
        Route::put('connectors/{connector}', [ConnectorTypeController::class, 'update'])->name('connectors.update');
        Route::post('connectors/{connector}/toggle', [ConnectorTypeController::class, 'toggle'])->name('connectors.toggle');
        Route::put('compatibility', [CompatibilityRuleController::class, 'update'])->name('compatibility.update');
    });

    // ---- Member vehicles (read-only, never lists VINs)
    Route::middleware('permission:vehicles.view')->group(function () {
        Route::get('members', [MemberVehicleController::class, 'index'])->name('members.index');
        Route::post('members/vin-lookup', [MemberVehicleController::class, 'vinLookup'])->middleware('throttle:vin-lookup')->name('members.vin_lookup');
        Route::get('members/{vehicle}', [MemberVehicleController::class, 'show'])->name('members.show');
        Route::put('members/{vehicle}', [MemberVehicleController::class, 'update'])->middleware('permission:vehicles.edit_member_vehicle')->name('members.update');
    });
});
