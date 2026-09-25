import { computeAuditDiff, MAX_AUDIT_JSON_BYTES, REDACTED, toAuditJson } from './audit-redact';
import { deriveAuditNames } from './audit.interceptor';

describe('toAuditJson', () => {
  it('redacts secrets at any depth and keeps other data', () => {
    expect(
      toAuditJson({
        name: 'x',
        password: 'hunter2',
        nested: { refreshToken: 'abc', apiKey: 'k', passwordHash: 'h', ok: 1 },
        list: [{ secret: 's', value: 2 }],
      }),
    ).toEqual({
      name: 'x',
      password: REDACTED,
      nested: { refreshToken: REDACTED, apiKey: REDACTED, passwordHash: REDACTED, ok: 1 },
      list: [{ secret: REDACTED, value: 2 }],
    });
  });

  it('serializes dates, bigints, buffers and non-finite numbers safely', () => {
    const d = new Date('2026-09-25T10:00:00.000Z');
    expect(
      toAuditJson({ d, big: 12n, buf: Buffer.from('abc'), nan: Number.NaN, u: undefined }),
    ).toEqual({ d: '2026-09-25T10:00:00.000Z', big: '12', buf: '[binary 3 bytes]', nan: null });
    expect(toAuditJson(undefined)).toBeUndefined();
    expect(toAuditJson(null)).toBeNull();
  });

  it('replaces oversized payloads with a marker', () => {
    const big = { text: 'x'.repeat(MAX_AUDIT_JSON_BYTES + 10) };
    expect(toAuditJson(big)).toEqual({ truncated: true, bytes: expect.any(Number) });
  });
});

describe('computeAuditDiff', () => {
  it('lists changed, added and removed fields', () => {
    expect(
      computeAuditDiff(
        { a: 1, b: [1, 2], c: 'same', gone: true },
        { a: 2, b: [1, 2], c: 'same', added: 'x' },
      ),
    ).toEqual({
      a: { from: 1, to: 2 },
      gone: { from: true, to: null },
      added: { from: null, to: 'x' },
    });
  });

  it('is undefined without two objects or without changes', () => {
    expect(computeAuditDiff(undefined, { a: 1 })).toBeUndefined();
    expect(computeAuditDiff({ a: 1 }, [1])).toBeUndefined();
    expect(computeAuditDiff({ a: 1 }, { a: 1 })).toBeUndefined();
  });
});

describe('deriveAuditNames', () => {
  it.each([
    ['PUT', '/api/v1/admin/users/:id/roles', 'users.roles.update', 'users'],
    ['POST', '/api/v1/admin/articles', 'articles.create', 'articles'],
    ['PATCH', '/api/v1/admin/articles/:id', 'articles.update', 'articles'],
    ['DELETE', '/api/v1/admin/stations/:id/points/:pointId', 'stations.points.delete', 'stations'],
    ['POST', '/api/v1/admin/articles/:id/publish', 'articles.publish.create', 'articles'],
  ])('%s %s → %s', (method, path, action, entityType) => {
    expect(deriveAuditNames(method, path)).toEqual({ action, entityType });
  });
});
