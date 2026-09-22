<?php

namespace App\Modules\Members\Listeners;

use App\Modules\Members\Events\MembershipStatusChanged;
use App\Modules\Members\Services\MemberNotifier;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Queued side effect of every membership status event (registered in MembersServiceProvider for each
 * concrete event). Retry-safe: the notification carries a dedup key per status-history row.
 */
final class SendMembershipStatusNotification implements ShouldQueue
{
    public bool $afterCommit = true;

    public int $tries = 3;

    public function __construct(private MemberNotifier $notifier) {}

    public function handle(MembershipStatusChanged $event): void
    {
        $this->notifier->membershipStatusChanged($event);
    }
}
