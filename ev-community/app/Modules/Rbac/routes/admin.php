<?php

use App\Modules\Rbac\Http\Controllers\Admin\RolesController;
use App\Modules\System\Http\Middleware\RecordPrivilegeEscalationAttempt;
use Illuminate\Support\Facades\Route;

// RecordPrivilegeEscalationAttempt records a critical security event for mutating requests by actors lacking
// roles.manage (before the permission middleware rejects them with 403).
Route::middleware([RecordPrivilegeEscalationAttempt::class.':roles.manage', 'permission:roles.manage'])->prefix('roles')->name('roles.')->group(function () {
    Route::get('/', [RolesController::class, 'index'])->name('index');                                   // admin.roles.index
    Route::post('/', [RolesController::class, 'store'])->name('store');                                  // admin.roles.store
    Route::put('{role}/permissions', [RolesController::class, 'updatePermissions'])->name('permissions'); // admin.roles.permissions
    Route::delete('{role}', [RolesController::class, 'destroy'])->name('destroy');                        // admin.roles.destroy
});
