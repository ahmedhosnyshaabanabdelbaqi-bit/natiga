import { describe, expect, it } from 'vitest';
import { checkPermissions, hasPermission, isStaff } from './permissions';

describe('hasPermission', () => {
  it('matches exact permissions', () => {
    expect(hasPermission(['users.manage'], 'users.manage')).toBe(true);
    expect(hasPermission(['users.read'], 'users.manage')).toBe(false);
  });

  it('treats a granted "*" as all permissions', () => {
    expect(hasPermission(['*'], 'anything.at_all')).toBe(true);
  });

  it('supports granted resource wildcards', () => {
    expect(hasPermission(['articles.*'], 'articles.publish')).toBe(true);
    expect(hasPermission(['articles.*'], 'vehicles.write')).toBe(false);
  });

  it('supports required prefixes (any action on a resource)', () => {
    expect(hasPermission(['articles.create'], 'articles.*')).toBe(true);
    expect(hasPermission(['article.create'], 'articles.*')).toBe(false);
    expect(hasPermission(['articlesx.read'], 'articles.*')).toBe(false);
  });
});

describe('checkPermissions', () => {
  it('passes without a requirement', () => {
    expect(checkPermissions([], undefined)).toBe(true);
  });
  it('anyOf needs one, allOf needs all', () => {
    expect(checkPermissions(['a.read'], { anyOf: ['a.read', 'b.read'] })).toBe(true);
    expect(checkPermissions(['c.read'], { anyOf: ['a.read', 'b.read'] })).toBe(false);
    expect(checkPermissions(['a.read'], { allOf: ['a.read', 'b.read'] })).toBe(false);
    expect(checkPermissions(['a.read', 'b.read'], { allOf: ['a.read', 'b.read'] })).toBe(true);
    expect(checkPermissions(['a.read', 'b.read'], { anyOf: ['z.read'], allOf: ['a.read'] })).toBe(
      false,
    );
  });
  it('handles missing permission lists', () => {
    expect(checkPermissions(null, { anyOf: ['a.read'] })).toBe(false);
  });
});

describe('isStaff', () => {
  it('is false for plain app users', () => {
    expect(isStaff(['user'])).toBe(false);
    expect(isStaff([])).toBe(false);
    expect(isStaff(['user', 'editor'])).toBe(true);
  });
});
