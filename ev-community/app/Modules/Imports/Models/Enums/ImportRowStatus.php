<?php

namespace App\Modules\Imports\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ImportRowStatus: string implements HasLabel
{
    use EnumOptions;

    case Pending = 'pending';
    case Valid = 'valid';
    case Invalid = 'invalid';
    case Duplicate = 'duplicate';
    case Imported = 'imported';
    case Skipped = 'skipped';
    case Failed = 'failed';

    public function label(): string
    {
        return __('imports.row_status.'.$this->value);
    }

    public function tone(): string
    {
        return match ($this) {
            self::Imported, self::Valid => 'success',
            self::Pending, self::Skipped => 'muted',
            self::Duplicate => 'warning',
            self::Invalid, self::Failed => 'danger',
        };
    }

    /** Statuses that end up in the error report. */
    public static function reported(): array
    {
        return [self::Invalid, self::Duplicate, self::Skipped, self::Failed];
    }
}
