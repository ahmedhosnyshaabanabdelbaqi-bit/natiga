<?php

namespace App\Modules\Referrals\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ReferralStatus: string implements HasLabel
{
    use EnumOptions;

    case Invited = 'invited';
    case Registered = 'registered';
    case Approved = 'approved';

    public function label(): string
    {
        return __('referrals.status.'.$this->value);
    }
}
