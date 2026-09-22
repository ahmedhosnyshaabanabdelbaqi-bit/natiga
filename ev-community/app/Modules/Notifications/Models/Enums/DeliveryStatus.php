<?php

namespace App\Modules\Notifications\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum DeliveryStatus: string implements HasLabel
{
    use EnumOptions;

    case Queued = 'queued';
    case Sent = 'sent';
    case Delivered = 'delivered';
    case Failed = 'failed';
    case Skipped = 'skipped';
    case Read = 'read';

    public function label(): string
    {
        return __('notifications.delivery_status.'.$this->value);
    }
}
