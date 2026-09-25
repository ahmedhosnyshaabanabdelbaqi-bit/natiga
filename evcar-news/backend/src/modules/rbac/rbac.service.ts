import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OWNER_ROLE } from './rbac.constants';

interface PermissionMatrix {
  loadedAt: number;
  /** role key → permission keys linked in role_permissions */
  byRole: Map<string, ReadonlySet<string>>;
  /** every permission key (the owner role always has all of them) */
  all: readonly string[];
}

/**
 * Reads the role → permission matrix (roles, permissions, role_permissions)
 * from the database and caches it briefly. Local changes (matrix edits made
 * through this instance) invalidate the cache immediately; other instances
 * pick them up after at most CACHE_TTL_MS.
 */
@Injectable()
export class RbacService {
  static readonly CACHE_TTL_MS = 15_000;

  private matrix?: PermissionMatrix;
  private loading?: Promise<PermissionMatrix>;
  private generation = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** Effective permissions of a set of roles (owner → all permissions). Sorted. */
  async permissionsForRoles(roleKeys: readonly string[]): Promise<string[]> {
    const matrix = await this.getMatrix();
    if (roleKeys.includes(OWNER_ROLE)) return [...matrix.all];
    const out = new Set<string>();
    for (const role of roleKeys) {
      for (const permission of matrix.byRole.get(role) ?? []) out.add(permission);
    }
    return [...out].sort();
  }

  /** True when the roles grant every permission in `required`. */
  async hasAll(roleKeys: readonly string[], required: readonly string[]): Promise<boolean> {
    const granted = new Set(await this.permissionsForRoles(roleKeys));
    return required.every((p) => granted.has(p));
  }

  /** Every known permission key (sorted). */
  async allPermissions(): Promise<string[]> {
    return [...(await this.getMatrix()).all];
  }

  /** Drops the cached matrix (call after changing roles/permissions). */
  invalidate(): void {
    this.generation += 1;
    this.matrix = undefined;
    this.loading = undefined;
  }

  private async getMatrix(): Promise<PermissionMatrix> {
    const cached = this.matrix;
    if (cached && Date.now() - cached.loadedAt < RbacService.CACHE_TTL_MS) return cached;
    if (!this.loading) {
      const generation = this.generation;
      const loading = this.load().then(
        (matrix) => {
          // Ignore results of loads started before an invalidation.
          if (generation === this.generation) this.matrix = matrix;
          if (this.loading === loading) this.loading = undefined;
          return matrix;
        },
        (err: unknown) => {
          if (this.loading === loading) this.loading = undefined;
          throw err;
        },
      );
      this.loading = loading;
    }
    return this.loading;
  }

  private async load(): Promise<PermissionMatrix> {
    const [permissions, roles] = await Promise.all([
      this.prisma.permission.findMany({ select: { key: true }, orderBy: { key: 'asc' } }),
      this.prisma.role.findMany({
        select: { key: true, permissions: { select: { permission: { select: { key: true } } } } },
      }),
    ]);
    const byRole = new Map<string, ReadonlySet<string>>();
    for (const role of roles) {
      byRole.set(role.key, new Set(role.permissions.map((rp) => rp.permission.key)));
    }
    return { loadedAt: Date.now(), byRole, all: permissions.map((p) => p.key) };
  }
}
