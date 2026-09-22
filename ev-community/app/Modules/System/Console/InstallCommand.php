<?php

namespace App\Modules\System\Console;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Rbac\Services\RbacSync;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Spatie\Permission\PermissionRegistrar;

/**
 * First-run installer: syncs roles/permissions and creates the first `owner` account. Refuses to run when an
 * owner already exists (the admin panel is the only way to add more super users afterwards).
 *
 *   php artisan ev:install                                     interactive
 *   EV_OWNER_NAME=.. EV_OWNER_EMAIL=.. EV_OWNER_PASSWORD=.. php artisan ev:install --no-interaction
 */
class InstallCommand extends Command
{
    protected $signature = 'ev:install {--name= : Owner name (or EV_OWNER_NAME)} {--email= : Owner e-mail (or EV_OWNER_EMAIL)} {--password= : Owner password (or EV_OWNER_PASSWORD); min 12 chars, mixed case, numbers and symbols}';

    protected $description = 'Create the first owner account and synchronise roles/permissions (refuses if an owner already exists)';

    public function handle(RbacSync $rbac, AuditService $audit): int
    {
        $this->components->info('EV Community Egypt — installer');
        $result = $rbac->sync();
        $this->components->twoColumnDetail('Roles & permissions synced', sprintf('%d new permissions, %d new roles', $result['permissions'], $result['roles']));

        if (User::query()->role('owner')->exists()) {
            $this->components->error('An owner account already exists. Use the admin panel (/admin/users) to manage super users.');

            return self::FAILURE;
        }

        $name = $this->option('name') ?: env('EV_OWNER_NAME');
        $email = $this->option('email') ?: env('EV_OWNER_EMAIL');
        $password = $this->option('password') ?: env('EV_OWNER_PASSWORD');

        if ($this->input->isInteractive()) {
            $name = $name ?: $this->ask('Owner name');
            $email = $email ?: $this->ask('Owner e-mail');
            $password = $password ?: $this->secret('Owner password (min 12 chars, upper/lower case, numbers and symbols)');
        }

        $validator = Validator::make(['name' => $name, 'email' => $email, 'password' => $password], [
            'name' => ['required', 'string', 'min:3', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', Password::min(12)->mixedCase()->letters()->numbers()->symbols()],
        ]);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->components->error($error);
            }

            return self::INVALID;
        }

        $user = DB::transaction(function () use ($name, $email, $password, $audit) {
            $user = User::create([
                'name' => trim((string) $name),
                'email' => strtolower(trim((string) $email)),
                'password' => $password,
                'preferred_locale' => config('ev.default_locale', 'ar'),
                'timezone' => config('ev.timezone', 'Africa/Cairo'),
                'status' => User::STATUS_ACTIVE,
                'email_verified_at' => now(),
            ]);
            $user->forceFill(['password_changed_at' => now()])->save();
            $user->assignRole('owner');
            app(PermissionRegistrar::class)->forgetCachedPermissions();
            $audit->log('users.created', $user, new: ['email' => $user->email, 'roles' => ['owner'], 'source' => 'ev:install'], actorType: 'system');
            SecurityEvents::record($user, 'super_admin_created', ['source' => 'ev:install']);

            return $user;
        });

        $this->components->success(sprintf('Owner account created: %s <%s>', $user->name, $user->email));
        $this->newLine();
        $this->components->bulletList([
            'Log in at '.rtrim((string) config('app.url'), '/').config('ev.portals.admin.login'),
            'Enable two-factor authentication at /settings/security (mandatory for the owner role)',
            'Run `php artisan storage:link` so branding uploads are served from /storage',
            'Complete the setup checklist at /admin/setup and review /admin/settings, /admin/modules and /admin/roles',
            'Run `php artisan ev:health` in your deploy pipeline',
        ]);

        return self::SUCCESS;
    }
}
