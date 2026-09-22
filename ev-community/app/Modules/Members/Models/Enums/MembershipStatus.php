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
}
