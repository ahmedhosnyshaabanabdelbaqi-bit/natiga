<?php

namespace App\Modules\Integrations\Contracts\Data;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

/** Normalised gateway transaction state. Vendor drivers map their own codes to these. */
enum TransactionState: string implements HasLabel
{
    use EnumOptions;

    case Pending = 'pending';
    case Paid = 'paid';
    case Failed = 'failed';
    case Cancelled = 'cancelled';
    case Refunded = 'refunded';
    case Unknown = 'unknown';

    public function label(): string
    {
        return __('integrations.transaction_state.'.$this->value);
    }
}
