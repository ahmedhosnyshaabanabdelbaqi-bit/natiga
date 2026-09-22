<?php

namespace App\Modules\Vehicles\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum Compatibility: string implements HasLabel
{
    use EnumOptions;

    case Direct = 'direct';
    case Adapter = 'adapter';
    case Incompatible = 'incompatible';

    public function label(): string
    {
        return __('vehicles.compatibility.'.$this->value);
    }

    public function color(): string
    {
        return match ($this) {
            self::Direct => 'success',
            self::Adapter => 'warning',
            self::Incompatible => 'danger',
        };
    }
}
