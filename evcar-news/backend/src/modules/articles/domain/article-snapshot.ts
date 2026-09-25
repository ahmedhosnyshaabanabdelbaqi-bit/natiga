/**
 * Full snapshot of an article's editorial content, stored in
 * article_revisions.snapshot for every saved version (history, compare and
 * "restore previous version"). Workflow fields (status, review, schedule)
 * are not content and are not restored.
 */
export interface TranslationSnapshot {
  title: string;
  summary: string | null;
  bodyHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  isMachineTranslated: boolean;
  humanReviewedAt: string | null;
  humanReviewedById: string | null;
}

export interface VehicleLinkSnapshot {
  brandId: string | null;
  modelId: string | null;
  variantId: string | null;
}

export interface ArticleSnapshot {
  schema: 1;
  slug: string;
  type: string;
  categoryId: string | null;
  authorId: string | null;
  authorName: string | null;
  coverAssetId: string | null;
  originalLanguage: string;
  /** YYYY-MM-DD */
  eventDate: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  isFeatured: boolean;
  isSponsored: boolean;
  sponsorName: string | null;
  allowComments: boolean;
  marketCodes: string[];
  tagIds: string[];
  vehicleLinks: VehicleLinkSnapshot[];
  translations: Partial<Record<string, TranslationSnapshot>>;
}

/** Shape of the article row + relations the snapshot is built from. */
export interface SnapshotSource {
  slug: string;
  type: string;
  categoryId: string | null;
  authorId: string | null;
  authorName: string | null;
  coverAssetId: string | null;
  originalLanguage: string;
  eventDate: Date | null;
  sourceName: string | null;
  sourceUrl: string | null;
  isFeatured: boolean;
  isSponsored: boolean;
  sponsorName: string | null;
  allowComments: boolean;
  markets: Array<{ marketCode: string }>;
  tags: Array<{ tagId: string }>;
  vehicleLinks: Array<{ brandId: string | null; modelId: string | null; variantId: string | null }>;
  translations: Array<{
    locale: string;
    title: string;
    summary: string | null;
    bodyHtml: string;
    seoTitle: string | null;
    seoDescription: string | null;
    isMachineTranslated: boolean;
    humanReviewedAt: Date | null;
    humanReviewedById: string | null;
  }>;
}

export function toDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

const linkKey = (l: VehicleLinkSnapshot) =>
  `${l.brandId ?? ''}|${l.modelId ?? ''}|${l.variantId ?? ''}`;

export function buildSnapshot(a: SnapshotSource): ArticleSnapshot {
  const translations: ArticleSnapshot['translations'] = {};
  for (const t of [...a.translations].sort((x, y) => x.locale.localeCompare(y.locale))) {
    translations[t.locale] = {
      title: t.title,
      summary: t.summary,
      bodyHtml: t.bodyHtml,
      seoTitle: t.seoTitle,
      seoDescription: t.seoDescription,
      isMachineTranslated: t.isMachineTranslated,
      humanReviewedAt: t.humanReviewedAt?.toISOString() ?? null,
      humanReviewedById: t.humanReviewedById,
    };
  }
  return {
    schema: 1,
    slug: a.slug,
    type: a.type,
    categoryId: a.categoryId,
    authorId: a.authorId,
    authorName: a.authorName,
    coverAssetId: a.coverAssetId,
    originalLanguage: a.originalLanguage,
    eventDate: toDateOnly(a.eventDate),
    sourceName: a.sourceName,
    sourceUrl: a.sourceUrl,
    isFeatured: a.isFeatured,
    isSponsored: a.isSponsored,
    sponsorName: a.sponsorName,
    allowComments: a.allowComments,
    marketCodes: a.markets.map((m) => m.marketCode).sort(),
    tagIds: a.tags.map((t) => t.tagId).sort(),
    vehicleLinks: a.vehicleLinks
      .map((l) => ({ brandId: l.brandId, modelId: l.modelId, variantId: l.variantId }))
      .sort((x, y) => linkKey(x).localeCompare(linkKey(y))),
    translations,
  };
}

/** Parses a stored snapshot defensively (older / hand-edited rows). */
export function parseSnapshot(value: unknown): ArticleSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<ArticleSnapshot>;
  if (s.schema !== 1 || typeof s.slug !== 'string' || typeof s.translations !== 'object') {
    return null;
  }
  return {
    ...(s as ArticleSnapshot),
    marketCodes: Array.isArray(s.marketCodes) ? s.marketCodes : [],
    tagIds: Array.isArray(s.tagIds) ? s.tagIds : [],
    vehicleLinks: Array.isArray(s.vehicleLinks) ? s.vehicleLinks : [],
  };
}

export interface FieldChange {
  /** e.g. "categoryId", "translations.en.title", "tagIds" */
  field: string;
  before: unknown;
  after: unknown;
}

const SCALAR_FIELDS = [
  'slug',
  'type',
  'categoryId',
  'authorId',
  'authorName',
  'coverAssetId',
  'originalLanguage',
  'eventDate',
  'sourceName',
  'sourceUrl',
  'isFeatured',
  'isSponsored',
  'sponsorName',
  'allowComments',
] as const;
const LIST_FIELDS = ['marketCodes', 'tagIds', 'vehicleLinks'] as const;
const TRANSLATION_FIELDS: Array<keyof TranslationSnapshot> = [
  'title',
  'summary',
  'bodyHtml',
  'seoTitle',
  'seoDescription',
  'isMachineTranslated',
  'humanReviewedAt',
];

/** Field-level differences between two snapshots (before → after). */
export function diffSnapshots(before: ArticleSnapshot, after: ArticleSnapshot): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const f of SCALAR_FIELDS) {
    if (before[f] !== after[f]) changes.push({ field: f, before: before[f], after: after[f] });
  }
  for (const f of LIST_FIELDS) {
    if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) {
      changes.push({ field: f, before: before[f], after: after[f] });
    }
  }
  const locales = [
    ...new Set([...Object.keys(before.translations), ...Object.keys(after.translations)]),
  ].sort();
  for (const locale of locales) {
    const b = before.translations[locale];
    const a = after.translations[locale];
    if (!b || !a) {
      if (b !== a)
        changes.push({ field: `translations.${locale}`, before: b ?? null, after: a ?? null });
      continue;
    }
    for (const f of TRANSLATION_FIELDS) {
      if (b[f] !== a[f]) {
        changes.push({ field: `translations.${locale}.${f}`, before: b[f], after: a[f] });
      }
    }
  }
  return changes;
}

/** True when reader-visible text (title / summary / body) differs. */
export function textChanged(before: ArticleSnapshot, after: ArticleSnapshot): boolean {
  return diffSnapshots(before, after).some((c) =>
    /^translations\.[a-z]+(\.(title|summary|bodyHtml))?$/.test(c.field),
  );
}

export interface WordDiffSegment {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

/** Word-level diff (LCS). Inputs over `maxWords` words each return null (too large). */
export function wordDiff(before: string, after: string, maxWords = 2000): WordDiffSegment[] | null {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (a.length > maxWords || b.length > maxWords) return null;
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const lcs = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const out: WordDiffSegment[] = [];
  const push = (op: WordDiffSegment['op'], word: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += ` ${word}`;
    else out.push({ op, text: word });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('equal', a[i]);
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      push('delete', a[i++]);
    } else {
      push('insert', b[j++]);
    }
  }
  while (i < n) push('delete', a[i++]);
  while (j < m) push('insert', b[j++]);
  return out;
}
