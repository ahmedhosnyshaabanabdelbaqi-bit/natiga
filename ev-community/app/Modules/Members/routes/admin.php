<?php

use App\Modules\Members\Http\Controllers\Admin\DeletionRequestController;
use App\Modules\Members\Http\Controllers\Admin\MemberController;
use App\Modules\Members\Http\Controllers\Admin\MemberNoteController;
use App\Modules\Members\Http\Controllers\Admin\MemberStatusController;
use App\Modules\Members\Http\Controllers\Admin\MemberVerificationController;
use Illuminate\Support\Facades\Route;

Route::prefix('members')->name('members.')
    ->where(['membership' => '[0-9A-Za-z]{26}', 'deletionRequest' => '[0-9A-Za-z]{26}', 'note' => '[0-9]+'])
    ->group(function () {
        Route::get('/', [MemberController::class, 'index'])->middleware('permission:members.view')->name('index');
        Route::get('pending', [MemberController::class, 'pending'])->middleware('permission:members.view')->name('pending');
        Route::get('export', [MemberController::class, 'export'])->middleware('permission:members.export')->name('export');
        Route::post('bulk-approve', [MemberController::class, 'bulkApprove'])->middleware('permission:members.approve')->name('bulk-approve');

        Route::get('scan', [MemberVerificationController::class, 'scan'])->middleware('permission:members.verify')->name('scan');
        Route::post('verify', [MemberVerificationController::class, 'verify'])->middleware(['permission:members.verify', 'throttle:member-verify'])->name('verify');

        Route::prefix('deletion-requests')->name('deletion-requests.')->middleware('permission:members.delete_requests')->group(function () {
            Route::get('/', [DeletionRequestController::class, 'index'])->name('index');
            Route::post('{deletionRequest}/review', [DeletionRequestController::class, 'review'])->name('review');
            Route::post('{deletionRequest}/complete', [DeletionRequestController::class, 'complete'])->name('complete');
            Route::post('{deletionRequest}/reject', [DeletionRequestController::class, 'reject'])->name('reject');
        });

        Route::get('{membership}', [MemberController::class, 'show'])->middleware('permission:members.view')->name('show');
        Route::patch('{membership}', [MemberController::class, 'update'])->middleware('permission:members.edit')->name('update');
        Route::post('{membership}/approve', [MemberStatusController::class, 'approve'])->middleware('permission:members.approve')->name('approve');
        Route::post('{membership}/reject', [MemberStatusController::class, 'reject'])->middleware('permission:members.approve')->name('reject');
        Route::post('{membership}/reopen', [MemberStatusController::class, 'reopen'])->middleware('permission:members.approve')->name('reopen');
        Route::post('{membership}/suspend', [MemberStatusController::class, 'suspend'])->middleware('permission:members.suspend')->name('suspend');
        Route::post('{membership}/reactivate', [MemberStatusController::class, 'reactivate'])->middleware('permission:members.suspend')->name('reactivate');
        Route::post('{membership}/expire', [MemberStatusController::class, 'expire'])->middleware('permission:members.edit')->name('expire');
        Route::post('{membership}/resend-verification', [MemberController::class, 'resendVerification'])->middleware('permission:members.edit')->name('resend-verification');
        Route::post('{membership}/rotate-token', [MemberController::class, 'rotateToken'])->middleware('permission:members.edit')->name('rotate-token');
        Route::post('{membership}/notes', [MemberNoteController::class, 'store'])->middleware('permission:members.notes')->name('notes.store');
        Route::patch('{membership}/notes/{note}/pin', [MemberNoteController::class, 'pin'])->middleware('permission:members.notes')->name('notes.pin');
    });
