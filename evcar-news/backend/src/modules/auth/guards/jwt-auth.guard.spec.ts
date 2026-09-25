import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception';
import { RequestContext } from '../../../common/context/request-context';
import { PERMISSIONS_KEY } from '../../rbac/decorators/permissions.metadata';
import { authError, AuthErrorCode, tokenExpired } from '../auth.errors';
import type { AuthUser } from '../auth.types';
import { Public } from '../decorators/public.decorator';
import type { AccessAuthService } from '../services/access-auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { HttpStatus, SetMetadata } from '@nestjs/common';

const USER: AuthUser = {
  id: 'u1',
  email: 'u1@example.com',
  displayName: 'U1',
  locale: 'ar',
  emailVerified: true,
  sessionId: 's1',
  roles: ['user'],
  permissions: [],
};

class Routes {
  @Public() open() {}
  closed() {}
  @SetMetadata(PERMISSIONS_KEY, { permissions: ['x.y'], mode: 'all' }) guardedAdmin() {}
}
@Public()
class PublicController {
  anything() {}
}

type Req = {
  headers: Record<string, string>;
  originalUrl: string;
  method: string;
  user?: AuthUser;
};

function context(handler: () => void, cls: object, req: Req): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(authenticate: (token: string) => Promise<AuthUser>) {
  const access = { authenticate: jest.fn(authenticate) };
  return {
    guard: new JwtAuthGuard(new Reflector(), access as unknown as AccessAuthService),
    access,
  };
}

const req = (path: string, token?: string): Req => ({
  headers: token ? { authorization: `Bearer ${token}` } : {},
  originalUrl: path,
  method: 'GET',
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppException) return `${err.getStatus()} ${err.code}`;
    throw err;
  }
  return 'passed';
}

describe('JwtAuthGuard', () => {
  const proto = Routes.prototype;

  it('lets guests through @Public routes (method or class level)', async () => {
    const { guard, access } = makeGuard(() => Promise.resolve(USER));
    await expect(guard.canActivate(context(proto.open, Routes, req('/api/v1/x')))).resolves.toBe(
      true,
    );
    await expect(
      guard.canActivate(
        context(PublicController.prototype.anything, PublicController, req('/api/v1/y')),
      ),
    ).resolves.toBe(true);
    expect(access.authenticate).not.toHaveBeenCalled();
  });

  it('attaches the user on public routes when the token is valid, ignores bad tokens', async () => {
    const { guard } = makeGuard((t) =>
      t === 'good' ? Promise.resolve(USER) : Promise.reject(tokenExpired()),
    );
    const good = req('/api/v1/x', 'good');
    await guard.canActivate(context(proto.open, Routes, good));
    expect(good.user).toBe(USER);
    const bad = req('/api/v1/x', 'expired');
    await expect(guard.canActivate(context(proto.open, Routes, bad))).resolves.toBe(true);
    expect(bad.user).toBeUndefined();
  });

  it('requires a token everywhere else (401 UNAUTHORIZED) and propagates TOKEN_EXPIRED', async () => {
    const { guard } = makeGuard((t) =>
      t === 'good' ? Promise.resolve(USER) : Promise.reject(tokenExpired()),
    );
    expect(await code(guard.canActivate(context(proto.closed, Routes, req('/api/v1/me'))))).toBe(
      '401 UNAUTHORIZED',
    );
    expect(
      await code(guard.canActivate(context(proto.closed, Routes, req('/api/v1/me', 'old')))),
    ).toBe('401 TOKEN_EXPIRED');
    const ok = req('/api/v1/me', 'good');
    await RequestContext.run({ requestId: 'r1', lang: 'en', market: 'EG' }, async () => {
      await expect(guard.canActivate(context(proto.closed, Routes, ok))).resolves.toBe(true);
      expect(RequestContext.get()).toMatchObject({ userId: 'u1', userLabel: 'u1@example.com' });
    });
    expect(ok.user).toBe(USER);
  });

  it('propagates revoked-session / disabled-account errors', async () => {
    const { guard } = makeGuard(() =>
      Promise.reject(authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.SESSION_REVOKED)),
    );
    expect(
      await code(guard.canActivate(context(proto.closed, Routes, req('/api/v1/me', 't')))),
    ).toBe('401 SESSION_REVOKED');
  });

  it('fails closed on admin routes without declared permissions', async () => {
    const { guard } = makeGuard(() => Promise.resolve(USER));
    expect(
      await code(
        guard.canActivate(context(proto.closed, Routes, req('/api/v1/admin/things?x=1', 't'))),
      ),
    ).toBe('403 ADMIN_ROUTE_WITHOUT_PERMISSION');
    await expect(
      guard.canActivate(context(proto.guardedAdmin, Routes, req('/api/v1/admin/things', 't'))),
    ).resolves.toBe(true);
    // Only the /api/v1/admin prefix counts.
    await expect(
      guard.canActivate(context(proto.closed, Routes, req('/api/v1/administrators', 't'))),
    ).resolves.toBe(true);
  });

  it('ignores non-HTTP contexts', async () => {
    const { guard } = makeGuard(() => Promise.resolve(USER));
    const rpc = { getType: () => 'rpc' } as unknown as ExecutionContext;
    await expect(guard.canActivate(rpc)).resolves.toBe(true);
  });
});
