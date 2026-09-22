<?php

namespace App\Modules\Members\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Members\Actions\UpdateMemberProfile;
use App\Modules\Members\Http\Requests\Member\UpdateOwnProfileRequest;
use App\Modules\Members\Models\Governorate;
use App\Modules\System\Services\Settings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Member-specific profile fields; name/email/password live in the generic /settings pages. */
class MemberProfileController extends Controller
{
    public function edit(Request $request): Response
    {
        $user = $request->user();
        $membership = $user->membership;

        return Inertia::render('member/profile/edit', [
            'profile' => [
                'name' => $user->name,
                'email' => $user->email,
                'mobile' => $user->mobile,
                'preferred_locale' => $user->preferred_locale,
                'governorate_id' => $membership->governorate_id,
                'referral_source' => $membership->referral_source,
                'member_number' => $membership->member_number,
                'status' => $membership->status->value,
            ],
            'governorates' => Governorate::optionsFor(),
            'locales' => ev_locales(),
            'require_mobile' => Settings::bool('members.require_mobile', true),
        ]);
    }

    public function update(UpdateOwnProfileRequest $request, UpdateMemberProfile $action): RedirectResponse
    {
        $action->execute($request->user()->membership, $request->validated(), $request->user());

        return to_route('member.profile.edit')->with('success', __('members.profile.saved'));
    }
}
