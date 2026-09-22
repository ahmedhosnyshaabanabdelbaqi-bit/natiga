<?php

namespace App\Modules\Auth\Http\Middleware;

use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\System\Services\Settings;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Member portal: requires a membership. Pending/suspended memberships only reach the status page.
 */
class EnsureMemberPortal
{
    private const ALLOWED_WHEN_NOT_ACTIVE = ['member.status', 'member.profile.*', 'member.settings.*', 'logout', 'verification.*'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $membership = $user?->membership;

        if (! $membership) {
            if ($user?->isStaff()) {
                return redirect()->to(config('ev.portals.admin.home'));
            }
            if ($user?->isPartnerUser()) {
                return redirect()->to(config('ev.portals.partner.home'));
            }
            abort(403, __('auth.no_membership'));
        }

        if (Settings::bool('security.require_email_verification') && ! $user->hasVerifiedEmail() && ! $request->routeIs('verification.*', 'logout')) {
            return redirect()->route('verification.notice');
        }

        if ($membership->status !== MembershipStatus::Active && ! $request->routeIs(...self::ALLOWED_WHEN_NOT_ACTIVE)) {
            return redirect()->route('member.status');
        }

        return $next($request);
    }
}
