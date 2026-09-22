<?php

namespace Tests\Feature\System;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Server-side role/permission rules: nobody escalates, nobody edits themselves, only super users manage super users.
 */
class UserAccessTest extends TestCase
{
    use RefreshDatabase;

    private function staffWithRole(string $role): User
    {
        $this->syncRbac();
        $user = User::factory()->withTwoFactor()->create();
        $user->assignRole($role);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return $user;
    }

    private function blockedEvents(User $actor): int
    {
        return SecurityEvent::query()->where('user_id', $actor->id)->where('event_type', 'permission_escalation_blocked')->where('severity', 'critical')->count();
    }

    public function test_support_agent_cannot_change_roles(): void
    {
        $agent = $this->actingAsRole('support-agent');
        $target = $this->staffWithRole('delivery-officer');

        $this->put("/admin/users/{$target->public_id}/access", ['roles' => ['operations-manager'], 'permissions' => [], 'reason' => 'Promote to manager'])->assertForbidden();

        $this->assertSame(['delivery-officer'], $target->fresh()->getRoleNames()->all());
        $this->assertSame(1, $this->blockedEvents($agent), 'the blocked attempt is recorded as a critical security event');
        $this->assertFalse(AuditLog::query()->where('action', 'users.roles_changed')->exists());
    }

    public function test_accountant_cannot_grant_themselves_super_admin(): void
    {
        $accountant = $this->actingAsRole('accountant');

        $this->put("/admin/users/{$accountant->public_id}/access", ['roles' => ['accountant', 'super-admin'], 'permissions' => [], 'reason' => 'I need more access'])->assertForbidden();

        $this->assertFalse($accountant->fresh()->hasRole('super-admin'));
        $event = SecurityEvent::query()->where('user_id', $accountant->id)->where('event_type', 'permission_escalation_blocked')->firstOrFail();
        $this->assertSame('critical', $event->severity);
        $this->assertTrue($event->meta['self']);
        $this->assertContains('super-admin', $event->meta['roles']);
    }

    public function test_operations_manager_with_roles_manage_cannot_grant_a_permission_they_lack(): void
    {
        $manager = $this->staffWithRole('operations-manager');
        $manager->givePermissionTo('roles.manage');
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->actingAs($manager);
        $this->assertFalse($manager->can('settings.manage'));
        $target = $this->staffWithRole('support-agent');

        $this->put("/admin/users/{$target->public_id}/access", ['roles' => ['support-agent'], 'permissions' => ['settings.manage'], 'reason' => 'Let them edit settings'])->assertForbidden();
        $this->assertFalse($target->fresh()->hasDirectPermission('settings.manage'));
        $this->assertSame(1, $this->blockedEvents($manager));

        // Granting a role whose permissions the manager does not hold is blocked as well.
        $this->put("/admin/users/{$target->public_id}/access", ['roles' => ['support-agent', 'accountant'], 'permissions' => [], 'reason' => 'Make them an accountant'])->assertForbidden();
        $this->assertFalse($target->fresh()->hasRole('accountant'));

        // A permission the manager holds can be granted.
        $this->put("/admin/users/{$target->public_id}/access", ['roles' => ['support-agent'], 'permissions' => ['audit.view'], 'reason' => 'Needs the audit trail'])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertTrue($target->fresh()->hasDirectPermission('audit.view'));
    }

    public function test_non_super_actor_cannot_touch_super_roles_or_super_accounts(): void
    {
        $manager = $this->staffWithRole('operations-manager');
        $manager->givePermissionTo(['roles.manage', 'users.manage']);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->actingAs($manager);
        $owner = $this->staffWithRole('owner');
        $staff = $this->staffWithRole('support-agent');

        $this->put("/admin/users/{$staff->public_id}/access", ['roles' => ['super-admin'], 'permissions' => [], 'reason' => 'Promote to super admin'])->assertForbidden();
        $this->put("/admin/users/{$owner->public_id}/access", ['roles' => [], 'permissions' => [], 'reason' => 'Remove the owner'])->assertForbidden();
        $this->post("/admin/users/{$owner->public_id}/disable", ['reason' => 'Lock the owner out'])->assertForbidden();

        $this->assertTrue($owner->fresh()->hasRole('owner'));
        $this->assertTrue($owner->fresh()->isActive());
        $this->assertFalse($staff->fresh()->hasRole('super-admin'));
    }

