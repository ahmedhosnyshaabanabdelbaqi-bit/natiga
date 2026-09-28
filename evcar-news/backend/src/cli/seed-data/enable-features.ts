import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { IMPLEMENTED_FEATURES } from '../../modules/settings/settings.types';

/**
 * `npm run db:seed -- --enable-implemented-features` (review 3): switches ON
 * every feature flag whose module is implemented (IMPLEMENTED_FEATURES), keeps
 * the others as they are, audits the change as `settings.features.seed_enable`.
 * Features that need an external service (trip planner → routing provider)
 * stay hidden by /app-config until that service is configured, so nothing is
 * announced that cannot work. Returns the flags that were switched on.
 */
export async function enableImplementedFeatures(prisma: PrismaClient): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.appSetting.findUnique({ where: { key: 'features' } });
    if (!row) throw new Error('The "features" setting is missing: run the reference seed first.');
    const before = (row.value ?? {}) as Prisma.InputJsonObject;
    const after: { [key: string]: Prisma.InputJsonValue | null | undefined } = { ...before };
    const enabled: string[] = [];
    for (const flag of IMPLEMENTED_FEATURES) {
      if (after[flag] !== true) {
        after[flag] = true;
        enabled.push(flag);
      }
    }
    if (enabled.length === 0) return [];
    await tx.appSetting.update({ where: { key: 'features' }, data: { value: after } });
    await tx.auditLog.create({
      data: {
        actorId: null,
        actorLabel: 'seed:reference',
        action: 'settings.features.seed_enable',
        entityType: 'app_setting',
        entityId: 'features',
        before,
        after,
      },
    });
    return enabled;
  });
}
