import { describe, expect, it } from 'vitest';
import { safeNextPath } from './redirects';

describe('safeNextPath', () => {
  it('keeps in-app paths with their query', () => {
    expect(safeNextPath('/users?tab=roles')).toBe('/users?tab=roles');
  });
  it('rejects open redirects and auth pages', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/login?next=/x')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });
});
