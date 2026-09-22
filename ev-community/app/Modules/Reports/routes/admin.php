<?php

use App\Modules\Reports\Operations\Http\Controllers\Admin\ExceptionsController;
use App\Modules\Reports\Operations\Http\Controllers\Admin\IncidentsController;
use Illuminate\Support\Facades\Route;

// =====================================================================================================
// operations — Exception Center + incidents (owned by the system-admin wave; reporting routes go below)
// =====================================================================================================
Route::middleware('permission:operations.view|operations.manage')->prefix('operations')->name('operations.')->group(function () {
    Route::get('/', [ExceptionsController::class, 'index'])->name('index');                                   // admin.operations.index → /admin/operations
    Route::middleware('permission:operations.manage')->group(function () {
        Route::post('{exception}/assign', [ExceptionsController::class, 'assign'])->name('assign');            // admin.operations.assign
        Route::post('{exception}/resolve', [ExceptionsController::class, 'resolve'])->name('resolve');         // admin.operations.resolve
        Route::post('{exception}/ignore', [ExceptionsController::class, 'ignore'])->name('ignore');            // admin.operations.ignore
    });
});

Route::middleware('permission:incidents.view|incidents.manage')->prefix('incidents')->name('incidents.')->group(function () {
    Route::get('/', [IncidentsController::class, 'index'])->name('index');                                    // admin.incidents.index → /admin/incidents
    Route::middleware('permission:incidents.manage')->group(function () {
        Route::get('create', [IncidentsController::class, 'create'])->name('create');                         // admin.incidents.create
        Route::post('/', [IncidentsController::class, 'store'])->name('store');                               // admin.incidents.store
        Route::put('{incident}', [IncidentsController::class, 'update'])->name('update');                     // admin.incidents.update
        Route::post('{incident}/status', [IncidentsController::class, 'transition'])->name('status');         // admin.incidents.status
        Route::post('{incident}/notes', [IncidentsController::class, 'note'])->name('notes');                 // admin.incidents.notes
        Route::put('{incident}/review', [IncidentsController::class, 'review'])->name('review');              // admin.incidents.review
    });
    Route::get('{incident}', [IncidentsController::class, 'show'])->name('show');                             // admin.incidents.show
});
