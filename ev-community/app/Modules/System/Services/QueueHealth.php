<?php

namespace App\Modules\System\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * Queue/scheduler summary for the failed-jobs page and `ev:health`. Reads the `jobs` table (database driver)
 * and, when the default connection is redis, the length of the redis lists. Never throws.
 */
final class QueueHealth
{
    /** @return array{connection: string, pending: array<int, array{queue: string, count: int}>, reserved: int, failed: int, heartbeat: array{at: ?string, age_seconds: ?int, stale: bool}} */
    public function summary(): array
    {
        $connection = (string) config('queue.default', 'database');

        return [
            'connection' => $connection,
            'pending' => $this->pending($connection),
            'reserved' => $this->reserved(),
            'failed' => $this->failedCount(),
            'heartbeat' => SchedulerHeartbeat::status(),
        ];
    }

    /** @return array<int, array{queue: string, count: int}> */
    public function pending(?string $connection = null): array
    {
        $connection ??= (string) config('queue.default', 'database');
        $rows = [];
        try {
            foreach (DB::table('jobs')->selectRaw('queue, count(*) as aggregate')->whereNull('reserved_at')->groupBy('queue')->orderBy('queue')->get() as $row) {
                $rows[] = ['queue' => (string) $row->queue, 'count' => (int) $row->aggregate];
            }
        } catch (\Throwable) {
            // jobs table not reachable: reported by ev:health
        }
        if ($connection === 'redis') {
            try {
                $queue = (string) config('queue.connections.redis.queue', 'default');
                $redis = Redis::connection((string) config('queue.connections.redis.connection', 'default'));
                $count = (int) $redis->llen('queues:'.$queue) + (int) $redis->zcard('queues:'.$queue.':delayed');
                $rows[] = ['queue' => $queue.' (redis)', 'count' => $count];
            } catch (\Throwable) {
                // redis unreachable: reported by ev:health
            }
        }

        return $rows;
    }

    public function reserved(): int
    {
        try {
            return (int) DB::table('jobs')->whereNotNull('reserved_at')->count();
        } catch (\Throwable) {
            return 0;
        }
    }

    public function failedCount(): int
    {
        try {
            return (int) DB::table('failed_jobs')->count();
        } catch (\Throwable) {
            return 0;
        }
    }
}
