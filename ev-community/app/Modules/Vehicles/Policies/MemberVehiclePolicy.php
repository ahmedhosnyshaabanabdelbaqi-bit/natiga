<?php

namespace App\Modules\Vehicles\Policies;

use App\Models\User;
use App\Modules\Vehicles\Models\MemberVehicle;

/**
 * Member vehicles are private to their owner. Staff holding `vehicles.view` may READ them from the
 * admin panel (never the VIN); staff holding `vehicles.edit_member_vehicle` may correct their data.
 */
class MemberVehiclePolicy
{
    /** Members list their own garage; staff with vehicles.view browse member vehicles. */
    public function viewAny(User $user): bool
    {
        return $user->membership !== null || $user->can('vehicles.view');
    }

    /** Read access (admin detail page, files): the owner or staff with vehicles.view. */
    public function view(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user) || $user->can('vehicles.view');
    }

    /** The member garage (/account/garage/{vehicle}) is owner-only, even for staff who are also members. */
    public function viewOwn(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user);
    }

    public function create(User $user): bool
    {
        return $user->membership?->isActive() ?? false;
    }

    /** Only the owner edits a vehicle from the garage (staff corrections use adminUpdate). */
    public function update(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user);
    }

    public function delete(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user);
    }

    /** The decrypted VIN is only ever shown to the owner (audited). */
    public function revealVin(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user);
    }

    /** Staff correction of a member vehicle (classification, status, clearing a disputed VIN). */
    public function adminUpdate(User $user, MemberVehicle $vehicle): bool
    {
        return $user->can('vehicles.view') && $user->can('vehicles.edit_member_vehicle');
    }
}
