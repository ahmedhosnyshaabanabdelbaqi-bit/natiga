<?php

namespace App\Modules\Integrations\Contracts\Data;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum SendStatus: string implements HasLabel
{
    use EnumOptions;

    case Sent = 'sent';
    case Queued = 'queued';
    /** Written to the application log only (development log drivers). Never a real delivery. */
    case Logged = 'logged';
    case Failed = 'failed';

    public function label(): string
    {
        return __('integrations.send_status.'.$this->value);
    }

    public function isDelivered(): bool
    {
        return $this === self::Sent || $this === self::Queued;
    }
}
