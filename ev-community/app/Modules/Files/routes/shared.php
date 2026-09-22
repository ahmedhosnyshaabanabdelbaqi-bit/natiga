<?php

use App\Modules\Files\Http\Controllers\FileDownloadController;
use App\Modules\Files\Http\Controllers\UploadController;
use Illuminate\Support\Facades\Route;

// Authorized file access. Public files are served directly by their disk URL; everything
// else goes through these routes (route names: shared.files.download / shared.files.upload).
Route::middleware(['auth', 'active'])->group(function () {
    Route::get('files/{attachment}', FileDownloadController::class)->name('files.download');
    Route::post('files/upload', UploadController::class)->middleware('throttle:uploads')->name('files.upload');
});
