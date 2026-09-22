<?php

namespace App\Modules\Auth\Http\Middleware;

use App\Modules\System\Services\Settings;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Admin panel: requires `admin.access` (or a super role). Privileged roles must have MFA enabled.
 */
class EnsureAdminPortal
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || ! $user->isStaff()) {
            abort(403, __('auth.no_admin_access'));
        }

        if (Settings::bool('security.mfa_mandatory_for_admins', true) && $user->mfaIsMandatory() && ! $user->hasMfaEnabled() && ! $request->routeIs('admin.security.*', 'logout')) {
            return redirect()->route('admin.security.mfa-required');
        }

        return $next($request);
    }
}
