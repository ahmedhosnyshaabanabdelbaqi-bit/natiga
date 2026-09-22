<?php

namespace App\Modules\Members\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Members\Models\Enums\MembershipStatus;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MemberStatusController extends Controller
{
    public function __invoke(Request $request): Response|RedirectResponse
    {
        if ($request->user()->membership?->status === MembershipStatus::Active) {
            return redirect()->route('member.dashboard');
        }

        return Inertia::render('member/status');
    }
}
