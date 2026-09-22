<?php

namespace App\Modules\Members\Events;

use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Base payload of every membership status event. Concrete subclasses (MembershipApproved,
 * MembershipSuspended, ...) are what listeners subscribe to; this class is never dispatched itself.
 */
abstract class MembershipStatusChanged
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly Membership $membership,
        public readonly MembershipStatus $from,
        public readonly MembershipStatus $to,
        public readonly ?string $reason,
        public readonly ?int $historyId,
        public readonly ?int $actorId,
    ) {}

    /** @return array<int, class-string<self>> */
    public static function concreteEvents(): array
    {
        return [
            MembershipApproved::class,
            MembershipRejected::class,
            MembershipSuspended::class,
            MembershipReactivated::class,
            MembershipExpired::class,
            MembershipReopened::class,
        ];
    }

    /** @return class-string<self> */
    public static function classFor(MembershipStatus $from, MembershipStatus $to): string
    {
        return match ($to) {
            MembershipStatus::Active => $from === MembershipStatus::Pending ? MembershipApproved::class : MembershipReactivated::class,
            MembershipStatus::Rejected => MembershipRejected::class,
            MembershipStatus::Suspended => MembershipSuspended::class,
            MembershipStatus::Expired => MembershipExpired::class,
            MembershipStatus::Pending => MembershipReopened::class,
        };
    }
}
