<?php

namespace App\Modules\Vehicles\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum VehicleStatus: string implements HasLabel
{
    use EnumOptions;

    case Active = 'active';
    case Sold = 'sold';
    case Archived = 'archived';

    public function label(): string
    {
        return __('vehicles.status.'.$this->value);
    }

    public function color(): string
    {
        return match ($this) {
            self::Active => 'success',
            self::Sold => 'warning',
            self::Archived => 'muted',
        };
    }
}
