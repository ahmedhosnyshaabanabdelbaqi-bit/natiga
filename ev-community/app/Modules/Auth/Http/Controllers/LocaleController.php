<?php

namespace App\Modules\Auth\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;

class LocaleController extends Controller
{
    /**
     * Switch the language without losing the current page, filters or cart (server-side cart).
     */
    public function switch(Request $request): RedirectResponse
    {
        $data = $request->validate(['locale' => 'required|in:'.implode(',', ev_locales()), 'redirect' => 'nullable|string|max:2000']);
        $locale = $data['locale'];

        $request->session()->put('locale', $locale);
        Cookie::queue(Cookie::make('locale', $locale, 60 * 24 * 365, httpOnly: false));
        if ($user = $request->user()) {
            $user->forceFill(['preferred_locale' => $locale])->save();
        }

        $target = $data['redirect'] ?? $request->headers->get('referer') ?? '/';
        $path = parse_url($target, PHP_URL_PATH) ?? '/';
        $query = parse_url($target, PHP_URL_QUERY);
        // Rewrite /ar/... or /en/... prefixes; portal pages keep their path.
        $path = preg_replace('#^/(ar|en)(?=/|$)#', '/'.$locale, $path, 1, $count);
        if ($count === 0 && ($path === '/' || $path === '')) {
            $path = '/'.$locale;
        }
        $url = $path.($query ? '?'.$query : '');
        if (! str_starts_with($url, '/') || str_starts_with($url, '//')) {
            $url = '/'.$locale;
        }

        return redirect()->to($url);
    }
}
