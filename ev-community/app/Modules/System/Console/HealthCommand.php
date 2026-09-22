<?php

namespace App\Modules\System\Console;

use App\Modules\System\Services\SchedulerHeartbeat;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

/**
 * Deploy-time health check. Exit code 1 when any check fails (and, with --strict, when any check warns).
 *
 *   php artisan ev:health [--strict] [--json]
 */
class HealthCommand extends Command
{
    protected $signature = 'ev:health {--strict : Treat warnings as failures} {--json : Machine-readable output}';

    protected $description = 'Check database, cache/redis, queue tables, storage and the scheduler heartbeat';

    /** @var array<int, array{check: string, status: string, detail: string}> */
    private array $results = [];

    public function handle(): int
    {
        $this->check('app', fn () => 'env='.app()->environment().' debug='.(config('app.debug') ? 'on' : 'off').' version='.app()->version());
        $this->check('database', function () {
            DB::select('select 1');

            return config('database.default').' @ '.config('database.connections.'.config('database.default').'.host');
        });
        $this->check('cache', function () {
            $key = 'ev.health.'.Str::random(8);
            cache()->put($key, 1, 30);
            $ok = cache()->get($key) === 1;
            cache()->forget($key);
            if (! $ok) {
                throw new \RuntimeException('cache store read-back failed');
            }

            return (string) config('cache.default');
        });
        if ($this->usesRedis()) {
            $this->check('redis', function () {
                $pong = Redis::connection()->ping();

                return 'ping='.(is_string($pong) ? $pong : var_export((bool) $pong, true));
            });
        } else {
            $this->skip('redis', 'not configured');
        }
        $this->check('queue', function () {
            $pending = DB::table('jobs')->count();
            $failed = DB::table('failed_jobs')->count();
            $detail = sprintf('connection=%s pending=%d failed=%d', config('queue.default'), $pending, $failed);
            if ($failed > 0) {
                return ['warning', $detail];
            }

            return $detail;
        });
        $this->check('storage', function () {
            $probe = storage_path('app/.ev-health-'.Str::random(6));
            if (@file_put_contents($probe, 'ok') === false) {
                throw new \RuntimeException(storage_path('app').' is not writable');
            }
            @unlink($probe);
            $logs = storage_path('logs');
            if (! is_writable($logs)) {
                throw new \RuntimeException($logs.' is not writable');
            }

            return 'writable';
        });
        $this->check('scheduler', function () {
            $age = SchedulerHeartbeat::ageSeconds();
            if ($age === null) {
                return ['warning', 'no heartbeat yet (is `schedule:run` in cron / schedule:work running?)'];
            }
            if ($age > SchedulerHeartbeat::STALE_AFTER_SECONDS) {
                return ['warning', sprintf('last heartbeat %ds ago (stale after %ds)', $age, SchedulerHeartbeat::STALE_AFTER_SECONDS)];
            }

            return sprintf('last heartbeat %ds ago', $age);
        });

        $failed = collect($this->results)->where('status', 'fail')->count();
        $warnings = collect($this->results)->where('status', 'warn')->count();

        if ($this->option('json')) {
            $this->line(json_encode(['ok' => $failed === 0 && (! $this->option('strict') || $warnings === 0), 'checks' => $this->results], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            foreach ($this->results as $row) {
                $this->components->twoColumnDetail(sprintf('%s  %s', $row['check'], $row['detail']), strtoupper($row['status']));
            }
            $this->newLine();
        }

        if ($failed > 0 || ($this->option('strict') && $warnings > 0)) {
            if (! $this->option('json')) {
                $this->components->error(sprintf('Health check failed: %d failure(s), %d warning(s)', $failed, $warnings));
            }

            return self::FAILURE;
        }
        if (! $this->option('json')) {
            $this->components->success(sprintf('All checks passed (%d warning(s))', $warnings));
        }

        return self::SUCCESS;
    }

    private function check(string $name, \Closure $callback): void
    {
        try {
            $result = $callback();
            [$status, $detail] = is_array($result) ? [$result[0] === 'warning' ? 'warn' : 'ok', $result[1]] : ['ok', (string) $result];
        } catch (\Throwable $e) {
            [$status, $detail] = ['fail', Str::limit($e->getMessage(), 200)];
        }
        $this->results[] = ['check' => $name, 'status' => $status, 'detail' => $detail];
    }

    private function skip(string $name, string $detail): void
    {
        $this->results[] = ['check' => $name, 'status' => 'skip', 'detail' => $detail];
    }

    private function usesRedis(): bool
    {
        return config('cache.default') === 'redis' || config('queue.default') === 'redis' || config('session.driver') === 'redis';
    }
}
