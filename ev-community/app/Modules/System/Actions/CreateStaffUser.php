<?php

namespace App\Modules\System\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Modules\System\Services\UserAccessRules;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Spatie\Permission\PermissionRegistrar;

/**
 * Creates a staff/partner user from the admin panel. No password is chosen by the admin: the user receives
 * a password setup (reset) link. Super roles can only be granted by a super actor (UserAccessRules).
 */
final class CreateStaffUser
{
    public function __construct(private readonly AuditService $audit, private readonly UserAccessRules $rules) {}

    /**
     * @param  array{name: string, email: string, mobile?: ?string, preferred_locale?: ?string}  $data
     * @param  string[]  $roles
     * @param  string[]  $permissions
     * @return array{user: User, reset_link_sent: bool}
     */
    public function execute(array $data, array $roles, array $permissions, User $actor): array
    {
        $roles = array_values(array_unique($roles));
        $permissions = array_values(array_unique($permissions));
        $this->rules->assertCanChange($actor, null, $roles, $permissions);

        $user = DB::transaction(function () use ($data, $roles, $permissions, $actor) {
            $user = User::create([
                'name' => trim($data['name']),
                'email' => strtolower(trim($data['email'])),
                'mobile' => $data['mobile'] ?? null,
                'password' => Str::password(40),
                'preferred_locale' => $data['preferred_locale'] ?? config('ev.default_locale', 'ar'),
                'timezone' => config('ev.timezone', 'Africa/Cairo'),
                'status' => User::STATUS_ACTIVE,
            ]);
            $user->syncRoles($roles);
            $user->syncPermissions($permissions);
            app(PermissionRegistrar::class)->forgetCachedPermissions();

            $this->audit->log('users.created', $user, new: ['name' => $user->name, 'email' => $user->email, 'roles' => $roles, 'permissions' => $permissions, 'source' => 'admin'], actor: $actor);
            if (array_intersect($roles, PermissionRegistry::SUPER_ROLES) !== []) {
                SecurityEvents::record($user, 'super_admin_created', ['by' => $actor->id, 'roles' => $roles]);
            }

            return $user;
        });

        $status = Password::broker()->sendResetLink(['email' => $user->email]);

        return ['user' => $user, 'reset_link_sent' => $status === Password::RESET_LINK_SENT];
    }
}
