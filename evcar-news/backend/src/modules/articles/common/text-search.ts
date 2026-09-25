import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

const MAX_MATCHES = 5000;

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Ids of articles whose title / summary (and optionally body text) contain
 * `q`, compared with the SQL `app_normalize_text()` used by the search index
 * (Arabic letter variants, diacritics, tatweel, case). `servableOnly`
 * ignores unreviewed machine translations (public search).
 */
export async function articleIdsMatching(
  prisma: PrismaService,
  q: string,
  opts: { includeBody?: boolean; servableOnly?: boolean } = {},
): Promise<string[]> {
  const pattern = likePattern(q.trim());
  const text = opts.includeBody
    ? Prisma.sql`concat_ws(' ', t."title", t."summary", t."body_text")`
    : Prisma.sql`concat_ws(' ', t."title", t."summary")`;
  const servable = opts.servableOnly
    ? Prisma.sql`AND (NOT t."is_machine_translated" OR t."human_reviewed_at" IS NOT NULL)`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ article_id: string }>>`
    SELECT DISTINCT t."article_id"::text AS article_id
      FROM "article_translations" t
      JOIN "articles" a ON a."id" = t."article_id"
     WHERE (app_normalize_text(${text}) LIKE app_normalize_text(${pattern}) ESCAPE '\\'
            OR a."slug" LIKE lower(${pattern}) ESCAPE '\\')
       ${servable}
     LIMIT ${MAX_MATCHES}`;
  return rows.map((r) => r.article_id);
}
