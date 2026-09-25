import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { RequestContext } from '../../common/context/request-context';
import type { Prisma, Translation } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit';
import { I18nService } from './i18n.service';
import {
  CATALOGS,
  catalogHas,
  placeholdersOf,
  SERVER_NAMESPACES,
  type ServerNamespace,
} from './server-messages';
import type {
  CatalogEntryDto,
  CreateTranslationDto,
  PublicTranslationsDto,
  TranslationDto,
  TranslationSort,
} from './translations.dto';

const PUBLIC_CACHE_MS = 60_000;

export function toTranslationView(t: Translation): TranslationDto {
  return {
    id: t.id,
    namespace: t.namespace,
    key: t.key,
    locale: t.locale,
    value: t.value,
    updatedById: t.updatedById,
    updatedAt: t.updatedAt.toISOString(),
  };
}

function isServerNamespace(ns: string): ns is ServerNamespace {
  return (SERVER_NAMESPACES as readonly string[]).includes(ns);
}

/** Admin CRUD of translation overrides + the public override bundle. */
/** Requested order first, then the stable default (namespace, key, locale, id). */
function translationOrder(
  sort: TranslationSort | undefined,
): Prisma.TranslationOrderByWithRelationInput[] {
  const base: Prisma.TranslationOrderByWithRelationInput[] = [
    { namespace: 'asc' },
    { key: 'asc' },
    { locale: 'asc' },
    { id: 'asc' },
  ];
  if (!sort) return base;
  const desc = sort.startsWith('-');
  const field = (desc ? sort.slice(1) : sort) as keyof Prisma.TranslationOrderByWithRelationInput;
  return [{ [field]: desc ? 'desc' : 'asc' }, ...base.filter((o) => !(field in o))];
}

