import { describe, expect, it } from 'vitest';
import { formatSort, parseSort } from './tableState';

describe('sort param', () => {
  it('round-trips field and direction', () => {
    expect(parseSort('-createdAt')).toEqual({ field: 'createdAt', direction: 'desc' });
    expect(parseSort('email')).toEqual({ field: 'email', direction: 'asc' });
    expect(formatSort({ field: 'createdAt', direction: 'desc' })).toBe('-createdAt');
    expect(formatSort(null)).toBeUndefined();
  });
  it('rejects unsafe field names', () => {
    expect(parseSort('-name;drop')).toBeNull();
    expect(parseSort('')).toBeNull();
  });
});
