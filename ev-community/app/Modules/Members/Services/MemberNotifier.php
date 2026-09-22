<?php

namespace App\Modules\Members\Services;

use App\Models\User;
use App\Modules\Members\Events\MembershipApproved;
use App\Modules\Members\Events\MembershipExpired;
use App\Modules\Members\Events\MembershipReactivated;
use App\Modules\Members\Events\MembershipRejected;
use App\Modules\Members\Events\MembershipReopened;
use App\Modules\Members\Events\MembershipStatusChanged;
use App\Modules\Members\Events\MembershipSuspended;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Notifications\Services\Notify;

/**
 * Member-facing notifications of this module, sent through the Notifications module
 * (`Notify::send`, in-app + email per the member's preferences). Every call carries a dedup key,
 * so retries of the queued listener never produce a second notification.
 *
 * Texts come from `members.notifications.<type>.title|body` (lang/{ar,en}/members.php) rendered in the
 * recipient's locale. Staff-entered reasons are deliberately NOT included: they are internal notes
 * and may contain information that should not be sent to the member.
 *
 * A notification failure is reported but never breaks the business flow that triggered it.
 */
final class MemberNotifier
{
    public function membershipStatusChanged(MembershipStatusChanged $event): void
    {
        $membership = $event->membership;
        $user = $membership->user;
        if (! $user || ! $user->isActive()) {
            return; // disabled/anonymised accounts receive nothing
        }
        $type = self::typeFor($event);
        $url = in_array($type, ['approved', 'reactivated'], true) ? '/account/membership-card' : '/account/status';

        $this->send($user, 'members.membership_'.$type, [
            'member_number' => $membership->member_number,
            'status' => $event->to->value,
            'status_label' => $event->to->label(),
            '_title_key' => "members.notifications.{$type}.title",
            '_body_key' => "members.notifications.{$type}.body",
        ], "members.status:{$membership->id}:".($event->historyId ?? $event->to->value), $url);
    }

    public function deletionRequested(User $user, AccountDeletionRequest $request): void
    {
        $this->send($user, 'members.deletion_requested', [
            '_title_key' => 'members.notifications.deletion_requested.title',
            '_body_key' => 'members.notifications.deletion_requested.body',
        ], "members.deletion_requested:{$request->id}", '/account/privacy');
    }

    public function deletionRejected(AccountDeletionRequest $request): void
    {
        $user = $request->user;
        if (! $user || ! $user->isActive()) {
            return;
        }
        $this->send($user, 'members.deletion_rejected', [
            '_title_key' => 'members.notifications.deletion_rejected.title',
            '_body_key' => 'members.notifications.deletion_rejected.body',
        ], "members.deletion_rejected:{$request->id}", '/account/privacy');
    }

    /** @param  array<string, mixed>  $data */
    public function send(User $user, string $key, array $data, string $dedupKey, ?string $url = null): bool
    {
        try {
            Notify::send($user, $key, $data, 'system', transactional: true, dedupKey: $dedupKey, url: $url);

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }

    public static function typeFor(MembershipStatusChanged $event): string
    {
        return match (true) {
            $event instanceof MembershipApproved => 'approved',
            $event instanceof MembershipRejected => 'rejected',
            $event instanceof MembershipSuspended => 'suspended',
            $event instanceof MembershipReactivated => 'reactivated',
            $event instanceof MembershipExpired => 'expired',
            $event instanceof MembershipReopened => 'reopened',
            default => $event->to->value,
        };
    }
}
