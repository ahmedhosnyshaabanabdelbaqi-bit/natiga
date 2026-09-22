<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
| /api/v1 is reserved for future mobile/partner integrations (Sanctum). Module API routes are
| registered by ModuleServiceProvider under api/v1 with auth:sanctum.
*/
Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('v1')->group(function () {
    Route::get('me', fn (Request $request) => response()->json([
        'data' => ['id' => $request->user()->public_id, 'name' => $request->user()->name, 'locale' => $request->user()->preferred_locale],
        'message' => null, 'errors' => null, 'meta' => ['request_id' => ev_request_id()],
    ]))->name('api.v1.me');
});
