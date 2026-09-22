<?php

namespace App\Modules\Members\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum VerificationPurpose: string implements HasLabel
{
    use EnumOptions;

    case Membership = 'membership';
    case Offer = 'offer';
    case Event = 'event';
    case Pickup = 'pickup';
    case Booking = 'booking';
    case Public = 'public';

    public function label(): string
    {
        return __('members.verification.purpose.'.$this->value);
    }

    /** Purposes a staff/partner scanner may pick (public is reserved for the anonymous page). */
    public static function selectable(): array
    {
        return array_values(array_filter(self::cases(), fn (self $p) => $p !== self::Public));
    }
}
