import { describe, expect, it } from 'vitest';
import { json, mockFetch } from '@/test/mockFetch';
import { fetchAllRows, metaOf, rowsOf } from './listResponse';

describe('list helpers', () => {
  it('fetches every page of a paginated reference list', async () => {
    const m = mockFetch({
      'GET /admin/markets': (call) => {
        const page = Number(call.search.get('page') ?? '1');
        return json(200, {
          data: [{ code: `M${page}` }],
          meta: { page, pageSize: 1, total: 3, totalPages: 3 },
        });
      },
    });
    const rows = await fetchAllRows<{ code: string }>('/admin/markets');
    expect(rows.map((r) => r.code)).toEqual(['M1', 'M2', 'M3']);
    expect(m.calls[0]!.search.toString()).toBe('');
    expect(m.calls[1]!.search.get('page')).toBe('2');
  });

  it('works with non-paginated `{ data: [] }` responses', async () => {
    mockFetch({ 'GET /admin/roles': json(200, { data: [{ key: 'owner' }] }) });
    await expect(fetchAllRows('/admin/roles')).resolves.toEqual([{ key: 'owner' }]);
    expect(rowsOf({ data: 'nope' })).toEqual([]);
    expect(metaOf(undefined, 2)).toEqual({ page: 1, pageSize: 2, total: 2, totalPages: 1 });
  });
});
