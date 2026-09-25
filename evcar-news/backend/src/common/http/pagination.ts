import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** Upper bound for `page` (keeps `skip` far below the 64-bit / safe-integer range). */
export const MAX_PAGE = 1_000_000;

/**
 * Standard page-based query params (page is 1-based). Extend it in module
 * DTOs: `class ListArticlesQuery extends PaginationQueryDto { ... }`.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
  /** Prisma `skip` */
  skip: number;
  /** Prisma `take` */
  take: number;
}

/** Normalizes page params (clamped) and returns Prisma skip/take. */
export function toPageRequest(query: { page?: number; pageSize?: number } = {}): PageRequest {
  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(query.page ?? 1)));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPageMeta(total: number, page: number, pageSize: number): PageMeta {
  return { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
}
