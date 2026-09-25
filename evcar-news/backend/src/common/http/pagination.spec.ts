import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { buildPageMeta, MAX_PAGE, PaginationQueryDto, toPageRequest } from './pagination';
import { ok, paginated } from './responses';

describe('pagination', () => {
  it('computes skip/take with defaults', () => {
    expect(toPageRequest()).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(toPageRequest({ page: 3, pageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });

  it('clamps out-of-range values', () => {
    expect(toPageRequest({ page: 0, pageSize: 1000 })).toMatchObject({ page: 1, pageSize: 100 });
    // Huge pages never produce a skip Prisma cannot represent (was a 500).
    const huge = toPageRequest({ page: 1e20, pageSize: 100 });
    expect(huge.page).toBe(MAX_PAGE);
    expect(Number.isSafeInteger(huge.skip)).toBe(true);
  });

  it('rejects pages above MAX_PAGE in the query DTO (422 instead of a database error)', () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '99999999999999999999' });
    expect(validateSync(dto).map((e) => e.property)).toEqual(['page']);
  });

  it('builds meta', () => {
    expect(buildPageMeta(57, 2, 20)).toEqual({ page: 2, pageSize: 20, total: 57, totalPages: 3 });
    expect(buildPageMeta(0, 1, 20).totalPages).toBe(0);
  });

  it('validates query DTO (strings from the query are converted)', () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '2', pageSize: '50' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, pageSize: 50 });
    const bad = plainToInstance(PaginationQueryDto, { page: '0', pageSize: '101' });
    expect(
      validateSync(bad)
        .map((e) => e.property)
        .sort(),
    ).toEqual(['page', 'pageSize']);
  });

  it('wraps responses', () => {
    expect(ok({ a: 1 })).toEqual({ data: { a: 1 } });
    expect(paginated([1, 2], 2, { page: 1, pageSize: 20 })).toEqual({
      data: [1, 2],
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    });
  });
});
