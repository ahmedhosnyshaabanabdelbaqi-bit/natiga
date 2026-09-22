<?php

use App\Modules\Members\Http\Controllers\Member\MemberDashboardController;
use App\Modules\Members\Http\Controllers\Member\MemberProfileController;
use App\Modules\Members\Http\Controllers\Member\MembershipCardController;
use App\Modules\Members\Http\Controllers\Member\MemberStatusController;
use App\Modules\Members\Http\Controllers\Member\PrivacyController;
use Illuminate\Support\Facades\Route;

Route::get('/', MemberDashboardController::class)->name('dashboard');
Route::get('status', MemberStatusController::class)->name('status');

Route::get('membership-card', [MembershipCardController::class, 'show'])->name('membership-card');
Route::post('membership-card/rotate', [MembershipCardController::class, 'rotate'])->name('membership-card.rotate');

Route::get('profile', [MemberProfileController::class, 'edit'])->name('profile.edit');
Route::patch('profile', [MemberProfileController::class, 'update'])->name('profile.update');

Route::prefix('privacy')->name('privacy.')->group(function () {
    Route::get('/', [PrivacyController::class, 'index'])->name('index');
    Route::put('consents', [PrivacyController::class, 'updateConsents'])->name('consents');
    Route::post('deactivate', [PrivacyController::class, 'deactivate'])->name('deactivate');
    Route::post('deletion-request', [PrivacyController::class, 'requestDeletion'])->name('deletion-request');
});
