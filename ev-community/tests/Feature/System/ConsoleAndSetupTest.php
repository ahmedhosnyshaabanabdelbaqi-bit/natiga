<?php

namespace Tests\Feature\System;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\Rbac\Models\RoleMeta;
use App\Modules\System\Services\SchedulerHeartbeat;
use App\Modules\System\Services\Settings;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ConsoleAndSetupTest extends TestCase
{
    use RefreshDatabase;

    public function test_install_creates_the_first_owner_and_syncs_roles(): void
    {
        $this->artisan('ev:install', ['--name' => 'Platform Owner', '--email' => 'Owner@EV-Egypt.test', '--password' => 'Str0ng!Passw0rd#2026'])
            ->assertExitCode(0);

        $owner = User::query()->where('email', 'owner@ev-egypt.test')->firstOrFail();
        $this->assertTrue($owner->hasRole('owner'));
        $this->assertTrue(Hash::check('Str0ng!Passw0rd#2026', $owner->password));
        $this->assertNotNull($owner->email_verified_at);
        $this->assertTrue(Role::query()->where('name', 'accountant')->exists(), 'roles were synced');
        $this->assertSame('محاسب', RoleMeta::query()->where('role_id', Role::findByName('accountant')->id)->value('name_ar'), 'role_meta seeded from the registry');
        $this->assertTrue(AuditLog::query()->where('action', 'users.created')->where('actor_type', 'system')->exists());
        $this->assertTrue(SecurityEvent::query()->where('user_id', $owner->id)->where('event_type', 'super_admin_created')->exists());
    }

    public function test_install_refuses_when_an_owner_already_exists(): void
    {
        $this->actingAsRole('owner');

        $this->artisan('ev:install', ['--name' => 'Second Owner', '--email' => 'second@ev-egypt.test', '--password' => 'Str0ng!Passw0rd#2026'])
            ->assertExitCode(1);

        $this->assertFalse(User::query()->where('email', 'second@ev-egypt.test')->exists());
        $this->assertSame(1, User::query()->role('owner')->count());
    }

    public function test_install_rejects_weak_passwords_and_invalid_input(): void
    {
        $this->artisan('ev:install', ['--name' => 'Owner', '--email' => 'owner@ev-egypt.test', '--password' => 'password'])->assertExitCode(2);
        $this->artisan('ev:install', ['--name' => 'Owner', '--email' => 'not-an-email', '--password' => 'Str0ng!Passw0rd#2026'])->assertExitCode(2);
        $this->assertSame(0, User::query()->count());
    }

    public function test_install_reads_owner_details_from_the_environment(): void
    {
        $_SERVER['EV_OWNER_NAME'] = 'Env Owner';
        $_SERVER['EV_OWNER_EMAIL'] = 'env-owner@ev-egypt.test';
        $_SERVER['EV_OWNER_PASSWORD'] = 'An0ther!Str0ng#Pass';
        try {
            $this->artisan('ev:install', ['--no-interaction' => true])->assertExitCode(0);
        } finally {
            unset($_SERVER['EV_OWNER_NAME'], $_SERVER['EV_OWNER_EMAIL'], $_SERVER['EV_OWNER_PASSWORD']);
        }

        $this->assertTrue(User::query()->where('email', 'env-owner@ev-egypt.test')->firstOrFail()->hasRole('owner'));
    }

    public function test_health_command_reports_checks_and_fails_on_warnings_in_strict_mode(): void
    {
        cache()->forget(SchedulerHeartbeat::CACHE_KEY);

        $this->assertSame(0, Artisan::call('ev:health'));
        $this->assertSame(1, Artisan::call('ev:health', ['--strict' => true]), 'no scheduler heartbeat yet');

        SchedulerHeartbeat::beat();
        $this->assertSame(0, Artisan::call('ev:health', ['--strict' => true]));

        $this->assertSame(0, Artisan::call('ev:health', ['--json' => true]));
        $report = json_decode(Artisan::output(), true);
        $this->assertTrue($report['ok']);
        $this->assertSame(['app', 'database', 'cache', 'redis', 'queue', 'storage', 'scheduler'], array_column($report['checks'], 'check'));
    }

    public function test_health_command_fails_when_the_database_is_unreachable(): void
    {
        config(['database.connections.broken' => array_merge(config('database.connections.pgsql'), ['host' => '127.0.0.1', 'port' => 1, 'database' => 'nope'])]);
        config(['database.default' => 'broken']);

        $this->artisan('ev:health')->assertExitCode(1);

        config(['database.default' => 'pgsql']);
    }

    public function test_scheduler_runs_the_heartbeat_every_minute_and_daily_checks_at_six_cairo_time(): void
    {
        $events = collect(app(Schedule::class)->events());

        $heartbeat = $events->first(fn ($event) => $event->description === 'ev:scheduler-heartbeat');
        $this->assertNotNull($heartbeat);
        $this->assertSame('* * * * *', $heartbeat->expression);

        $daily = $events->first(fn ($event) => str_contains((string) $event->command, 'ev:daily-checks'));
        $this->assertNotNull($daily);
        $this->assertSame('0 6 * * *', $daily->expression);
        $this->assertSame('Africa/Cairo', (string) $daily->timezone);

        cache()->forget(SchedulerHeartbeat::CACHE_KEY);
        $heartbeat->run($this->app);
        $this->assertFalse(SchedulerHeartbeat::isStale());
    }

    public function test_setup_checklist_requires_settings_manage_and_computes_items(): void
    {
        $this->actingAsStaff(['settings.view']);
        $this->get('/admin/setup')->assertForbidden();

        $owner = $this->actingAsRole('owner');
        $this->get('/admin/setup')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/setup/index')
            ->where('total', 11)
            ->where('items', function ($items) use ($owner) {
                $items = collect($items)->keyBy('key');

                return $items['owner_exists']['ok'] === true
                    && str_contains((string) $items['owner_exists']['detail'], $owner->email)
                    && $items['owner_mfa']['ok'] === true
                    && $items['roles_synced']['ok'] === true
                    && $items['modules_reviewed']['ok'] === false
                    && $items['modules_reviewed']['href'] === '/admin/modules'
                    && $items['branding']['ok'] === false;
            }));
    }

    public function test_maintenance_page_is_bilingual_uses_settings_and_hides_technical_details(): void
    {
        Settings::set('system.maintenance_message_ar', 'نعمل على تحديث المنصة وسنعود خلال ساعة.');
        Settings::set('system.maintenance_message_en', 'We are upgrading the platform and will be back within an hour.');
        Settings::set('branding.accent_color', '#123456');

        $html = view('errors.503')->render();

        $this->assertStringContainsString('نعمل على تحديث المنصة وسنعود خلال ساعة.', $html);
        $this->assertStringContainsString('We are upgrading the platform and will be back within an hour.', $html);
        $this->assertStringContainsString('#123456', $html);
        $this->assertStringContainsString('lang="ar"', $html);
        $this->assertStringContainsString('lang="en"', $html);
        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('Exception', $html);
    }
}
