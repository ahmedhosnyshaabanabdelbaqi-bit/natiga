<?php

namespace App\Modules\Reports\Operations\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ExceptionStatus: string implements HasLabel
{
    use EnumOptions;

    case Open = 'open';
    case Assigned = 'assigned';
    case Resolved = 'resolved';
    case Ignored = 'ignored';

    public const LIVE = ['open', 'assigned'];

    public function label(): string
    {
        return __('operations.exception_status.'.$this->value);
    }

    public function isLive(): bool
    {
        return in_array($this->value, self::LIVE, true);
    }
}
