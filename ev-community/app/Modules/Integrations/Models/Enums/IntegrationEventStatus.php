<?php

namespace App\Modules\Integrations\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum IntegrationEventStatus: string implements HasLabel
{
    use EnumOptions;

    case Success = 'success';
    case Failed = 'failed';
    case Timeout = 'timeout';

    public function label(): string
    {
        return __('integrations.events.status.'.$this->value);
    }
}
