<?php

namespace App\Modules\Integrations\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum WebhookEventStatus: string implements HasLabel
{
    use EnumOptions;

    case Received = 'received';
    case Processing = 'processing';
    case Processed = 'processed';
    case Failed = 'failed';
    /** Signature invalid or provider unknown: stored for forensics, never processed. */
    case Ignored = 'ignored';

    public function label(): string
    {
        return __('integrations.webhooks.status.'.$this->value);
    }

    public function canRetry(): bool
    {
        return $this === self::Failed;
    }
}
