<?php

namespace App\Modules\Reports\Operations;

use App\Modules\Reports\Operations\Console\DailyChecksCommand;
use App\Modules\Reports\Operations\Models\Incident;
use App\Modules\Reports\Operations\Models\OperationsException;
use App\Modules\Reports\Operations\Policies\IncidentPolicy;
use App\Modules\Reports\Operations\Policies\OperationsExceptionPolicy;
use App\Modules\Reports\Operations\Services\HealthChecks;
use App\Modules\Reports\Operations\Services\OperationsExceptions;
use App\Modules\System\Services\DashboardKpis;
use App\Modules\System\Services\SchedulerHeartbeat;
use App\Support\Idempotency\Idempotency;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

/**
 * Exception Center, incidents and the daily health checks. Registered from SystemServiceProvider until the
 * Reports module ships its own ReportsServiceProvider (then: `$this->app->register(OperationsServiceProvider::class)` there).
 */
class OperationsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(OperationsExceptions::class);
    }

    public function boot(): void
    {
        Gate::policy(OperationsException::class, OperationsExceptionPolicy::class);
        Gate::policy(Incident::class, IncidentPolicy::class);

        if ($this->app->runningInConsole()) {
            $this->commands([DailyChecksCommand::class]);
        }

        $this->callAfterResolving(Schedule::class, function (Schedule $schedule) {
            $schedule->command('ev:daily-checks')->dailyAt('06:00')->timezone('Africa/Cairo')->withoutOverlapping()->onOneServer();
        });

        DashboardKpis::register('open_exceptions', 'operations.view', fn () => OperationsException::query()->live()->count(), 'operations.kpis.open_exceptions', '/admin/operations', 'operations_exceptions.status in (open, assigned)', tone: 'warning', order: 90);
        DashboardKpis::register('active_incidents', 'incidents.view', fn () => Incident::query()->whereIn('status', ['open', 'investigating', 'mitigated'])->count(), 'operations.kpis.active_incidents', '/admin/incidents', 'incidents.status in (open, investigating, mitigated)', tone: 'danger', order: 91);

        $this->registerHealthChecks();
    }

    private function registerHealthChecks(): void
    {
        HealthChecks::register('system.failed_jobs', function (): ?array {
            $count = (int) DB::table('failed_jobs')->count();
            if ($count === 0) {
                return null;
            }
            $queues = DB::table('failed_jobs')->selectRaw('queue, count(*) as aggregate')->groupBy('queue')->pluck('aggregate', 'queue')->all();

            return ['category' => 'integrations', 'severity' => $count >= 20 ? 'p1' : 'p2', 'title' => "{$count} failed queue job(s) need attention", 'details' => ['count' => $count, 'queues' => $queues, 'url' => '/admin/jobs/failed']];
        });

        HealthChecks::register('system.scheduler_heartbeat', function (): ?array {
            $age = SchedulerHeartbeat::ageSeconds();
            if ($age !== null && $age <= SchedulerHeartbeat::STALE_AFTER_SECONDS) {
                return null;
            }

            return ['category' => 'integrations', 'severity' => 'p1', 'title' => 'Scheduler heartbeat is stale or missing', 'details' => ['age_seconds' => $age, 'stale_after_seconds' => SchedulerHeartbeat::STALE_AFTER_SECONDS]];
        });

        HealthChecks::register('security.disabled_users_with_sessions', function (): ?array {
            if (config('session.driver') !== 'database') {
                return 'skipped: session driver is not database';
            }
            $userIds = DB::table('sessions')->join('users', 'users.id', '=', 'sessions.user_id')->where('users.status', 'disabled')->distinct()->pluck('users.id')->all();
            if ($userIds === []) {
                return null;
            }
            $deleted = DB::table('sessions')->whereIn('user_id', $userIds)->delete();

            return ['category' => 'security', 'severity' => 'p1', 'title' => count($userIds).' disabled user(s) still had active sessions (revoked)', 'details' => ['user_ids' => $userIds, 'sessions_deleted' => $deleted]];
        });

        HealthChecks::register('integrations.unavailable', function (): ?array {
            $class = 'App\\Modules\\Integrations\\Services\\Integrations';
            if (! class_exists($class)) {
                return 'skipped: integrations module not installed';
            }
            $unavailable = [];
            foreach ($class::keys() as $key) {
                $status = $class::status($key);
                if (($status['status'] ?? null) === 'unavailable') {
                    $unavailable[$key] = $status['last_error'] ?? null;
                }
            }
            if ($unavailable === []) {
                return null;
            }

            return ['category' => 'integrations', 'severity' => 'p1', 'title' => 'Integrations unavailable: '.implode(', ', array_keys($unavailable)), 'details' => ['integrations' => $unavailable, 'url' => '/admin/integrations']];
        });

        HealthChecks::register('system.idempotency_purge', fn (): string => 'purged '.Idempotency::purgeExpired().' expired idempotency key(s)');
    }
}
