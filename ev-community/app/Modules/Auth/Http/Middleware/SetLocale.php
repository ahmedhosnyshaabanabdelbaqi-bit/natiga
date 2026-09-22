<?php

namespace App\Modules\Auth\Http\Middleware;

use Carbon\Carbon;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * Locale resolution order:
 *  1. `{locale}` route parameter (public pages)
 *  2. authenticated user's preferred locale
 *  3. session / cookie
 *  4. Accept-Language
 *  5. platform default
 */
class SetLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        $locales = ev_locales();
        $locale = null;

        $routeLocale = $request->route('locale');
        if (is_string($routeLocale) && in_array($routeLocale, $locales, true)) {
            $locale = $routeLocale;
        } elseif ($request->user()?->preferred_locale && in_array($request->user()->preferred_locale, $locales, true)) {
            $locale = $request->user()->preferred_locale;
        } elseif ($request->hasSession() && in_array($request->session()->get('locale'), $locales, true)) {
            $locale = $request->session()->get('locale');
        } elseif (in_array($request->cookie('locale'), $locales, true)) {
            $locale = $request->cookie('locale');
        } else {
            $preferred = $request->getPreferredLanguage($locales);
            $locale = in_array($preferred, $locales, true) ? $preferred : config('ev.default_locale', 'ar');
        }

        app()->setLocale($locale);
        Carbon::setLocale($locale);
        if ($request->hasSession()) {
            $request->session()->put('locale', $locale);
        }
        Cookie::queue(Cookie::make('locale', $locale, 60 * 24 * 365, httpOnly: false));

        return $next($request);
    }
}
