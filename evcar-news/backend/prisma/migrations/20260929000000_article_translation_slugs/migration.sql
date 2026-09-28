-- Per-language article slugs (backend-articles.md §12): each translation may
-- carry its own slug (e.g. an Arabic slug for the Arabic text). NULL until the
-- service generates it; unique across translations; lower-case, no
-- spaces or URL delimiters, single inner hyphens (the service enforces the
-- exact letters/digits rule of articles.slug).

ALTER TABLE "article_translations" ADD COLUMN "slug" VARCHAR(200);

CREATE UNIQUE INDEX "article_translations_slug_key" ON "article_translations"("slug");

ALTER TABLE "article_translations"
  ADD CONSTRAINT "article_translations_slug_format"
  CHECK ("slug" IS NULL OR ("slug" ~ '^[^-[:space:]/?#%]+(-[^-[:space:]/?#%]+)*$' AND "slug" = lower("slug")));
