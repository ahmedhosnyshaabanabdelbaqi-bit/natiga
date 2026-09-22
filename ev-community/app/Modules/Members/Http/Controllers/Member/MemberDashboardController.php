<?php

namespace App\Modules\Members\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Referrals\Services\ReferralService;
use App\Modules\System\Services\DashboardKpis;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MemberDashboardController extends Controller
{
    public function __invoke(Request $request, ReferralService $referrals): Response
    {
        $user = $request->user();
        $membership = $user->membership;

        return Inertia::render('member/dashboard', [
            'membership' => [
                'member_number' => $membership->member_number,
                'status' => $membership->status->value,
                'joined_at' => $membership->joined_at?->toIso8601String(),
            ],
            'kpis' => DashboardKpis::resolveFor($user, 'member', $membership),
            'profile' => [
                'mobile_missing' => blank($user->mobile),
                'governorate_missing' => $membership->governorate_id === null,
            ],
            'referrals_enabled' => $referrals->enabled(),
        ]);
    }
}
