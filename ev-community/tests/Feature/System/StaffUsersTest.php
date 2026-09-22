<?php

namespace Tests\Feature\System;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\System\Services\SessionKeys;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\PermissionRegistrar;
use Tests\Feature\System\Concerns\InteractsWithSessions;
use Tests\TestCase;

class StaffUsersTest extends TestCase
{
    use InteractsWithSessions;
    use RefreshDatabase;

    private function staffWithRole(string $role, array $attributes = []): User
    {
        $this->syncRbac();
        $user = User::factory()->withTwoFactor()->create($attributes);
        $user->assignRole($role);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return $user;
    }

    public function test_index_lists_only_staff_and_partner_accounts_with_filters(): void
    {
        $this->actingAsStaff(['users.view']);
        $agent = $this->staffWithRole('support-agent', ['name' => 'Salma Support']);
        $this->staffWithRole('accountant', ['name' => 'Adel Accountant']);
        $partner = $this->staffWithRole('service-center-admin', ['name' => 'Center Admin']);
        $member = $this->makeMember(['name' => 'Plain Member']);

        $this->get('/admin/users')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/users/index')
            ->where('can.create', false)
            ->where('users.data', fn ($rows) => collect($rows)->pluck('id')->contains($agent->public_id)
                && collect($rows)->pluck('id')->contains($partner->public_id)
                && ! collect($rows)->pluck('id')->contains($member->public_id)));

