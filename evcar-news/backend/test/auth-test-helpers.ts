/**
 * Helpers shared by the auth-/users-/rbac-/audit- e2e specs.
 */
import * as argon2 from 'argon2';
import type { Response } from 'supertest';
import { ARGON2_OPTIONS } from '../src/modules/auth/services/password.service';
import { AuthMailService, type OutgoingMail } from '../src/modules/auth/services/auth-mail.service';
import type { TestApp } from './utils/test-app';

export const STRONG_PASSWORD = 'Volt-Charge-2026!';

export interface MailBox {
  messages: OutgoingMail[];
  /** Waits for the n-th (default: next unseen) mail to `to` with `template`. */
  waitFor: (to: string, template: string, timeoutMs?: number) => Promise<OutgoingMail>;
  tokenOf: (mail: OutgoingMail) => string;
  restore: () => void;
}

/**
 * Captures outgoing auth e-mails (AuthMailService.sendNow) instead of
 * sending them. Mail is dispatched asynchronously after the response, so
 * use waitFor().
 */
export function captureMail(t: TestApp): MailBox {
  const messages: OutgoingMail[] = [];
  const consumed = new Set<OutgoingMail>();
  const service = t.app.get(AuthMailService);
  const spy = jest.spyOn(service, 'sendNow').mockImplementation((mail) => {
    messages.push(mail);
    return Promise.resolve();
  });
  return {
    messages,
    async waitFor(to, template, timeoutMs = 5_000) {
      const started = Date.now();
      for (;;) {
        const found = messages.find(
          (m) => m.to === to && m.template === template && !consumed.has(m),
        );
        if (found) {
          consumed.add(found);
          return found;
        }
        if (Date.now() - started > timeoutMs) {
          throw new Error(`No ${template} mail to ${to} within ${timeoutMs} ms`);
        }
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    tokenOf(mail) {
      const match = /token=([A-Za-z0-9_-]+)/.exec(mail.text);
      if (!match) throw new Error(`No token in mail ${mail.template}`);
      return match[1];
    },
    restore: () => spy.mockRestore(),
  };
}

let seq = 0;
/** Unique e-mail per call (tests share one database per spec file). */
export function uniqueEmail(prefix = 'user'): string {
  seq += 1;
  return `${prefix}.${Date.now().toString(36)}.${seq}@example.com`;
}

export interface LoggedIn {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

/** Creates a verified account with the given roles directly in the database. */
export async function createUser(
  t: TestApp,
  opts: {
    email?: string;
    password?: string;
    roles?: string[];
    displayName?: string;
    verified?: boolean;
  } = {},
): Promise<{ id: string; email: string; password: string }> {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? STRONG_PASSWORD;
  const roles = opts.roles ?? ['user'];
  const user = await t.prisma.user.create({
    data: {
      email,
      displayName: opts.displayName ?? email.split('@')[0],
      passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      locale: 'en',
    },
  });
  for (const key of roles) {
    const role = await t.prisma.role.findUniqueOrThrow({ where: { key } });
    await t.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, email, password };
}

/** POST /auth/login (mobile mode) and returns the tokens. */
export async function login(
  t: TestApp,
  email: string,
  password: string = STRONG_PASSWORD,
  deviceName = 'jest',
): Promise<LoggedIn> {
  const res = await t
    .http()
    .post('/api/v1/auth/login')
    .send({ email, password, deviceName })
    .expect(200);
  const { accessToken, refreshToken, user } = res.body.data as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as {
    sid: string;
  };
  return { userId: user.id, email, accessToken, refreshToken, sessionId: payload.sid };
}

/** Creates a verified user with roles and logs in. */
export async function createAndLogin(
  t: TestApp,
  roles: string[] = ['user'],
  email?: string,
): Promise<LoggedIn> {
  const u = await createUser(t, { roles, email });
  return login(t, u.email, u.password);
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Extracts the evcar_rt cookie value from a response (undefined when absent). */
export function refreshCookieOf(res: Response): { value: string; attributes: string } | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = list.find((c) => c.startsWith('evcar_rt='));
  if (!cookie) return undefined;
  const [pair, ...attrs] = cookie.split(';');
  return { value: decodeURIComponent(pair.slice('evcar_rt='.length)), attributes: attrs.join(';') };
}
