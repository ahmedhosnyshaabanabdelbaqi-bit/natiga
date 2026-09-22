<?php

namespace App\Modules\Notifications\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum CampaignStatus: string implements HasLabel
{
    use EnumOptions;

    case Draft = 'draft';
    case Scheduled = 'scheduled';
    case Sending = 'sending';
    case Sent = 'sent';
    case Cancelled = 'cancelled';
    case Failed = 'failed';

    public function label(): string
    {
        return __('notifications.campaign_status.'.$this->value);
    }

    public function isEditable(): bool
    {
        return $this === self::Draft || $this === self::Scheduled;
    }

    public function isCancellable(): bool
    {
        return $this === self::Scheduled || $this === self::Draft;
    }

    public function color(): string
    {
        return match ($this) {
            self::Sent => 'success',
            self::Scheduled, self::Sending => 'warning',
            self::Cancelled, self::Failed => 'danger',
            self::Draft => 'muted',
        };
    }
}
