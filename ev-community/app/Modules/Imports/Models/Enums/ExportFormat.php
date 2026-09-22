<?php

namespace App\Modules\Imports\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ExportFormat: string implements HasLabel
{
    use EnumOptions;

    case Csv = 'csv';
    case Xlsx = 'xlsx';

    public function label(): string
    {
        return __('imports.format.'.$this->value);
    }

    public function extension(): string
    {
        return $this->value;
    }

    public function mime(): string
    {
        return match ($this) {
            self::Csv => 'text/csv',
            self::Xlsx => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
    }
}
