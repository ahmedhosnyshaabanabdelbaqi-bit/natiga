<?php

namespace App\Modules\Members\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\System\Services\DashboardKpis;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MemberDashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $membership = $request->user()->membership;

        return Inertia::render('member/dashboard', [
            'membership' => [
                'member_number' => $membership->member_number,
                'status' => $membership->status->value,
                'joined_at' => $membership->joined_at?->toIso8601String(),
            ],
            'kpis' => DashboardKpis::resolveFor($request->user(), 'member', $membership),
        ]);
    }
}
