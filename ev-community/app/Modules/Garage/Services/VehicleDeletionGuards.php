<?php

namespace App\Modules\Garage\Services;

use App\Modules\Vehicles\Models\MemberVehicle;
use Closure;

/**
 * Registry of "can this member vehicle be deleted?" guards. Modules that link records to a vehicle
 * (orders, bookings, warranties, part requests...) register a guard in their ServiceProvider `boot()`:
 *
 *   VehicleDeletionGuards::register('orders', fn (MemberVehicle $v): ?string =>
 *       OrderItem::where('member_vehicle_id', $v->id)->exists() ? __('orders.vehicle_has_orders') : null);
 *
 * A guard returns a translated reason string when deletion must be blocked, or null to allow it.
 * `MemberVehicle::canBeDeleted()` / `deletionBlockedReason()` consult this registry.
 */
final class VehicleDeletionGuards
{
    /** @var array<string, Closure(MemberVehicle): ?string> */
    private static array $guards = [];

    /** @param  Closure(MemberVehicle): ?string  $guard */
    public static function register(string $key, Closure $guard): void
    {
        self::$guards[$key] = $guard;
    }

    /** First blocking reason, or null when every guard allows deletion. */
    public static function blockingReason(MemberVehicle $vehicle): ?string
    {
        foreach (self::$guards as $guard) {
            $reason = $guard($vehicle);
            if (is_string($reason) && $reason !== '') {
                return $reason;
            }
        }

        return null;
    }

    /** @return string[] */
    public static function keys(): array
    {
        return array_keys(self::$guards);
    }

    public static function reset(): void
    {
        self::$guards = [];
    }
}
