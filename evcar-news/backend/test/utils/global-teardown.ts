import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';
import { redisOptionsFromUrl } from '../../src/common/redis/redis.module';
import { dropDatabasesWithPrefix } from './db';

async function deleteRedisKeys(patterns: string[]): Promise<void> {
  const redis = new Redis({
    ...redisOptionsFromUrl(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    for (const match of patterns) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 500);
        if (keys.length > 0) await redis.unlink(...keys);
        cursor = next;
      } while (cursor !== '0');
    }
  } catch {
    // Redis cleanup is best-effort (keys also expire on their own).
  } finally {
    redis.disconnect();
  }
}

/** Removes the run's local storage root (createTestApp uses ./storage/test/<runId>/…). */
async function deleteStorageRoot(runId: string): Promise<void> {
  if (!/^[a-z0-9]+$/i.test(runId)) return;
  await rm(resolve(process.cwd(), 'storage', 'test', runId), { recursive: true, force: true });
}

/** Drops the template and every database/Redis key/storage directory of this run. */
export default async function globalTeardown(): Promise<void> {
  const runId = process.env.E2E_RUN_ID;
  if (!runId) return;
  await dropDatabasesWithPrefix(`evcar_test_${runId}_`);
  await deleteRedisKeys([`evcar_test:${runId}:*`, `evcar_test_bull_${runId}_*`]);
  await deleteStorageRoot(runId).catch(() => undefined);
}
