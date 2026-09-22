<?php

namespace App\Modules\Members\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Members\Actions\ChangeMembershipStatus;
use App\Modules\Members\Http\Requests\Admin\StatusChangeRequest;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use Illuminate\Http\RedirectResponse;

/** One endpoint per transition; authorization lives in StatusChangeRequest (policy ability per method). */
class MemberStatusController extends Controller
{
    public function __construct(private ChangeMembershipStatus $action) {}

    public function approve(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Active);
    }

    public function reject(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Rejected);
    }

    public function suspend(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Suspended);
    }

    public function reactivate(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Active);
    }

    public function expire(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Expired);
    }

    public function reopen(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Pending);
    }

    private function change(StatusChangeRequest $request, Membership $membership, MembershipStatus $to): RedirectResponse
    {
        $this->action->execute($membership, $to, $request->user(), $request->validated('reason'));

        return back()->with('success', __('members.flash.status_changed', ['status' => $to->label()]));
    }
}