        $this->get('/admin/users?role=support-agent')->assertInertia(fn (Assert $page) => $page->has('users.data', 1)->where('users.data.0.id', $agent->public_id));
        $this->get('/admin/users?q=Adel')->assertInertia(fn (Assert $page) => $page->has('users.data', 1)->where('users.data.0.name', 'Adel Accountant'));
        $this->get('/admin/users?sort=name&direction=asc&per_page=15')->assertOk()->assertInertia(fn (Assert $page) => $page->where('users.per_page', 15));
    }

    public function test_users_view_cannot_open_a_plain_member_account_by_public_id(): void
    {
        $this->actingAsStaff(['users.view']);
        $member = $this->makeMember();

        $this->get("/admin/users/{$member->public_id}")->assertForbidden();

        $this->actingAsStaff(['users.view', 'roles.manage']);
        $this->get("/admin/users/{$member->public_id}")->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/users/show')->where('user.is_staff_account', false));
    }

    public function test_staff_without_users_permissions_get_403(): void
    {
        $this->actingAsRole('support-agent');
        $this->get('/admin/users')->assertForbidden();
        $this->get('/admin/users/create')->assertForbidden();
        $this->post('/admin/users', ['name' => 'X', 'email' => 'x@example.com', 'roles' => ['support-agent']])->assertForbidden();
    }

    public function test_owner_creates_a_staff_user_who_receives_a_password_setup_link(): void
    {
        Notification::fake();
        $owner = $this->actingAsRole('owner');

        $this->get('/admin/users/create')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/users/create')->has('roles')->has('permissionGroups'));

        $response = $this->post('/admin/users', [
            'name' => 'Mona Warehouse', 'email' => 'Mona.Warehouse@Example.com', 'mobile' => '01012345678', 'preferred_locale' => 'en',
            'roles' => ['warehouse-officer'], 'permissions' => ['audit.view'],
        ]);

        $user = User::query()->where('email', 'mona.warehouse@example.com')->firstOrFail();
        $response->assertRedirect("/admin/users/{$user->public_id}")->assertSessionHas('success');
        $this->assertTrue($user->hasRole('warehouse-officer'));
        $this->assertTrue($user->hasDirectPermission('audit.view'));
        $this->assertSame('en', $user->preferred_locale);
        Notification::assertSentTo($user, ResetPassword::class);

        $log = AuditLog::query()->where('action', 'users.created')->firstOrFail();
        $this->assertSame($owner->id, $log->actor_id);
        $this->assertSame(['warehouse-officer'], $log->new_values['roles']);
    }

    public function test_create_validates_access_and_super_roles(): void
    {
        $this->actingAsRole('owner');

        $this->post('/admin/users', ['name' => 'No Access', 'email' => 'none@example.com', 'roles' => [], 'permissions' => []])->assertSessionHasErrors('roles');
        $this->post('/admin/users', ['name' => 'Member Role', 'email' => 'member@example.com', 'roles' => ['member']])->assertSessionHasErrors('roles');
        $this->assertFalse(User::query()->whereIn('email', ['none@example.com', 'member@example.com'])->exists());

        $manager = $this->staffWithRole('operations-manager');
        $manager->givePermissionTo(['users.manage', 'roles.manage']);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->actingAs($manager);
        $this->post('/admin/users', ['name' => 'Sneaky Admin', 'email' => 'sneaky@example.com', 'roles' => ['super-admin']])->assertForbidden();
        $this->assertFalse(User::query()->where('email', 'sneaky@example.com')->exists());
        $this->assertTrue(SecurityEvent::query()->where('user_id', $manager->id)->where('event_type', 'permission_escalation_blocked')->exists());
    }

    public function test_users_manage_without_roles_manage_cannot_create_staff(): void
    {
        $actor = $this->actingAsStaff(['users.view', 'users.manage']);

        $this->get('/admin/users/create')->assertForbidden();
        $this->post('/admin/users', ['name' => 'Someone', 'email' => 'someone@example.com', 'roles' => ['support-agent']])->assertForbidden();
        $this->assertTrue(SecurityEvent::query()->where('user_id', $actor->id)->where('event_type', 'permission_escalation_blocked')->exists());
    }

    public function test_disabling_a_user_deletes_their_sessions_and_tokens_and_is_recorded(): void
    {
        $this->useDatabaseSessions();
        $actor = $this->actingAsStaff(['users.view', 'users.manage']);
        $target = $this->staffWithRole('support-agent');
        $this->makeSession($target);
        $this->makeSession($target);
        $other = $this->staffWithRole('accountant');
        $this->makeSession($other);
        $target->createToken('mobile');
        $rememberToken = $target->fresh()->getRememberToken();

        $this->post("/admin/users/{$target->public_id}/disable", ['reason' => 'x'])->assertSessionHasErrors('reason');
        $this->post("/admin/users/{$target->public_id}/disable", ['reason' => 'Left the company'])->assertRedirect()->assertSessionHasNoErrors();

        $target = $target->fresh();
        $this->assertSame(User::STATUS_DISABLED, $target->status);
        $this->assertSame($actor->id, $target->disabled_by);
        $this->assertSame(0, $this->sessionCount($target));
        $this->assertSame(1, $this->sessionCount($other), 'other users keep their sessions');
        $this->assertSame(0, $target->tokens()->count());
        $this->assertNotSame($rememberToken, $target->getRememberToken());

        $log = AuditLog::query()->where('action', 'users.disabled')->firstOrFail();
        $this->assertSame('Left the company', $log->reason);
        $this->assertSame(2, $log->new_values['sessions_revoked']);
        $event = SecurityEvent::query()->where('user_id', $target->id)->where('event_type', 'account_disabled')->firstOrFail();
        $this->assertSame('critical', $event->severity);
    }

    public function test_nobody_disables_themselves_and_the_last_owner_stays_active(): void
    {
        $owner = $this->actingAsRole('owner');
        $this->post("/admin/users/{$owner->public_id}/disable", ['reason' => 'Disable myself'])->assertForbidden();

        $superAdmin = $this->staffWithRole('super-admin');
        $this->actingAs($superAdmin);
        $this->post("/admin/users/{$owner->public_id}/disable", ['reason' => 'Disable the only owner'])->assertForbidden();
        $this->assertTrue($owner->fresh()->isActive());
    }

    public function test_reactivate_requires_a_reason(): void
    {
        $this->actingAsStaff(['users.view', 'users.manage']);
        $target = $this->staffWithRole('support-agent');
        $target->forceFill(['status' => User::STATUS_DISABLED, 'disabled_at' => now()])->save();

        $this->post("/admin/users/{$target->public_id}/reactivate")->assertSessionHasErrors('reason');
        $this->post("/admin/users/{$target->public_id}/reactivate", ['reason' => 'Returned from leave'])->assertRedirect()->assertSessionHasNoErrors();

        $this->assertTrue($target->fresh()->isActive());
        $this->assertTrue(AuditLog::query()->where('action', 'users.reactivated')->where('reason', 'Returned from leave')->exists());
    }

    public function test_reset_access_revokes_sessions_sends_a_link_and_optionally_resets_mfa_with_reason(): void
    {
        Notification::fake();
        $this->useDatabaseSessions();
        $this->actingAsStaff(['users.view', 'users.manage']);
        $target = $this->staffWithRole('support-agent');
        $this->makeSession($target);

        $this->post("/admin/users/{$target->public_id}/reset-access", ['reset_mfa' => true])->assertSessionHasErrors('reason');
        $this->assertNotNull($target->fresh()->two_factor_secret);

        $this->post("/admin/users/{$target->public_id}/reset-access", ['reset_mfa' => true, 'reason' => 'Phone was stolen'])->assertRedirect()->assertSessionHasNoErrors();

        $target = $target->fresh();
        $this->assertNull($target->two_factor_secret);
        $this->assertNull($target->two_factor_confirmed_at);
        $this->assertSame(0, $this->sessionCount($target));
        Notification::assertSentTo($target, ResetPassword::class);
        $this->assertTrue(SecurityEvent::query()->where('user_id', $target->id)->where('event_type', 'mfa_reset_by_admin')->where('severity', 'critical')->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'users.access_reset')->where('reason', 'Phone was stolen')->exists());
    }

    public function test_admin_session_management_uses_opaque_keys_scoped_to_the_target(): void
    {
        $this->useDatabaseSessions();
        $this->actingAsStaff(['users.view', 'users.manage']);
        $target = $this->staffWithRole('support-agent');
        $first = $this->makeSession($target);
        $this->makeSession($target);
        $stranger = $this->staffWithRole('accountant');
        $strangerSession = $this->makeSession($stranger);

        $response = $this->get("/admin/users/{$target->public_id}")->assertOk();
        $this->assertStringNotContainsString($first, $response->getContent(), 'raw session ids never reach the browser');
        $response->assertInertia(fn (Assert $page) => $page->has('sessions', 2)->where('can.manage_sessions', true));

        // Another user's session key cannot be revoked through this user.
        $this->delete("/admin/users/{$target->public_id}/sessions/".SessionKeys::keyFor($strangerSession))->assertRedirect()->assertSessionHas('error');
        $this->assertSame(1, $this->sessionCount($stranger));

        $this->delete("/admin/users/{$target->public_id}/sessions/".SessionKeys::keyFor($first))->assertRedirect()->assertSessionHas('success');
        $this->assertSame(1, $this->sessionCount($target));

        $this->delete("/admin/users/{$target->public_id}/sessions")->assertRedirect();
        $this->assertSame(0, $this->sessionCount($target));
        $this->assertTrue(AuditLog::query()->where('action', 'users.sessions_revoked')->exists());
    }

    public function test_updating_a_profile_is_audited_and_email_change_is_a_security_event(): void
    {
        $this->actingAsStaff(['users.view', 'users.manage']);
        $target = $this->staffWithRole('support-agent', ['email' => 'old@example.com']);

        $this->put("/admin/users/{$target->public_id}", ['name' => 'Renamed Agent', 'email' => 'NEW@example.com', 'mobile' => '', 'preferred_locale' => 'ar'])
            ->assertRedirect("/admin/users/{$target->public_id}")->assertSessionHasNoErrors();

        $target = $target->fresh();
        $this->assertSame('new@example.com', $target->email);
        $this->assertNull($target->email_verified_at);
        $this->assertTrue(AuditLog::query()->where('action', 'users.updated')->where('entity_id', $target->id)->exists());
        $this->assertTrue(SecurityEvent::query()->where('user_id', $target->id)->where('event_type', 'email_changed_by_admin')->exists());
    }

    public function test_lookup_opens_an_existing_account_for_role_managers_only(): void
    {
        $member = $this->makeMember(['email' => 'volunteer@example.com']);

        $this->actingAsStaff(['users.view', 'users.manage']);
        $this->post('/admin/users/lookup', ['email' => 'volunteer@example.com'])->assertForbidden();

        $this->actingAsStaff(['users.view', 'roles.manage']);
        $this->post('/admin/users/lookup', ['email' => 'VOLUNTEER@example.com'])->assertRedirect("/admin/users/{$member->public_id}");
        $this->post('/admin/users/lookup', ['email' => 'ghost@example.com'])->assertSessionHasErrors('email');
    }
}
