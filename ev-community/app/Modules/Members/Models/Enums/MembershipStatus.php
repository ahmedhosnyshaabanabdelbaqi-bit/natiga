<?php

namespace App\Modules\Members\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum MembershipStatus: string implements HasLabel
{
    use EnumOptions;

    case Pending = 'pending';
    case Active = 'active';
    case Suspended = 'suspended';
    case Rejected = 'rejected';
    case Expired = 'expired';

    public function label(): string
    {
        return __('members.status.'.$this->value);
    }

    public function color(): string
    {
        return match ($this) {
            self::Active => 'success',
            self::Pending => 'warning',
            self::Suspended, self::Rejected => 'danger',
            self::Expired => 'muted',
        };
    }

    /**
     * State machine: pending→active|rejected, active→suspended|expired, suspended→active,
     * rejected→pending (re-open), expired→active (renewal).
     *
     * @return self[]
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Pending => [self::Active, self::Rejected],
            self::Active => [self::Suspended, self::Expired],
            self::Suspended => [self::Active],
            self::Rejected => [self::Pending],
            self::Expired => [self::Active],
        };
    }

    public function canTransitionTo(self $to): bool
    {
        return in_array($to, $this->allowedTransitions(), true);
    }

    /** Suspending or rejecting a member always needs a stored reason. */
    public function requiresReason(): bool
    {
        return in_array($this, [self::Suspended, self::Rejected], true);
    }

    /** @return string[] */
    public function allowedTransitionValues(): array
    {
        return array_map(fn (self $s) => $s->value, $this->allowedTransitions());
    }
}
