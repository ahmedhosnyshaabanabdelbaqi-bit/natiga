<?php

use App\Modules\Members\Http\Controllers\Partner\MemberVerificationController;
use Illuminate\Support\Facades\Route;

Route::prefix('members')->name('members.')->middleware('permission:partner.access')->group(function () {
    Route::get('scan', [MemberVerificationController::class, 'scan'])->name('scan');
    Route::post('verify', [MemberVerificationController::class, 'verify'])->middleware('throttle:member-verify')->name('verify');
});
