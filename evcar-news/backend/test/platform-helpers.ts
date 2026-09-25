/**
 * Helpers of the platform e2e specs (settings, markets, i18n, system).
 * Users are created directly in the database (argon2id hash) and log in
 * through the contract endpoint POST /api/v1/auth/login.
 */
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { TestApp } from './utils/test-app';

export const PLATFORM_PASSWORD = 'Platform-Test-2026!';

export interface PlatformUser {
  id: string;
  email: string;
  token: string;
  auth: { Authorization: string };
}

export async function userWithRoles(t: TestApp, roles: string[]): Promise<PlatformUser> {
  const email = `platform.${roles.join('-') || 'none'}.${randomBytes(4).toString('hex')}@example.com`;
  const user = await t.prisma.user.create({
    data: {
      email,
      displayName: `Platform ${roles.join(' ')}`,
      passwordHash: await argon2.hash(PLATFORM_PASSWORD, { type: argon2.argon2id }),
      emailVerifiedAt: new Date(),
      locale: 'en',
    },
  });
  for (const key of roles) {
    const role = await t.prisma.role.findUniqueOrThrow({ where: { key } });
    await t.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  const res = await t
    .http()
    .post('/api/v1/auth/login')
    .send({ email, password: PLATFORM_PASSWORD, deviceName: 'platform-e2e' });
  if (res.status !== 200) {
    throw new Error(`login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const token = (res.body as { data: { accessToken: string } }).data.accessToken;
  return { id: user.id, email, token, auth: { Authorization: `Bearer ${token}` } };
}

/** Latest audit row for an action (the interceptor writes after the response). */
export async function waitForAudit(
  t: TestApp,
  action: string,
  timeoutMs = 3_000,
): Promise<{
  action: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  actorId: string | null;
}> {
  const started = Date.now();
  for (;;) {
    const row = await t.prisma.auditLog.findFirst({
      where: { action },
      orderBy: { createdAt: 'desc' },
    });
    if (row) return row;
    if (Date.now() - started > timeoutMs) throw new Error(`no audit row for ${action}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
