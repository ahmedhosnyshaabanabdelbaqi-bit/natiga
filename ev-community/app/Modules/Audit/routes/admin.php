<?php

use App\Modules\Audit\Http\Controllers\Admin\AuditLogsController;
use App\Modules\Audit\Http\Controllers\Admin\SecurityEventsController;
use Illuminate\Support\Facades\Route;

Route::middleware('permission:audit.view')->prefix('audit-logs')->name('audit-logs.')->group(function () {
    Route::get('/', [AuditLogsController::class, 'index'])->name('index');            // admin.audit-logs.index
    Route::get('actions', [AuditLogsController::class, 'actions'])->name('actions');  // admin.audit-logs.actions (JSON autocomplete)
    Route::get('export', [AuditLogsController::class, 'export'])->name('export');     // admin.audit-logs.export (CSV)
    Route::get('{auditLog}', [AuditLogsController::class, 'show'])->whereNumber('auditLog')->name('show'); // admin.audit-logs.show (JSON detail)
});

Route::middleware('permission:security_events.view')->prefix('security-events')->name('security-events.')->group(function () {
    Route::get('/', [SecurityEventsController::class, 'index'])->name('index');       // admin.security-events.index
});
