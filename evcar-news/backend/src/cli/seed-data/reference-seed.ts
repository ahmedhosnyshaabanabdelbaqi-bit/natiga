import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { PERMISSIONS, ROLES } from './rbac';
import {
  APP_SETTINGS,
  CONNECTOR_TYPES,
  CURRENCIES,
  MARKETS,
  RETIRED_SPEC_KEYS,
  SEARCH_ALIASES,
  SPEC_DEFINITIONS,
} from './reference';

export interface ReferenceSeedSummary {
  currencies: number;
  markets: number;
  connectorTypes: number;
  permissions: number;
  roles: number;
  rolePermissionsAdded: number;
  appSettingsAdded: number;
  specDefinitions: number;
  searchAliasesAdded: number;
}

/**
 * Idempotent reference seed (safe to run on every deploy — the Docker
 * entrypoint runs it before each API start):
 * - reference tables owned by code (connector types, permissions, spec
 *   definitions) are upserted;
 * - admin-managed data is only created when missing and never overwritten:
 *   currencies and markets (editable in /admin), app settings, aliases;
 * - role permission sets: a role created by this run gets its code
 *   permissions; an existing role only gets permissions that are NEW in code
 *   (tracked in seeded_role_permissions), each audited as
 *   `roles.permissions.seed_grant`. A permission an owner removed is never
 *   re-granted. The first run on a database seeded before tracking existed
 *   adopts the current state (records the code pairs, grants nothing).
 */
export async function runReferenceSeed(prisma: PrismaClient): Promise<ReferenceSeedSummary> {
  return prisma.$transaction(
    async (tx) => {
      for (const c of CURRENCIES) {
        // Admins edit names/symbols/decimals (PATCH /admin/currencies): create only.
        await tx.currency.upsert({ where: { code: c.code }, create: { ...c }, update: {} });
      }

      for (const m of MARKETS) {
        await tx.market.upsert({ where: { code: m.code }, create: { ...m }, update: {} });
      }

      for (const c of CONNECTOR_TYPES) {
        const data = {
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          supportsAc: c.supportsAc,
          supportsDc: c.supportsDc,
          typicalMaxAcKw: c.typicalMaxAcKw,
          typicalMaxDcKw: c.typicalMaxDcKw,
          standard: c.standard,
          aliases: [...c.aliases],
          iconKey: c.iconKey,
        };
        await tx.connectorType.upsert({
          where: { code: c.code },
          create: { code: c.code, sortOrder: c.sortOrder, ...data },
          update: data,
        });
      }

      for (const perm of PERMISSIONS) {
        await tx.permission.upsert({ where: { key: perm.key }, create: perm, update: perm });
      }
      const permissionIds = new Map(
        (await tx.permission.findMany({ select: { id: true, key: true } })).map((x) => [
          x.key,
          x.id,
        ]),
      );

      let rolePermissionsAdded = 0;
      for (const role of ROLES) {
        const existing = await tx.role.findUnique({
          where: { key: role.key },
          select: { id: true },
        });
        const saved = await tx.role.upsert({
          where: { key: role.key },
          create: {
            key: role.key,
            nameEn: role.nameEn,
            nameAr: role.nameAr,
            description: role.description,
            isSystem: true,
          },
          update: { isSystem: true },
        });
        const codeKeys =
          role.permissions === '*' ? PERMISSIONS.map((x) => x.key) : role.permissions;
        for (const key of codeKeys) {
          if (!permissionIds.has(key)) {
            throw new Error(`Role ${role.key} references unknown permission ${key}`);
          }
        }
        const seeded = new Set(
          (
            await tx.seededRolePermission.findMany({
              where: { roleKey: role.key },
              select: { permissionKey: true },
            })
          ).map((r) => r.permissionKey),
        );
        const record = (keys: readonly string[]) =>
          keys.length
            ? tx.seededRolePermission.createMany({
                data: keys.map((permissionKey) => ({ roleKey: role.key, permissionKey })),
                skipDuplicates: true,
              })
            : Promise.resolve({ count: 0 });

        if (existing && seeded.size === 0) {
          // Database seeded before tracking existed: whatever is granted now
          // was decided by code or an owner — adopt it, grant nothing.
          await record(codeKeys);
          continue;
        }
        const newKeys = codeKeys.filter((key) => !seeded.has(key));
        if (newKeys.length === 0) continue;
        const added = (
          await tx.rolePermission.createMany({
            data: newKeys.map((key) => ({
              roleId: saved.id,
              permissionId: permissionIds.get(key)!,
            })),
            skipDuplicates: true,
          })
        ).count;
        await record(newKeys);
        rolePermissionsAdded += added;
        if (existing && added > 0) {
          await tx.auditLog.create({
            data: {
              actorId: null,
              actorLabel: 'seed:reference',
              action: 'roles.permissions.seed_grant',
              entityType: 'role',
              entityId: role.key,
              after: { added: newKeys, reason: 'new permission in code' },
            },
          });
        }
      }

      const appSettingsAdded = (
        await tx.appSetting.createMany({
          data: APP_SETTINGS.map((s) => ({
            key: s.key,
            value: s.value as Prisma.InputJsonValue,
            isPublic: s.isPublic,
            description: s.description,
          })),
          skipDuplicates: true,
        })
      ).count;

      for (const [index, def] of SPEC_DEFINITIONS.entries()) {
        const data = {
          group: def.group,
          dataType: def.dataType,
          unit: def.unit ?? null,
          betterDirection: def.betterDirection ?? 'none',
          labelEn: def.labelEn,
          labelAr: def.labelAr,
          descriptionEn: def.descriptionEn ?? null,
          isKeySpec: def.isKeySpec ?? false,
        };
        await tx.specDefinition.upsert({
          where: { key: def.key },
          create: { key: def.key, sortOrder: (index + 1) * 10, ...data },
          update: data,
        });
      }

      // Keys replaced by structured tables (inlets, consumption): removed when unused.
      for (const key of RETIRED_SPEC_KEYS) {
        const used =
          (await tx.vehicleSpecification.count({ where: { specKey: key } })) +
          (await tx.sceneHotspot.count({ where: { specKey: key } }));
        if (used === 0) await tx.specDefinition.deleteMany({ where: { key } });
      }

      const searchAliasesAdded = (
        await tx.searchAlias.createMany({ data: SEARCH_ALIASES, skipDuplicates: true })
      ).count;

      return {
        currencies: CURRENCIES.length,
        markets: MARKETS.length,
        connectorTypes: CONNECTOR_TYPES.length,
        permissions: PERMISSIONS.length,
        roles: ROLES.length,
        rolePermissionsAdded,
        appSettingsAdded,
        specDefinitions: SPEC_DEFINITIONS.length,
        searchAliasesAdded,
      };
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}
