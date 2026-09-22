<?php

namespace App\Modules\Vehicles\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum OdometerSource: string implements HasLabel
{
    use EnumOptions;

    case Manual = 'manual';
    case ServiceRecord = 'service_record';
    case Import = 'import';

    public function label(): string
    {
        return __('vehicles.odometer_source.'.$this->value);
    }
}
