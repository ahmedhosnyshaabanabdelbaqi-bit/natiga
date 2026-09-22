<?php

namespace App\Modules\Reports\Operations\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum IncidentStatus: string implements HasLabel
{
    use EnumOptions;

    case Open = 'open';
    case Investigating = 'investigating';
    case Mitigated = 'mitigated';
    case Resolved = 'resolved';
    case Closed = 'closed';

    public function label(): string
    {
        return __('operations.incident_status.'.$this->value);
    }

    /** @return self[] */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Open => [self::Investigating, self::Mitigated, self::Resolved],
            self::Investigating => [self::Mitigated, self::Resolved, self::Open],
            self::Mitigated => [self::Resolved, self::Investigating],
            self::Resolved => [self::Closed, self::Investigating],
            self::Closed => [self::Investigating],
        };
    }

    public function canTransitionTo(self $to): bool
    {
        return in_array($to, $this->allowedTransitions(), true);
    }

    public function isActive(): bool
    {
        return ! in_array($this, [self::Resolved, self::Closed], true);
    }
}
