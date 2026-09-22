<?php

namespace App\Modules\Referrals\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Referrals\Services\ReferralService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ReferralController extends Controller
{
    public function __invoke(Request $request, ReferralService $referrals): Response
    {
        abort_unless($referrals->enabled(), 404, __('core.errors.module_disabled'));

        $membership = $request->user()->membership;
        $referrals->backfillFor($membership);

        return Inertia::render('member/referrals/index', [
            'referral_code' => $membership->referral_code,
            'share_link' => $referrals->shareLink($membership),
            'stats' => $referrals->statsFor($membership),
            'referred' => $referrals->referredList($membership),
        ]);
    }
}
