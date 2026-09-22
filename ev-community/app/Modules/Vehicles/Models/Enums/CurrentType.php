<?php

namespace App\Modules\Vehicles\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum CurrentType: string implements HasLabel
{
    use EnumOptions;

    case Ac = 'ac';
    case Dc = 'dc';

    public function label(): string
    {
        return __('vehicles.current_type.'.$this->value);
    }
}
