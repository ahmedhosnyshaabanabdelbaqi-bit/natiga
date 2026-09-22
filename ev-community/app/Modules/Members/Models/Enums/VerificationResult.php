<?php

namespace App\Modules\Members\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum VerificationResult: string implements HasLabel
{
    use EnumOptions;

    case Valid = 'valid';
    case Invalid = 'invalid';
    case Expired = 'expired';
    case NotActive = 'not_active';

    public function label(): string
    {
        return __('members.verification.result.'.$this->value);
    }
}
