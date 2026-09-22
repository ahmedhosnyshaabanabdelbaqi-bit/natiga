<?php

namespace App\Modules\Auth\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Partner portal: requires `partner.access`. Center scoping is done in policies via center_users.
 */
class EnsurePartnerPortal
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || ! ($user->isPartnerUser() || $user->isSuperAdmin())) {
            abort(403, __('auth.no_partner_access'));
        }

        return $next($request);
    }
}
