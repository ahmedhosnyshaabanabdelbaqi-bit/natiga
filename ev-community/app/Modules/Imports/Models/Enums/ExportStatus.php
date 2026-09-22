<?php

namespace App\Modules\Imports\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ExportStatus: string implements HasLabel
{
    use EnumOptions;

    case Queued = 'queued';
    case Processing = 'processing';
    case Completed = 'completed';
    case Failed = 'failed';
    case Expired = 'expired';

    public function label(): string
    {
        return __('imports.export_status.'.$this->value);
    }

    public function tone(): string
    {
        return match ($this) {
            self::Completed => 'success',
            self::Queued, self::Processing => 'warning',
            self::Failed => 'danger',
            self::Expired => 'muted',
        };
    }

    public function isBusy(): bool
    {
        return $this === self::Queued || $this === self::Processing;
    }
}
