<?php

namespace Tests;

use App\Models\User;
use App\Modules\Members\Models\Membership;
use App\Modules\Rbac\Services\RbacSync;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Fortify\Features;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

abstract class TestCase extends BaseTestCase
{
    protected static bool $rbacSynced = false;

    protected function setUp(): void
    {
        parent::setUp();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    /** Ensure roles/permissions exist (idempotent, cheap after first call per test DB). */
    protected function syncRbac(): void
    {
        app(RbacSync::class)->sync();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    /** A user with an active membership, acting as the current user. */
    protected function actingAsMember(array $userAttributes = [], array $membershipAttributes = []): User
    {
        $this->syncRbac();
        $user = User::factory()->create($userAttributes);
        $user->assignRole('member');
        Membership::factory()->create(['user_id' => $user->id] + $membershipAttributes);
        $user->load('membership');
        $this->actingAs($user);

        return $user;
    }

    /** Create (without logging in) a member user. */
    protected function makeMember(array $userAttributes = [], array $membershipAttributes = []): User
    {
        $this->syncRbac();
        $user = User::factory()->create($userAttributes);
        $user->assignRole('member');
        Membership::factory()->create(['user_id' => $user->id] + $membershipAttributes);

        return $user->load('membership');
    }

    /** A staff user holding exactly the given permissions (plus admin.access). */
    protected function actingAsStaff(array $permissions = [], array $userAttributes = []): User
    {
        $user = $this->makeStaff($permissions, $userAttributes);
        $this->actingAs($user);

        return $user;
    }

    protected function makeStaff(array $permissions = [], array $userAttributes = []): User
    {
        $this->syncRbac();
        $user = User::factory()->withTwoFactor()->create($userAttributes);
        foreach (array_unique(array_merge(['admin.access'], $permissions)) as $permission) {
            Permission::findOrCreate($permission, 'web');
        }
        $user->givePermissionTo(array_unique(array_merge(['admin.access'], $permissions)));
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return $user;
    }

    /** A user with a default role (e.g. 'accountant', 'owner'). */
    protected function actingAsRole(string $role, array $userAttributes = []): User
    {
        $this->syncRbac();
        $user = User::factory()->withTwoFactor()->create($userAttributes);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    protected function skipUnlessFortifyHas(string $feature, ?string $message = null): void
    {
        if (! Features::enabled($feature)) {
            $this->markTestSkipped($message ?? "Fortify feature [{$feature}] is not enabled.");
        }
    }
}
