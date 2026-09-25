import type { PrismaService } from '../../../prisma/prisma.service';
import { AUTH_RETENTION_DAYS, AuthMaintenanceService } from './auth-maintenance.service';
import type { SessionService } from './session.service';

describe('AuthMaintenanceService', () => {
  it('purges sessions and e-mail tokens that ended before the retention cutoff', async () => {
    const deleteMany = jest.fn((args: unknown) => {
      void args;
      return Promise.resolve({ count: 3 });
    });
    const purgeEnded = jest.fn(() => Promise.resolve(2));
    const service = new AuthMaintenanceService(
      { emailToken: { deleteMany } } as unknown as PrismaService,
      { purgeEnded } as unknown as SessionService,
    );
    const before = Date.now();
    await expect(service.run()).resolves.toEqual({ sessions: 2, emailTokens: 3 });
    expect(purgeEnded).toHaveBeenCalledWith(AUTH_RETENTION_DAYS);
    const where = (deleteMany.mock.calls[0][0] as { where: { OR: Record<string, { lt: Date }>[] } })
      .where;
    const cutoff = where.OR[0].expiresAt.lt.getTime();
    expect(before - cutoff).toBeGreaterThanOrEqual(AUTH_RETENTION_DAYS * 24 * 3600 * 1000);
    expect(where.OR[1].usedAt.lt.getTime()).toBe(cutoff);
  });

  it('never throws (failures are logged)', async () => {
    const service = new AuthMaintenanceService(
      {} as PrismaService,
      { purgeEnded: () => Promise.reject(new Error('db down')) } as unknown as SessionService,
    );
    await expect(service.run()).resolves.toEqual({ sessions: 0, emailTokens: 0 });
  });
});
