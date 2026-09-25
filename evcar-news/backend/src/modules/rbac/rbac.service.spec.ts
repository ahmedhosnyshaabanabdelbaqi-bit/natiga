import type { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from './rbac.service';

function prismaWith(matrix: () => Record<string, string[]>) {
  const calls = { count: 0 };
  const prisma = {
    permission: {
      findMany: () => {
        calls.count += 1;
        const all = [...new Set(Object.values(matrix()).flat()), 'x.only_owner'].sort();
        return Promise.resolve(all.map((key) => ({ key })));
      },
    },
    role: {
      findMany: () =>
        Promise.resolve(
          Object.entries(matrix()).map(([key, perms]) => ({
            key,
            permissions: perms.map((p) => ({ permission: { key: p } })),
          })),
        ),
    },
  } as unknown as PrismaService;
  return { prisma, calls };
}

describe('RbacService', () => {
  it('resolves effective permissions; owner has all, including unassigned ones', async () => {
    const { prisma } = prismaWith(() => ({ owner: [], editor: ['a.read', 'a.write'], u: [] }));
    const rbac = new RbacService(prisma);
    expect(await rbac.permissionsForRoles(['editor'])).toEqual(['a.read', 'a.write']);
    expect(await rbac.permissionsForRoles(['owner'])).toEqual([
      'a.read',
      'a.write',
      'x.only_owner',
    ]);
    expect(await rbac.permissionsForRoles(['u', 'unknown-role'])).toEqual([]);
    expect(await rbac.hasAll(['editor'], ['a.read'])).toBe(true);
    expect(await rbac.hasAll(['editor'], ['a.read', 'x.only_owner'])).toBe(false);
  });

  it('caches the matrix briefly and reloads after invalidate()', async () => {
    let perms = ['a.read'];
    const { prisma, calls } = prismaWith(() => ({ editor: perms }));
    const rbac = new RbacService(prisma);
    await Promise.all([rbac.permissionsForRoles(['editor']), rbac.permissionsForRoles(['editor'])]);
    expect(calls.count).toBe(1); // concurrent callers share one load
    perms = ['a.read', 'a.write'];
    expect(await rbac.permissionsForRoles(['editor'])).toEqual(['a.read']); // still cached
    rbac.invalidate();
    expect(await rbac.permissionsForRoles(['editor'])).toEqual(['a.read', 'a.write']);
    expect(calls.count).toBe(2);
  });

  it('expires the cache after CACHE_TTL_MS', async () => {
    jest.useFakeTimers({ now: Date.now() });
    try {
      const { prisma, calls } = prismaWith(() => ({ editor: ['a.read'] }));
      const rbac = new RbacService(prisma);
      await rbac.permissionsForRoles(['editor']);
      jest.setSystemTime(Date.now() + RbacService.CACHE_TTL_MS + 1);
      await rbac.permissionsForRoles(['editor']);
      expect(calls.count).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