@Injectable()
export class TranslationsService {
  private readonly publicCache = new Map<
    string,
    { at: number; body: PublicTranslationsDto; etag: string }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly audit: AuditService,
  ) {}

  /** Overrides of server messages must name an existing entry and keep its placeholders. */
  private validateServerEntry(namespace: string, key: string, value: string): void {
    if (!isServerNamespace(namespace)) return;
    const fullKey = `${namespace}.${key}`;
    if (!catalogHas(fullKey)) {
      throw this.i18n.error('TRANSLATION_KEY_UNKNOWN', HttpStatus.UNPROCESSABLE_ENTITY, {
        key: fullKey,
      });
    }
    const expected = placeholdersOf(CATALOGS.en[fullKey]);
    const given = placeholdersOf(value);
    if (expected.join(',') !== given.join(',')) {
      throw this.i18n.error(
        'TRANSLATION_PLACEHOLDERS_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { placeholders: expected.length ? expected.map((p) => `{${p}}`).join(' ') : '—' },
        { expected, given },
      );
    }
  }

  private async changed(): Promise<void> {
    this.publicCache.clear();
    await this.i18n.refresh();
  }

  async list(query: {
    namespace?: string;
    locale?: string;
    q?: string;
    sort?: TranslationSort;
    skip: number;
    take: number;
  }): Promise<{ items: TranslationDto[]; total: number }> {
    const where: Prisma.TranslationWhereInput = {
      ...(query.namespace ? { namespace: query.namespace } : {}),
      ...(query.locale ? { locale: query.locale } : {}),
      ...(query.q
        ? {
            OR: [
              { key: { contains: query.q, mode: 'insensitive' } },
              { value: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.translation.findMany({
        where,
        orderBy: translationOrder(query.sort),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.translation.count({ where }),
    ]);
    return { items: rows.map(toTranslationView), total };
  }

  async get(id: string): Promise<TranslationDto> {
    const row = await this.prisma.translation.findUnique({ where: { id } });
    if (!row) throw AppException.notFound();
    return toTranslationView(row);
  }

  async create(dto: CreateTranslationDto): Promise<TranslationDto> {
    const value = dto.value.trim();
    this.validateServerEntry(dto.namespace, dto.key, value);
    const existing = await this.prisma.translation.findUnique({
      where: {
        namespace_key_locale: { namespace: dto.namespace, key: dto.key, locale: dto.locale },
      },
    });
    if (existing)
      throw this.i18n.error('TRANSLATION_EXISTS', HttpStatus.CONFLICT, {}, { id: existing.id });
    const row = await this.prisma.translation.create({
      data: {
        namespace: dto.namespace,
        key: dto.key,
        locale: dto.locale,
        value,
        updatedById: RequestContext.get()?.userId ?? null,
      },
    });
    this.audit.annotate({
      entityType: 'translation',
      entityId: row.id,
      after: toTranslationView(row),
    });
    await this.changed();
    return toTranslationView(row);
  }

  async update(id: string, value: string): Promise<TranslationDto> {
    const before = await this.prisma.translation.findUnique({ where: { id } });
    if (!before) throw AppException.notFound();
    const text = value.trim();
    this.validateServerEntry(before.namespace, before.key, text);
    const row = await this.prisma.translation.update({
      where: { id },
      data: { value: text, updatedById: RequestContext.get()?.userId ?? null },
    });
    this.audit.annotate({
      entityType: 'translation',
      entityId: id,
      before: toTranslationView(before),
      after: toTranslationView(row),
    });
    await this.changed();
    return toTranslationView(row);
  }

  async remove(id: string): Promise<void> {
    const before = await this.prisma.translation.findUnique({ where: { id } });
    if (!before) throw AppException.notFound();
    await this.prisma.translation.delete({ where: { id } });
    this.audit.annotate({
      entityType: 'translation',
      entityId: id,
      before: toTranslationView(before),
    });
    await this.changed();
  }

  /** Server catalog entries with their built-in texts and current overrides. */
  async catalog(namespace?: string): Promise<CatalogEntryDto[]> {
    const namespaces = namespace ? [namespace] : [...SERVER_NAMESPACES];
    const overrides = await this.prisma.translation.findMany({
      where: { namespace: { in: namespaces } },
    });
    const byKey = new Map(overrides.map((o) => [`${o.locale}\u0000${o.namespace}.${o.key}`, o]));
    return Object.keys(CATALOGS.en)
      .filter((fullKey) => namespaces.includes(fullKey.split('.')[0]))
      .map((fullKey) => {
        const dot = fullKey.indexOf('.');
        const ov = (lang: SupportedLanguage) => {
          const o = byKey.get(`${lang}\u0000${fullKey}`);
          return o ? { id: o.id, value: o.value } : null;
        };
        return {
          namespace: fullKey.slice(0, dot),
          key: fullKey.slice(dot + 1),
          ar: CATALOGS.ar[fullKey],
          en: CATALOGS.en[fullKey],
          placeholders: placeholdersOf(CATALOGS.en[fullKey]),
          overrides: { ar: ov('ar'), en: ov('en') },
        };
      });
  }

  /** Public overrides bundle for one language (cached, ETag). */
  async publicBundle(
    lang: SupportedLanguage,
    namespaces?: string[],
  ): Promise<{ body: PublicTranslationsDto; etag: string }> {
    const cacheKey = `${lang}|${(namespaces ?? []).slice().sort().join(',')}`;
    const hit = this.publicCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PUBLIC_CACHE_MS) return hit;
    const rows = await this.prisma.translation.findMany({
      where: { locale: lang, ...(namespaces?.length ? { namespace: { in: namespaces } } : {}) },
      orderBy: [{ namespace: 'asc' }, { key: 'asc' }],
    });
    const grouped: Record<string, Record<string, string>> = {};
    let updatedAt: Date | null = null;
    for (const r of rows) {
      (grouped[r.namespace] ??= {})[r.key] = r.value;
      if (!updatedAt || r.updatedAt > updatedAt) updatedAt = r.updatedAt;
    }
    const body: PublicTranslationsDto = {
      lang,
      namespaces: grouped,
      updatedAt: updatedAt?.toISOString() ?? null,
    };
    const etag = `"tr-${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
    const entry = { at: Date.now(), body, etag };
    this.publicCache.set(cacheKey, entry);
    return entry;
  }
}