    public function test_owner_can_grant_super_admin_and_everything_is_recorded(): void
    {
        $owner = $this->actingAsRole('owner');
        $target = $this->staffWithRole('support-agent');

        $this->put("/admin/users/{$target->public_id}/access", ['roles' => ['super-admin'], 'permissions' => ['audit.view'], 'reason' => 'New CTO joins the team'])
            ->assertRedirect()->assertSessionHasNoErrors();

        $target = $target->fresh();
        $this->assertSame(['super-admin'], $target->getRoleNames()->all());
        $this->assertTrue($target->hasDirectPermission('audit.view'));

        $log = AuditLog::query()->where('action', 'users.roles_changed')->firstOrFail();
        $this->assertSame($owner->id, $log->actor_id);
        $this->assertSame($target->id, $log->entity_id);
        $this->assertSame(['support-agent'], $log->old_values['roles']);
        $this->assertSame(['super-admin'], $log->new_values['roles']);
        $this->assertSame('New CTO joins the team', $log->reason);

        $types = SecurityEvent::query()->where('user_id', $target->id)->pluck('event_type')->all();
        $this->assertContains('role_changed', $types);
        $this->assertContains('permission_escalation', $types);
        $this->assertContains('permissions_changed', $types);
    }

    public function test_nobody_edits_their_own_roles_not_even_the_owner(): void
    {
        $owner = $this->actingAsRole('owner');
        $this->staffWithRole('owner'); // a second owner so "last owner" is not what blocks it

        $this->put("/admin/users/{$owner->public_id}/access", ['roles' => ['owner', 'accountant'], 'permissions' => [], 'reason' => 'Add accountant to myself'])->assertForbidden();
        $this->assertFalse($owner->fresh()->hasRole('accountant'));
        $this->assertTrue(SecurityEvent::query()->where('user_id', $owner->id)->where('event_type', 'self_privilege_change_blocked')->exists());
    }

    public function test_the_last_active_owner_keeps_the_owner_role(): void
    {
        $this->actingAsRole('super-admin');
        $owner = $this->staffWithRole('owner');

        $this->put("/admin/users/{$owner->public_id}/access", ['roles' => ['accountant'], 'permissions' => [], 'reason' => 'Demote the only owner'])->assertForbidden();
        $this->assertTrue($owner->fresh()->hasRole('owner'));
    }

    public function test_access_change_requires_a_reason_and_known_roles(): void
    {
        $this->actingAsRole('owner');
        $target = $this->staffWithRole('support-agent');

        $this->put("/admin/users/{$target->public_id}/access", ['roles' => ['accountant'], 'permissions' => []])->assertSessionHasErrors('reason');
        $this->put("/admin/users/{$target->public_id}/access", ['roles' => ['wizard'], 'permissions' => [], 'reason' => 'Unknown role test'])->assertSessionHasErrors('roles');
        $this->put("/admin/users/{$target->public_id}/access", ['roles' => ['member'], 'permissions' => [], 'reason' => 'Member role test'])->assertSessionHasErrors('roles');
        $this->put("/admin/users/{$target->public_id}/access", ['roles' => [], 'permissions' => ['nope.permission'], 'reason' => 'Unknown permission test'])->assertSessionHasErrors('permissions');
        $this->assertSame(['support-agent'], $target->fresh()->getRoleNames()->all());
    }

    public function test_the_member_role_is_preserved_when_a_member_is_promoted_to_staff(): void
    {
        $this->actingAsRole('owner');
        $member = $this->makeMember();

        $this->put("/admin/users/{$member->public_id}/access", ['roles' => ['support-agent'], 'permissions' => [], 'reason' => 'Community volunteer joins support'])->assertRedirect()->assertSessionHasNoErrors();

        $roles = $member->fresh()->getRoleNames()->sort()->values()->all();
        $this->assertSame(['member', 'support-agent'], $roles);
    }
}
