<?php

namespace App\Modules\Vehicles\Policies;

use App\Models\User;
use App\Modules\Vehicles\Models\MemberVehicle;

class MemberVehiclePolicy
{
    /** Members list their own garage; staff with vehicles.view browse member vehicles. */
    public function viewAny(User $user): bool
    {
        return $user->membership !== null || $user->can('vehicles.view');
    }

    public function view(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user) || $user->can('vehicles.view');
    }

    public function create(User $user): bool
    {
        return $user->membership?->isActive() ?? false;
    }

    /** Only the owner edits a vehicle (staff editing is a separate ability). */
    public function update(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user);
    }

    public function delete(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user);
    }

    public function revealVin(User $user, MemberVehicle $vehicle): bool
    {
        return $vehicle->isOwnedBy($user);
    }

    /** Staff edit (operations) — reserved for the admin edit flow. */
    public function adminUpdate(User $user, MemberVehicle $vehicle): bool
    {
        return $user->can('vehicles.edit_member_vehicle');
    }
}
