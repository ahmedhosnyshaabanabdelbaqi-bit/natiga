<?php

namespace App\Modules\Reports\Operations\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ExceptionSeverity: string implements HasLabel
{
    use EnumOptions;

    case P0 = 'p0';
    case P1 = 'p1';
    case P2 = 'p2';
    case P3 = 'p3';

    public function label(): string
    {
        return __('operations.severity.'.$this->value);
    }

    /** Lower rank = more severe. */
    public function rank(): int
    {
        return (int) substr($this->value, 1);
    }

    public function isMoreSevereThan(self $other): bool
    {
        return $this->rank() < $other->rank();
    }

    public function tone(): string
    {
        return match ($this) {
            self::P0 => 'danger',
            self::P1 => 'warning',
            self::P2 => 'info',
            self::P3 => 'muted',
        };
    }
}
