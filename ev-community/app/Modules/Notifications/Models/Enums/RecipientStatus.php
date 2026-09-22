<?php

namespace App\Modules\Notifications\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum RecipientStatus: string implements HasLabel
{
    use EnumOptions;

    case Pending = 'pending';
    case Sent = 'sent';
    case Skipped = 'skipped';
    case Failed = 'failed';

    public function label(): string
    {
        return __('notifications.recipient_status.'.$this->value);
    }
}
