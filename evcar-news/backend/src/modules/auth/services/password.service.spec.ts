import { AppException } from '../../../common/errors/app.exception';
import { checkPasswordPolicy, PasswordService } from './password.service';

describe('password policy', () => {
  it.each([
    ['Ab1!', 'tooShort'],
    ['x'.repeat(129), 'tooLong'],
    ['        ', 'tooSimple'],
    ['aaaaaaaaaa', 'tooSimple'],
    ['abababababab', 'tooSimple'],
    ['password123', 'tooSimple'],
    ['QWERTY123', 'tooSimple'],
    ['12345678', 'tooSimple'],
  ])('rejects %j (%s)', (password, violation) => {
    expect(checkPasswordPolicy(password)).toBe(violation);
  });

  it('rejects passwords containing the e-mail, its local part or the name', () => {
    const ctx = { email: 'sara.ali@example.com', displayName: 'Sara Ali' };
    expect(checkPasswordPolicy('xx-sara.ali@example.com', ctx)).toBe('personal');
    expect(checkPasswordPolicy('My-sara.ali-2026', ctx)).toBe('personal');
    expect(checkPasswordPolicy('I am SaraAli 99', ctx)).toBe('personal');
  });

  it('accepts long passphrases and ordinary strong passwords, incl. Arabic', () => {
    expect(checkPasswordPolicy('Volt-Charge-2026!')).toBeUndefined();
    expect(checkPasswordPolicy('correct horse battery staple')).toBeUndefined();
    expect(checkPasswordPolicy('سيارة كهربائية ٢٠٢٦')).toBeUndefined();
    expect(checkPasswordPolicy('12345678', { email: 'a@b.co' })).toBe('tooSimple');
  });

  it('counts characters, not UTF-16 code units', () => {
    expect(checkPasswordPolicy('🔋⚡🚗🔌🌍')).toBe('tooShort'); // 5 emoji = 10 code units
  });
});

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and verifies', async () => {
    const hash = await service.hash('Volt-Charge-2026!');
    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(hash).toMatch(/m=19456/);
    expect(hash).toMatch(/t=2/);
    expect(hash).toMatch(/p=1/);
    await expect(service.verify(hash, 'Volt-Charge-2026!')).resolves.toBe(true);
    await expect(service.verify(hash, 'volt-charge-2026!')).resolves.toBe(false);
    expect(service.needsRehash(hash)).toBe(false);
  });

  it('returns false (after doing the same work) when there is no hash', async () => {
    await expect(service.verify(null, 'anything')).resolves.toBe(false);
    await expect(service.verify(undefined, 'anything')).resolves.toBe(false);
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
    await expect(
      service.verify('$argon2id$v=19$m=19456,t=2,p=1$x', 'x'.repeat(5000)),
    ).resolves.toBe(false);
  });

  it('assertPolicy throws 422 VALIDATION_FAILED on the password field', () => {
    try {
      service.assertPolicy('short');
      throw new Error('expected failure');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      const e = err as AppException;
      expect(e.getStatus()).toBe(422);
      expect(e.code).toBe('VALIDATION_FAILED');
      expect(e.details).toEqual([
        { field: 'password', constraints: { 'passwordPolicy.tooShort': expect.any(String) } },
      ]);
    }
  });
});
