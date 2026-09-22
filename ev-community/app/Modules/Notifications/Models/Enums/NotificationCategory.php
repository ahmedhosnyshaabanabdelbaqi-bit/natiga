<?php

namespace App\Modules\Notifications\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum NotificationCategory: string implements HasLabel
{
    use EnumOptions;

    case Orders = 'orders';
    case Payments = 'payments';
    case Shipping = 'shipping';
    case Pickup = 'pickup';
    case Maintenance = 'maintenance';
    case Warranty = 'warranty';
    case Charging = 'charging';
    case Offers = 'offers';
    case Support = 'support';
    case System = 'system';

    /** Pseudo-category used by preferences for every non-transactional (marketing) notification. */
    public const MARKETING = 'marketing';

    public function label(): string
    {
        return __('notifications.categories.'.$this->value);
    }
}
