<?php

namespace App\Modules\Reports\Operations\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ExceptionCategory: string implements HasLabel
{
    use EnumOptions;

    case Finance = 'finance';
    case Inventory = 'inventory';
    case Orders = 'orders';
    case Shipping = 'shipping';
    case Maintenance = 'maintenance';
    case Integrations = 'integrations';
    case Notifications = 'notifications';
    case Security = 'security';
    case DataQuality = 'data_quality';

    public function label(): string
    {
        return __('operations.categories.'.$this->value);
    }
}
