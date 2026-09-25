import { generateShortId, generateToken, hashIp, hashToken, safeEqualHex } from './tokens';

describe('tokens', () => {
  it('generates url-safe random tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('hashes deterministically to 64 hex chars', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(safeEqualHex(hashToken('x'), hashToken('x'))).toBe(true);
    expect(safeEqualHex(hashToken('x'), hashToken('y'))).toBe(false);
    expect(safeEqualHex('ab', 'abcd')).toBe(false);
  });

  it('hashes IPs with a salt', () => {
    expect(hashIp('1.2.3.4', 's1')).not.toBe(hashIp('1.2.3.4', 's2'));
  });

  it('generates short ids from an unambiguous alphabet', () => {
    const id = generateShortId(12);
    expect(id).toHaveLength(12);
    expect(id).not.toMatch(/[01lIoO]/);
  });
});
