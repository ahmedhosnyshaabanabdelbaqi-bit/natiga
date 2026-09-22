<?php

namespace App\Modules\Integrations\Contracts\Data;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

/** Normalised charging station / connector availability. */
enum StationStatus: string implements HasLabel
{
    use EnumOptions;

    case Available = 'available';
    case Occupied = 'occupied';
    case OutOfService = 'out_of_service';
    case Unknown = 'unknown';

    public function label(): string
    {
        return __('integrations.station_status.'.$this->value);
    }

    /** Map common vendor/OCPI/OCPP status words onto the internal vocabulary. */
    public static function normalize(?string $vendorStatus): self
    {
        $value = strtolower(trim((string) $vendorStatus));

        return match (true) {
            $value === '' => self::Unknown,
            in_array($value, ['available', 'free', 'idle', 'online', 'ready', 'operative', 'working'], true) => self::Available,
            in_array($value, ['occupied', 'charging', 'busy', 'in_use', 'inuse', 'reserved', 'preparing', 'finishing', 'suspendedev', 'suspendedevse'], true) => self::Occupied,
            in_array($value, ['out_of_service', 'outoforder', 'out_of_order', 'faulted', 'fault', 'unavailable', 'inoperative', 'offline', 'blocked', 'removed', 'planned', 'maintenance'], true) => self::OutOfService,
            default => self::Unknown,
        };
    }
}
