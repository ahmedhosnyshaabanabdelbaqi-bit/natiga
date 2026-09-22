<?php

namespace Tests\Feature\Rbac;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\Rbac\Models\RoleMeta;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Modules\Rbac\Services\RbacSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class RolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_matrix_requires_roles_manage(): void
    {
        $agent = $this->actingAsRole('support-agent');
        $this->get('/admin/roles')->assertForbidden();
        $this->put('/admin/roles/support-agent/permissions', ['permissions' => ['settings.manage'], 'reason' => 'Give myself settings'])->assertForbidden();

        $this->assertFalse(Role::findByName('support-agent')->hasPermissionTo('settings.manage'));
        $this->assertTrue(SecurityEvent::query()->where('user_id', $agent->id)->where('event_type', 'permission_escalation_blocked')->where('severity', 'critical')->exists());
    }

    public function test_matrix_lists_roles_with_bilingual_labels_grouped_by_module(): void
    {
        $this->actingAsRole('owner');

        $this->get('/admin/roles')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/roles/index')
            ->where('actorIsSuper', true)
            ->has('roles', count(PermissionRegistry::ROLES))
            ->where('roles', fn ($roles) => collect($roles)->firstWhere('slug', 'owner')['is_super'] === true
                && collect($roles)->firstWhere('slug', 'accountant')['name_ar'] === 'محاسب'
                && collect($roles)->firstWhere('slug', 'accountant')['name_en'] === 'Accountant')
            ->where('groups', fn ($groups) => collect($groups)->firstWhere('module', 'System')['label']['en'] === 'System'
                && collect(collect($groups)->firstWhere('module', 'Audit')['permissions'])->firstWhere('key', 'audit.view')['label']['ar'] === 'عرض سجل التدقيق'));
    }

    public function test_saving_role_permissions_requires_a_reason_and_is_audited(): void
    {
        $owner = $this->actingAsRole('owner');
        $before = Role::findByName('support-agent')->permissions->pluck('name')->all();

        $this->put('/admin/roles/support-agent/permissions', ['permissions' => [...$before, 'audit.view']])->assertSessionHasErrors('reason');

        $this->put('/admin/roles/support-agent/permissions', ['permissions' => [...$before, 'audit.view'], 'reason' => 'Support needs the audit trail'])
            ->assertRedirect()->assertSessionHasNoErrors();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->assertTrue(Role::findByName('support-agent')->hasPermissionTo('audit.view'));
        $log = AuditLog::query()->where('action', 'roles.permissions_changed')->firstOrFail();
        $this->assertSame($owner->id, $log->actor_id);
        $this->assertSame(['audit.view'], $log->new_values['added']);
        $this->assertSame([], $log->new_values['removed']);
        $this->assertSame('Support needs the audit trail', $log->reason);
    }

    public function test_super_roles_are_read_only(): void
    {
        $this->actingAsRole('owner');

        $this->put('/admin/roles/super-admin/permissions', ['permissions' => ['audit.view'], 'reason' => 'Trim super admin'])->assertForbidden();
        $this->put('/admin/roles/owner/permissions', ['permissions' => [], 'reason' => 'Trim the owner'])->assertForbidden();
        $this->assertSame(count(PermissionRegistry::permissions()), Role::findByName('super-admin')->permissions()->count());
    }

    public function test_non_super_role_manager_cannot_grant_permissions_they_do_not_hold(): void
    {
        $this->syncRbac();
        $manager = User::factory()->withTwoFactor()->create();
        $manager->assignRole('operations-manager');
        $manager->givePermissionTo('roles.manage');
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->actingAs($manager);
        $before = Role::findByName('support-agent')->permissions->pluck('name')->all();

        $this->put('/admin/roles/support-agent/permissions', ['permissions' => [...$before, 'modules.manage'], 'reason' => 'Let support toggle modules'])->assertForbidden();
        $this->assertFalse(Role::findByName('support-agent')->hasPermissionTo('modules.manage'));
        $this->assertTrue(SecurityEvent::query()->where('user_id', $manager->id)->where('event_type', 'permission_escalation_blocked')->exists());

        // Removing permissions and granting held ones is fine.
        $this->put('/admin/roles/support-agent/permissions', ['permissions' => ['admin.access', 'users.view'], 'reason' => 'Reduce support scope'])->assertRedirect()->assertSessionHasNoErrors();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->assertEqualsCanonicalizing(['admin.access', 'users.view'], Role::findByName('support-agent')->permissions->pluck('name')->all());
    }

    public function test_unknown_permissions_are_rejected(): void
    {
        $this->actingAsRole('owner');
        $this->put('/admin/roles/support-agent/permissions', ['permissions' => ['orders.teleport'], 'reason' => 'Unknown permission'])->assertSessionHasErrors('permissions');
    }

    public function test_custom_role_lifecycle(): void
    {
        $this->actingAsRole('owner');

        $this->post('/admin/roles', ['slug' => 'Bad Slug', 'name_ar' => 'x', 'name_en' => 'y'])->assertSessionHasErrors(['slug', 'name_ar', 'name_en']);
        $this->post('/admin/roles', ['slug' => 'accountant', 'name_ar' => 'محاسب ٢', 'name_en' => 'Accountant 2'])->assertSessionHasErrors('slug');

        $this->post('/admin/roles', ['slug' => 'field-inspector', 'name_ar' => 'مفتش ميداني', 'name_en' => 'Field inspector', 'description' => 'Checks stations'])
            ->assertRedirect()->assertSessionHasNoErrors();
        $role = Role::findByName('field-inspector');
        $meta = RoleMeta::query()->where('role_id', $role->id)->firstOrFail();
        $this->assertSame('مفتش ميداني', $meta->name_ar);
        $this->assertFalse($meta->is_system);
        $this->assertTrue(AuditLog::query()->where('action', 'roles.created')->exists());

        $inspector = User::factory()->create();
        $inspector->assignRole('field-inspector');
        $this->delete('/admin/roles/field-inspector', ['reason' => 'No longer needed'])->assertSessionHasErrors();
        $this->assertTrue(Role::query()->where('name', 'field-inspector')->exists());

        $inspector->removeRole('field-inspector');
        $this->delete('/admin/roles/field-inspector', ['reason' => 'No longer needed'])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertFalse(Role::query()->where('name', 'field-inspector')->exists());
        $this->assertFalse(RoleMeta::query()->where('role_id', $role->id)->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'roles.deleted')->where('entity_label', 'field-inspector')->exists());
    }

    public function test_built_in_roles_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');
        $this->delete('/admin/roles/content-manager')->assertForbidden();
        $this->assertTrue(Role::query()->where('name', 'content-manager')->exists());
    }

    public function test_rbac_sync_is_idempotent_seeds_role_meta_and_preserves_admin_customisations(): void
    {
        $sync = app(RbacSync::class);
        $sync->sync();
        $this->assertSame(count(PermissionRegistry::ROLES), RoleMeta::query()->where('is_system', true)->count());

        // An admin renames a role and removes a default permission.
        $meta = RoleMeta::query()->where('role_id', Role::findByName('support-agent')->id)->firstOrFail();
        $meta->update(['name_en' => 'Customer care']);
        $role = Role::findByName('support-agent');
        $removed = $role->permissions->first()->name;
        $role->revokePermissionTo($removed);

        $result = $sync->sync();
        $this->assertSame(['permissions' => 0, 'roles' => 0], $result);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->assertSame('Customer care', $meta->fresh()->name_en);
        $this->assertFalse(Role::findByName('support-agent')->hasPermissionTo($removed), 'admin removals survive a normal sync');

        $sync->sync(reset: true);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->assertTrue(Role::findByName('support-agent')->hasPermissionTo($removed));
        $this->assertSame('Support Agent', $meta->fresh()->name_en);
    }

    public function test_every_registry_permission_references_a_known_role(): void
    {
        $grants = PermissionRegistry::defaultRoleGrants();
        $this->assertSame(array_keys(PermissionRegistry::ROLES), array_keys($grants));
        foreach (PermissionRegistry::permissions() as $key => $definition) {
            $this->assertMatchesRegularExpression('/^[a-z_]+\.[a-z_.]+$/', $key);
            $this->assertNotEmpty($definition['label']['ar'], $key);
            $this->assertNotEmpty($definition['label']['en'], $key);
        }
    }
}
