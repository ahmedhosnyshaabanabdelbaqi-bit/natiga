import { Injectable, type OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { RequestContext } from '../../../common/context/request-context';
import type { LocalizedText } from '../../../common/i18n/localized-text';
import { fieldError } from '../auth.errors';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const MIN_UNIQUE_CHARS = 4;

/**
 * argon2id parameters (OWASP Password Storage Cheat Sheet minimum:
 * m = 19 MiB, t = 2, p = 1). argon2.verify reads the parameters from the
 * stored hash, so they can be raised later without breaking old hashes
 * (see needsRehash).
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Small blocklist of the most common passwords (NIST 800-63B §5.1.1.2). */
const COMMON_PASSWORDS = new Set(
  [
    'password',
    'password1',
    'password12',
    'password123',
    'passw0rd',
    'p@ssw0rd',
    'p@ssword',
    '12345678',
    '123456789',
    '1234567890',
    '0123456789',
    '87654321',
    '11111111',
    '00000000',
    '12341234',
    '11223344',
    '123123123',
    'qwertyui',
    'qwerty12',
    'qwerty123',
    'qwertyuiop',
    '1q2w3e4r',
    '1qaz2wsx',
    'zaq12wsx',
    'asdfghjk',
    'asdf1234',
    'abcd1234',
    'abc12345',
    'abcdefgh',
    'iloveyou',
    'sunshine',
    'princess',
    'football',
    'baseball',
    'welcome1',
    'welcome123',
    'letmein1',
    'admin123',
    'administrator',
    'changeme',
    'trustno1',
    'superman',
    'starwars',
    'whatever',
    'dragon123',
    'monkey123',
    'master123',
    'computer',
    'internet',
    'evcarnews',
    'evcar123',
    'tesla123',
  ].map((p) => p.toLowerCase()),
);

const MESSAGES = {
  tooShort: {
    ar: `يجب ألا تقل كلمة المرور عن ${PASSWORD_MIN_LENGTH} أحرف.`,
    en: `The password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
  },
  tooLong: {
    ar: `يجب ألا تزيد كلمة المرور عن ${PASSWORD_MAX_LENGTH} حرفًا.`,
    en: `The password must be at most ${PASSWORD_MAX_LENGTH} characters long.`,
  },
  tooSimple: {
    ar: 'كلمة المرور سهلة التخمين. اختر كلمة مرور أقوى.',
    en: 'This password is too easy to guess. Choose a stronger one.',
  },
  personal: {
    ar: 'يجب ألا تحتوي كلمة المرور على بريدك الإلكتروني أو اسمك.',
    en: 'The password must not contain your email address or name.',
  },
} satisfies Record<string, LocalizedText>;

export type PasswordPolicyViolation = keyof typeof MESSAGES;

/**
 * Password policy (NIST-style: length + blocklist + context, no forced
 * character classes). Returns the first violation or undefined.
 */
export function checkPasswordPolicy(
  password: string,
  context: { email?: string; displayName?: string } = {},
): PasswordPolicyViolation | undefined {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return 'tooShort';
  if (length > PASSWORD_MAX_LENGTH) return 'tooLong';
  const lower = password.toLowerCase();
  if (password.trim().length === 0 || new Set(lower).size < MIN_UNIQUE_CHARS) return 'tooSimple';
  if (COMMON_PASSWORDS.has(lower)) return 'tooSimple';
  const email = context.email?.trim().toLowerCase();
  const localPart = email?.split('@')[0];
  const name = context.displayName?.trim().toLowerCase().replace(/\s+/g, '');
  if (email && lower.includes(email)) return 'personal';
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) return 'personal';
  if (name && name.length >= 4 && lower.replace(/\s+/g, '').includes(name)) return 'personal';
  return undefined;
}

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash?: Promise<string>;

  onModuleInit(): void {
    this.getDummyHash().catch(() => undefined);
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /**
   * Verifies `password` against `hash`. When `hash` is null (unknown user,
   * OAuth-only account) a dummy hash is verified instead so the response
   * time does not reveal whether the account exists.
   */
  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    if (password.length > PASSWORD_MAX_LENGTH * 4) {
      await this.burn(password.slice(0, PASSWORD_MAX_LENGTH));
      return false;
    }
    if (!hash) {
      await this.burn(password);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  /** Throws 422 VALIDATION_FAILED on `password` when the policy is not met. */
  assertPolicy(password: string, context: { email?: string; displayName?: string } = {}): void {
    const violation = checkPasswordPolicy(password, context);
    if (violation) {
      throw fieldError(
        'password',
        `passwordPolicy.${violation}`,
        MESSAGES[violation],
        RequestContext.get()?.lang ?? 'en',
      );
    }
  }

  private async burn(password: string): Promise<void> {
    try {
      await argon2.verify(await this.getDummyHash(), password);
    } catch {
      // ignore
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash('evcar-dummy-password-for-timing', ARGON2_OPTIONS);
    return this.dummyHash;
  }
}
