<?php

namespace App\Modules\Members\Policies;

use App\Models\User;
use App\Modules\Members\Models\Membership;

/**
 * Staff abilities map 1:1 to `members.*` permissions; member abilities require ownership.
 * Super roles pass through Gate::before (Auth module).
 */
class MembershipPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('members.view');
    }

    public function view(User $user, Membership $membership): bool
    {
        return $user->can('members.view');
    }

    public function update(User $user, Membership $membership): bool
    {
        return $user->can('members.edit');
    }

    public function approve(User $user, Membership $membership): bool
    {
        return $user->can('members.approve');
    }

    public function reject(User $user, Membership $membership): bool
    {
        return $user->can('members.approve');
    }

    public function reopen(User $user, Membership $membership): bool
    {
        return $user->can('members.approve');
    }

    public function suspend(User $user, Membership $membership): bool
    {
        return $user->can('members.suspend');
    }

    public function reactivate(User $user, Membership $membership): bool
    {
        return $user->can('members.suspend');
    }

    public function expire(User $user, Membership $membership): bool
    {
        return $user->can('members.edit');
    }

    public function export(User $user): bool
    {
        return $user->can('members.export');
    }

    public function verify(User $user): bool
    {
        return $user->can('members.verify');
    }

    public function addNote(User $user, Membership $membership): bool
    {
        return $user->can('members.notes');
    }

    public function viewSecurity(User $user, Membership $membership): bool
    {
        return $user->can('security_events.view');
    }

    /** Member-side: the card, profile and privacy pages only ever expose the caller's own membership. */
    public function viewOwn(User $user, Membership $membership): bool
    {
        return $membership->user_id === $user->id;
    }

    public function rotateToken(User $user, Membership $membership): bool
    {
        return $membership->user_id === $user->id || $user->can('members.edit');
    }
}
