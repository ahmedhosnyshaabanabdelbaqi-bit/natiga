<?php

namespace App\Modules\Members\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Members\Actions\ChangeMembershipStatus;
use App\Modules\Members\Http\Requests\Admin\StatusChangeRequest;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use Illuminate\Http\RedirectResponse;

/**
 * One endpoint per transition; authorization lives in StatusChangeRequest (policy ability per method).
 * Every endpoint also pins the source statuses it may act on, so a permission can only ever perform
 * its own transition (e.g. `reactivate` cannot approve a pending member, `approve` cannot lift a suspension).
 */
class MemberStatusController extends Controller
{
    public function __construct(private ChangeMembershipStatus $action) {}

    public function approve(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Active, [MembershipStatus::Pending]);
    }

    public function reject(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Rejected, [MembershipStatus::Pending]);
    }

    public function suspend(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Suspended, [MembershipStatus::Active]);
    }

    public function reactivate(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Active, [MembershipStatus::Suspended, MembershipStatus::Expired]);
    }

    public function expire(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Expired, [MembershipStatus::Active]);
    }

    public function reopen(StatusChangeRequest $request, Membership $membership): RedirectResponse
    {
        return $this->change($request, $membership, MembershipStatus::Pending, [MembershipStatus::Rejected]);
    }

    /** @param  MembershipStatus[]  $from */
    private function change(StatusChangeRequest $request, Membership $membership, MembershipStatus $to, array $from): RedirectResponse
    {
        $this->action->execute($membership, $to, $request->user(), $request->validated('reason'), $from);

        return back()->with('success', __('members.flash.status_changed', ['status' => $to->label()]));
    }
}
