import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../auth/auth.types';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../decorators/require-permissions.decorator';
import { RbacService } from '../rbac.service';
import { PermissionsGuard } from './permissions.guard';

/** RbacService backed by a static matrix (no database). */
function rbacWith(matrix: Record<string, string[]>): RbacService {
  const all = [...new Set(Object.values(matrix).flat())].sort();
  const prisma = {
    permission: { findMany: () => Promise.resolve(all.map((key) => ({ key }))) },
    role: {
      findMany: () =>
        Promise.resolve(
          Object.entries(matrix).map(([key, perms]) => ({
            key,
            permissions: perms.map((p) => ({ permission: { key: p } })),
          })),
        ),
    },
  } as unknown as PrismaService;
  return new RbacService(prisma);
}

const MATRIX = {
  owner: [],
  editor: ['articles.read', 'articles.create'],
  reviewer: ['articles.read', 'articles.publish'],
  user: [],
  _catalogue: ['users.manage_admins', 'audit.read'],
};

@RequirePermissions('articles.read')
class ArticlesAdmin {
  list() {}
  @RequirePermissions('articles.publish') publish() {}
  @RequireAnyPermission('articles.create', 'articles.publish') createOrPublish() {}
}
class Plain {
  open() {}
  @RequirePermissions('audit.read') audit() {}
}

const userWith = (roles: string[]): AuthUser => ({
  id: `u-${roles.join('-')}`,
  email: 'x@example.com',
  displayName: 'x',
  locale: 'en',
  emailVerified: true,
  sessionId: 's',
  roles,
  permissions: [],
});

function ctx(handler: () => void, cls: object, user?: AuthUser): ExecutionContext {
  const req = { user, method: 'POST', originalUrl: '/api/v1/admin/articles?x=1' };
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const audit = { recordSafe: jest.fn(() => Promise.resolve()) };
  const guard = new PermissionsGuard(
    new Reflector(),
    rbacWith(MATRIX),
    audit as unknown as AuditService,
  );
  const A = ArticlesAdmin.prototype;

  const outcome = async (c: ExecutionContext) => {
    try {
      return await guard.canActivate(c);
    } catch (err) {
      return err instanceof AppException ? `${err.getStatus()} ${err.code}` : err;
    }
  };

  beforeEach(() => audit.recordSafe.mockClear());

  it('passes routes without requirements', async () => {
    expect(await outcome(ctx(Plain.prototype.open, Plain))).toBe(true);
  });

  it('requires authentication for guarded routes', async () => {
    expect(await outcome(ctx(A.list, ArticlesAdmin))).toBe('401 UNAUTHORIZED');
  });

  it('enforces class-level AND method-level requirements', async () => {
    expect(await outcome(ctx(A.list, ArticlesAdmin, userWith(['editor'])))).toBe(true);
    expect(await outcome(ctx(A.publish, ArticlesAdmin, userWith(['editor'])))).toBe(
      '403 FORBIDDEN',
    );
    expect(await outcome(ctx(A.publish, ArticlesAdmin, userWith(['reviewer'])))).toBe(true);
    // Method OK but class requirement (articles.read) missing.
    expect(await outcome(ctx(A.publish, ArticlesAdmin, userWith(['user'])))).toBe('403 FORBIDDEN');
  });

  it('supports any-of requirements', async () => {
    expect(await outcome(ctx(A.createOrPublish, ArticlesAdmin, userWith(['editor'])))).toBe(true);
    expect(await outcome(ctx(A.createOrPublish, ArticlesAdmin, userWith(['reviewer'])))).toBe(true);
  });

  it('gives the owner role every permission and merges multiple roles', async () => {
    expect(await outcome(ctx(Plain.prototype.audit, Plain, userWith(['owner'])))).toBe(true);
    expect(await outcome(ctx(Plain.prototype.audit, Plain, userWith(['editor'])))).toBe(
      '403 FORBIDDEN',
    );
    expect(await outcome(ctx(A.publish, ArticlesAdmin, userWith(['editor', 'reviewer'])))).toBe(
      true,
    );
  });

  it('audits denials as security.permission_denied', async () => {
    await outcome(ctx(A.publish, ArticlesAdmin, userWith(['editor'])));
    expect(audit.recordSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'security.permission_denied',
        after: expect.objectContaining({
          path: '/api/v1/admin/articles',
          required: ['articles.publish'],
        }),
      }),
    );
  });
});
