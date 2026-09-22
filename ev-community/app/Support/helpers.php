<?php

use Illuminate\Support\Facades\Route;

if (! function_exists('lroute')) {
    /**
     * Route helper for public (locale-prefixed) routes.
     */
    function lroute(string $name, array $parameters = [], ?string $locale = null): string
    {
        return route($name, ['locale' => $locale ?? app()->getLocale()] + $parameters);
    }
}

if (! function_exists('ev_locales')) {
    /** @return string[] */
    function ev_locales(): array
    {
        return array_keys(config('ev.locales', ['ar' => [], 'en' => []]));
    }
}

if (! function_exists('ev_dir')) {
    function ev_dir(?string $locale = null): string
    {
        return config('ev.locales.'.($locale ?? app()->getLocale()).'.dir', 'ltr');
    }
}

if (! function_exists('ev_request_id')) {
    function ev_request_id(): ?string
    {
        return app()->bound('ev.request_id') ? app('ev.request_id') : null;
    }
}

if (! function_exists('route_exists')) {
    function route_exists(string $name): bool
    {
        return Route::has($name);
    }
}
