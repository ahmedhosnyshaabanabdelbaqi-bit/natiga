<?php

namespace App\Modules\Members\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum DeletionRequestStatus: string implements HasLabel
{
    use EnumOptions;

    case Requested = 'requested';
    case UnderReview = 'under_review';
    case Completed = 'completed';
    case Rejected = 'rejected';

    public function label(): string
    {
        return __('privacy.deletion.status.'.$this->value);
    }

    public function isOpen(): bool
    {
        return in_array($this, [self::Requested, self::UnderReview], true);
    }
}
