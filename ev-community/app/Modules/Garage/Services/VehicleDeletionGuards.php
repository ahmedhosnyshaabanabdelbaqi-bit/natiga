<?php

namespace App\Modules\Garage\Services;

use App\Modules\Vehicles\Models\MemberVehicle;
use Closure;

/**
 * Registry of "can this member vehicle be deleted?" guards. Modules that link records to a vehicle
 * (orders, bookings, warranties, part requests...) register a guard in their ServiceProvider `boot()`:
 *
 *   VehicleDeletionGuards::register(fn (MemberVehicle $v): ?string =>
 *       OrderItem::where('member_vehicle_id', $v->id)->exists() ? __('orders.garage.vehicle_has_orders') : null);
 *
 *   // or with an explicit key (re-registering the same key replaces the guard):
 *   VehicleDeletionGuards::register('orders', fn (MemberVehicle $v): ?string => ...);
 *
 * A guard returns a translated reason string when deletion must be blocked, or null to allow it.
 * `MemberVehicle::canBeDeleted()` / `deletionBlockedReason()` consult this registry, and
 * `DeleteMemberVehicle` re-checks it inside the delete transaction (row locked).
 */
final class VehicleDeletionGuards
{
    /** @var array<string, Closure(MemberVehicle): ?string> */
    private static array $guards = [];

    /**
     * @param  string|Closure(MemberVehicle): ?string  $keyOrGuard
     * @param  (Closure(MemberVehicle): ?string)|null  $guard
     */
    public static function register(string|Closure $keyOrGuard, ?Closure $guard = null): string
    {
        if ($keyOrGuard instanceof Closure) {
            $guard = $keyOrGuard;
            $key = 'guard_'.(count(self::$guards) + 1).'_'.spl_object_id($guard);
        } else {
            if ($guard === null) {
                throw new \InvalidArgumentException("A guard closure is required for key [{$keyOrGuard}].");
            }
            $key = $keyOrGuard;
        }
        self::$guards[$key] = $guard;

        return $key;
    }

    public static function forget(string $key): void
    {
        unset(self::$guards[$key]);
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
