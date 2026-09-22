<?php

namespace App\Modules\Imports\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ImportStatus: string implements HasLabel
{
    use EnumOptions;

    case Uploaded = 'uploaded';
    case Parsed = 'parsed';
    case Validating = 'validating';
    case Validated = 'validated';
    case Processing = 'processing';
    case Completed = 'completed';
    case Failed = 'failed';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return __('imports.status.'.$this->value);
    }

    public function tone(): string
    {
        return match ($this) {
            self::Completed => 'success',
            self::Validated => 'info',
            self::Uploaded, self::Parsed => 'muted',
            self::Validating, self::Processing => 'warning',
            self::Failed, self::Cancelled => 'danger',
        };
    }

    /** A background job is working on the import (the UI polls). */
    public function isBusy(): bool
    {
        return $this === self::Validating || $this === self::Processing;
    }

    public function isTerminal(): bool
    {
        return in_array($this, [self::Completed, self::Failed, self::Cancelled], true);
    }

    public function canCancel(): bool
    {
        return in_array($this, [self::Uploaded, self::Parsed, self::Validating, self::Validated], true);
    }
}
