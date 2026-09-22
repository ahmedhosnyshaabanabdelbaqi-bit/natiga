<?php

namespace Tests\Feature\Operations;

use App\Models\User;
use App\Modules\Reports\Operations\Models\Enums\ExceptionStatus;
use App\Modules\Reports\Operations\Models\OperationsException;
use App\Modules\Reports\Operations\Services\HealthChecks;
use App\Modules\System\Services\SchedulerHeartbeat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\System\Concerns\InteractsWithSessions;
use Tests\TestCase;

class DailyChecksTest extends TestCase
{
    use InteractsWithSessions;
    use RefreshDatabase;

    public function test_built_in_checks_are_registered(): void
    {
        $keys = HealthChecks::keys();
        foreach (['system.failed_jobs', 'system.scheduler_heartbeat', 'security.disabled_users_with_sessions', 'integrations.unavailable', 'system.idempotency_purge'] as $key) {
            $this->assertContains($key, $keys);
        }
    }

    public function test_failed_jobs_and_stale_heartbeat_raise_exceptions_and_recover_when_healthy(): void
    {
        cache()->forget(SchedulerHeartbeat::CACHE_KEY);
        DB::table('failed_jobs')->insert(['uuid' => (string) Str::uuid(), 'connection' => 'database', 'queue' => 'mail', 'payload' => '{}', 'exception' => 'boom', 'failed_at' => now()]);

        $this->assertSame(0, Artisan::call('ev:daily-checks', ['--only' => ['system.failed_jobs', 'system.scheduler_heartbeat']]));
        $failed = OperationsException::query()->where('dedup_key', HealthChecks::dedupKey('system.failed_jobs'))->firstOrFail();
        $this->assertSame(['mail' => 1], $failed->details['queues']);
        $this->assertSame('p1', OperationsException::query()->where('dedup_key', HealthChecks::dedupKey('system.scheduler_heartbeat'))->firstOrFail()->severity->value);

        // Running again only counts the recurrence.
        Artisan::call('ev:daily-checks', ['--only' => ['system.failed_jobs']]);
        $this->assertSame(2, $failed->fresh()->occurrences);

        // Healthy again: the keyed exceptions resolve automatically.
        DB::table('failed_jobs')->delete();
        SchedulerHeartbeat::beat();
        Artisan::call('ev:daily-checks', ['--only' => ['system.failed_jobs', 'system.scheduler_heartbeat']]);
        $this->assertSame(ExceptionStatus::Resolved, $failed->fresh()->status);
        $this->assertSame(0, OperationsException::query()->live()->count());
    }

    public function test_sessions_of_disabled_users_are_revoked_and_reported(): void
    {
        $this->useDatabaseSessions();
        $disabled = User::factory()->disabled()->create();
        $active = User::factory()->create();
        $this->makeSession($disabled);
        $this->makeSession($active);

        Artisan::call('ev:daily-checks', ['--only' => ['security.disabled_users_with_sessions']]);

        $this->assertSame(0, $this->sessionCount($disabled));
        $this->assertSame(1, $this->sessionCount($active));
        $exception = OperationsException::query()->where('dedup_key', HealthChecks::dedupKey('security.disabled_users_with_sessions'))->firstOrFail();
        $this->assertSame('security', $exception->category->value);
        $this->assertSame([$disabled->id], $exception->details['user_ids']);
    }

    public function test_expired_idempotency_keys_are_purged(): void
    {
        DB::table('idempotency_keys')->insert([
            ['scope' => 'test', 'key' => 'old', 'status' => 'completed', 'expires_at' => now()->subDay(), 'created_at' => now()->subDays(2), 'updated_at' => now()->subDays(2)],
            ['scope' => 'test', 'key' => 'fresh', 'status' => 'completed', 'expires_at' => now()->addDay(), 'created_at' => now(), 'updated_at' => now()],
        ]);

        Artisan::call('ev:daily-checks', ['--only' => ['system.idempotency_purge']]);

        $this->assertSame(['fresh'], DB::table('idempotency_keys')->pluck('key')->all());
    }

    public function test_a_crashing_check_is_reported_and_the_command_fails(): void
    {
        HealthChecks::register('test.crashing', fn () => throw new \RuntimeException('database exploded'));
        try {
            $this->assertSame(1, Artisan::call('ev:daily-checks', ['--only' => ['test.crashing']]));
        } finally {
            HealthChecks::forget('test.crashing'); // the registry is static: never leak into other tests
        }
        $exception = OperationsException::query()->where('dedup_key', HealthChecks::dedupKey('test.crashing'))->firstOrFail();
        $this->assertSame('data_quality', $exception->category->value);
        $this->assertStringContainsString('database exploded', $exception->title);
    }

    public function test_list_option_prints_registered_checks(): void
    {
        $this->assertSame(0, Artisan::call('ev:daily-checks', ['--list' => true]));
        $this->assertStringContainsString('system.failed_jobs', Artisan::output());
    }
}
