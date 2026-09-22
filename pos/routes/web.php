<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
 * The SPA owns client-side routing; every non-API path renders the same shell.
 */
Route::get('/{any?}', fn () => view('app'))
    ->where('any', '^(?!api|up|storage).*$')
    ->name('spa');
