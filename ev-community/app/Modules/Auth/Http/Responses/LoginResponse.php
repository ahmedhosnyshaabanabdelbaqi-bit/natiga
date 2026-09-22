<?php

namespace App\Modules\Auth\Http\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;

class LoginResponse implements LoginResponseContract
{
    public function toResponse($request): JsonResponse|RedirectResponse
    {
        $user = $request->user();
        $portal = $request->session()->pull('auth.portal', 'member');
        $request->session()->forget('auth.portal');

        $home = match (true) {
            $portal === 'admin' && $user->isStaff() => config('ev.portals.admin.home'),
            $portal === 'partner' && ($user->isPartnerUser() || $user->isSuperAdmin()) => config('ev.portals.partner.home'),
            $user->isMember() => config('ev.portals.member.home'),
            $user->isStaff() => config('ev.portals.admin.home'),
            $user->isPartnerUser() => config('ev.portals.partner.home'),
            default => config('ev.portals.member.home'),
        };

        if ($portal !== 'member' && ! str_starts_with($home, config("ev.portals.{$portal}.home"))) {
            $request->session()->flash('error', __('auth.portal_access_denied'));
        }

        return $request->wantsJson()
            ? new JsonResponse(['two_factor' => false, 'redirect' => $home], 200)
            : redirect()->intended($home);
    }
}
