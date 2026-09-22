<?php

namespace App\Modules\Members\Policies;

use App\Models\User;
use App\Modules\Members\Models\Membership;
use App\Modules\System\Services\StaffUsers;

/**
 * Staff abilities map 1:1 to `members.*` permissions; member abilities require ownership.
 * Super roles pass through Gate::before (Auth module).
 *
 * Escalation guards for staff write abilities (status changes, profile edits):
 *  - never on the actor's own membership (no self-approval / self-reactivation / self-edit from the admin side);
 *  - never on an owner/super-admin account (only super actors, who pass Gate::before, manage those);
 *  - editing the profile (name/email/mobile) of a staff or partner account additionally requires the Users
 *    module's `update` ability on that user: changing a staff e-mail is an account-takeover vector
 *    (password reset to the new address), so `members.edit` alone must not allow it.
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
        if (! $user->can('members.edit') || ! $this->manageable($user, $membership)) {
            return false;
        }
        $target = $membership->user;

        return ! app(StaffUsers::class)->isStaffAccount($target) || $user->can('update', $target);
    }

    public function approve(User $user, Membership $membership): bool
    {
        return $user->can('members.approve') && $this->manageable($user, $membership);
    }

    public function reject(User $user, Membership $membership): bool
    {
        return $user->can('members.approve') && $this->manageable($user, $membership);
    }

    public function reopen(User $user, Membership $membership): bool
    {
        return $user->can('members.approve') && $this->manageable($user, $membership);
    }

    public function suspend(User $user, Membership $membership): bool
    {
        return $user->can('members.suspend') && $this->manageable($user, $membership);
    }

    public function reactivate(User $user, Membership $membership): bool
    {
        return $user->can('members.suspend') && $this->manageable($user, $membership);
    }

    public function expire(User $user, Membership $membership): bool
    {
        return $user->can('members.edit') && $this->manageable($user, $membership);
    }

    /** Resending the verification e-mail changes nothing sensitive, but stays a staff edit ability. */
    public function resendVerification(User $user, Membership $membership): bool
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

    /**
     * UI hints for the admin detail page (the server re-checks every action).
     *
     * @return array<string, bool>
     */
    public static function abilitiesFor(User $user, Membership $membership): array
    {
        $abilities = [];
        foreach (['approve', 'reject', 'reopen', 'suspend', 'reactivate', 'expire', 'update', 'resendVerification', 'rotateToken', 'addNote'] as $ability) {
            $abilities[$ability] = $user->can($ability, $membership);
        }

        return $abilities;
    }

    private function manageable(User $actor, Membership $membership): bool
    {
        if ($membership->user_id === $actor->id) {
            return false;
        }
        $target = $membership->user;

        return $target !== null && ! $target->isSuperAdmin();
    }
}
