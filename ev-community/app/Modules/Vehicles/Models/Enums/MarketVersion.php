<?php

namespace App\Modules\Vehicles\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum MarketVersion: string implements HasLabel
{
    use EnumOptions;

    case China = 'china';
    case Europe = 'europe';
    case Gulf = 'gulf';
    case Egypt = 'egypt';
    case Other = 'other';
    case Unknown = 'unknown';

    public function label(): string
    {
        return __('vehicles.market_version.'.$this->value);
    }
}
