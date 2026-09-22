<?php

namespace App\Modules\Auth\Http\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\LogoutResponse as LogoutResponseContract;

class LogoutResponse implements LogoutResponseContract
{
    public function toResponse($request): JsonResponse|RedirectResponse
    {
        $referer = (string) $request->headers->get('referer', '');
        $path = parse_url($referer, PHP_URL_PATH) ?? '/';
        $target = match (true) {
            str_starts_with($path, '/admin') => config('ev.portals.admin.login'),
            str_starts_with($path, '/partner') => config('ev.portals.partner.login'),
            default => '/'.($request->session()->get('locale') ?? config('ev.default_locale', 'ar')),
        };

        return $request->wantsJson() ? new JsonResponse('', 204) : redirect()->to($target);
    }
}
