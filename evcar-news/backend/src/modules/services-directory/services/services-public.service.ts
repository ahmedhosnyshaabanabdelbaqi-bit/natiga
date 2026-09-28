import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest } from '../../../common/http/pagination';
import { buildPageMeta, type PageMeta } from '../../../common/http/pagination';
import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { isUuid } from '../../articles/common/slug';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../../vehicles';
import {
  evaluateOpenNow,
  weeklyView,
  type OpeningHours,
} from '../../stations/common/opening-hours';
import { notFound } from '../../search/common/discovery-http';
import { escapeLike } from '../../search/common/text-match';
import {
  SERVICE_TYPES,
  contactLabel,
  isStale,
  serviceTypeLabel,
  sponsorLabelOf,
  sponsoredNow,
} from '../common/labels';
import type {
  ServiceListQueryDto,
  ServiceProviderDetailDto,
  ServiceProviderViewDto,
  ServiceTypeCountDto,
} from '../dto/services.dto';

export const PROVIDER_INCLUDE = {
  logo: { include: IMAGE_ASSET_INCLUDE },
  brands: {
    include: {
      brand: {
        select: { id: true, slug: true, nameAr: true, nameEn: true, status: true, deletedAt: true },
      },
    },
  },
} satisfies Prisma.ServiceProviderInclude;
type ProviderRow = Prisma.ServiceProviderGetPayload<{ include: typeof PROVIDER_INCLUDE }>;

const DEFAULT_RADIUS_KM = 50;
const MAX_CANDIDATES = 2000;
const SPONSORED_SLOT = 3;

export interface ServiceListResult {
  data: ServiceProviderViewDto[];
  meta: PageMeta & { sponsored: ServiceProviderViewDto[]; truncated: boolean };
}

interface Candidate {
  id: string;
  distance_m: number | null;
}

/**
 * Public services directory (REQUIREMENTS §15). Editorial order only
 * (distance when a point is given, else verified contacts first, then name);
 * sponsorship never changes it. Sponsored entries are labelled and are
 * additionally offered in the separate `meta.sponsored` slot.
 */
@Injectable()
export class ServicesPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  async list(
    q: ServiceListQueryDto,
    lang: SupportedLanguage,
    market: string,
    now: Date = new Date(),
  ): Promise<ServiceListResult> {
    const page = toPageRequest(q);
    const hasPoint = q.lat !== undefined && q.lng !== undefined;
    const point = hasPoint
      ? Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}::float8, ${q.lat}::float8), 4326)::geography`
      : null;
    const conds: Prisma.Sql[] = [
      Prisma.sql`p."status" = 'published'`,
      Prisma.sql`p."deleted_at" IS NULL`,
      Prisma.sql`p."market_code" = ${market}`,
    ];
    if (q.type) conds.push(Prisma.sql`p."type" = ${q.type}::"service_provider_type"`);
    if (q.city) {
      conds.push(Prisma.sql`app_normalize_text(p."city") = ${normalizeSearchText(q.city)}`);
    }
    if (q.brand) {
      const brandCond = isUuid(q.brand)
        ? Prisma.sql`b."id" = ${q.brand}::uuid`
        : Prisma.sql`b."slug" = ${q.brand.toLowerCase()}`;
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM "service_provider_brands" pb
        JOIN "brands" b ON b."id" = pb."brand_id"
        WHERE pb."provider_id" = p."id" AND ${brandCond})`);
    }
    if (q.q) {
      const n = normalizeSearchText(q.q);
      if (n) {
        conds.push(
          Prisma.sql`app_normalize_text(concat_ws(' ', p."name_ar", p."name_en", p."description_ar", p."description_en", p."city", p."address_ar", p."address_en", array_to_string(p."services", ' '))) LIKE ${`%${escapeLike(n)}%`}`,
        );
      }
    }
    if (point) {
      conds.push(
        Prisma.sql`p."location" IS NOT NULL AND ST_DWithin(p."location", ${point}, ${(q.radiusKm ?? DEFAULT_RADIUS_KM) * 1000})`,
      );
    }
    const nameCol = lang === 'ar' ? Prisma.sql`p."name_ar"` : Prisma.sql`p."name_en"`;
    const order = point
      ? Prisma.sql`distance_m ASC, p."id"`
      : Prisma.sql`(p."contact_verified_at" IS NULL), lower(${nameCol}), p."id"`;
    const candidates = await this.prisma.$queryRaw<Candidate[]>`
      SELECT p."id"::text AS id,
             ${point ? Prisma.sql`ST_Distance(p."location", ${point})` : Prisma.sql`NULL::float8`} AS distance_m
        FROM "service_providers" p
       WHERE ${Prisma.join(conds, ' AND ')}
       ORDER BY ${order}
       LIMIT ${MAX_CANDIDATES + 1}`;
    const truncated = candidates.length > MAX_CANDIDATES;
    let list = candidates.slice(0, MAX_CANDIDATES);

    const tz = await this.timezone(market);
    // openNow / sponsored need the rows; load light fields for all candidates.
    const light = await this.prisma.serviceProvider.findMany({
      where: { id: { in: list.map((c) => c.id) } },
      select: {
        id: true,
        openingHours: true,
        isAlwaysOpen: true,
        isSponsored: true,
        sponsoredUntil: true,
      },
    });
    const lightById = new Map(light.map((l) => [l.id, l]));
    if (q.openNow) {
      list = list.filter((c) => {
        const l = lightById.get(c.id);
        return (
          !!l &&
          evaluateOpenNow(l.openingHours as OpeningHours | null, l.isAlwaysOpen, tz, now).state ===
            'open'
        );
      });
    }
    const total = list.length;
    const pageIds = list.slice(page.skip, page.skip + page.take);
    const sponsoredIds = list
      .filter((c) => {
        const l = lightById.get(c.id);
        return !!l && sponsoredNow(l, now);
      })
      .slice(0, SPONSORED_SLOT);
    const views = await this.views([...pageIds, ...sponsoredIds], lang, tz, now);
    return {
      data: pageIds.map((c) => views.get(c.id)).filter((v): v is ServiceProviderViewDto => !!v),
      meta: {
        ...buildPageMeta(total, page.page, page.pageSize),
        sponsored: sponsoredIds
          .map((c) => views.get(c.id))
          .filter((v): v is ServiceProviderViewDto => !!v),
        truncated,
      },
    };
  }

  async types(lang: SupportedLanguage, market: string): Promise<ServiceTypeCountDto[]> {
    const counts = await this.prisma.serviceProvider.groupBy({
      by: ['type'],
      where: { status: 'published', deletedAt: null, marketCode: market },
      _count: { _all: true },
    });
    const byType = new Map(counts.map((c) => [c.type, c._count._all]));
    return SERVICE_TYPES.map((t) => ({
      type: t,
      label: serviceTypeLabel(t, lang),
      count: byType.get(t) ?? 0,
    }));
  }

  async detail(
    ref: string,
    lang: SupportedLanguage,
    point?: { lat: number; lng: number },
  ): Promise<ServiceProviderDetailDto> {
    const row = await this.prisma.serviceProvider.findFirst({
      where: {
        status: 'published',
        deletedAt: null,
        ...(isUuid(ref) ? { id: ref } : { slug: ref.toLowerCase() }),
      },
      include: PROVIDER_INCLUDE,
    });
    if (!row) {
      throw notFound('SERVICE_PROVIDER_NOT_FOUND', {
        ar: 'مقدم الخدمة غير موجود.',
        en: 'Service provider not found.',
      });
    }
    const tz = await this.timezone(row.marketCode);
    let distance: number | null = null;
    if (point && row.latitude !== null && row.longitude !== null) {
      const [d] = await this.prisma.$queryRaw<{ d: number }[]>`
        SELECT ST_Distance(p."location", ST_SetSRID(ST_MakePoint(${point.lng}::float8, ${point.lat}::float8), 4326)::geography) AS d
          FROM "service_providers" p WHERE p."id" = ${row.id}::uuid`;
      distance = d ? Math.round(Number(d.d)) : null;
    }
    return {
      ...this.view(row, lang, tz, new Date(), distance),
      openingHours: weeklyView(row.openingHours as OpeningHours | null),
      timezone: tz,
    };
  }

  /** Public views by id (favorites / home). */
  async viewsByIds(ids: string[], lang: SupportedLanguage) {
    const rows = await this.prisma.serviceProvider.findMany({
      where: { id: { in: ids }, status: 'published', deletedAt: null },
      include: PROVIDER_INCLUDE,
    });
    const tzs = new Map<string, string>();
    const out = new Map<string, ServiceProviderViewDto>();
    for (const r of rows) {
      if (!tzs.has(r.marketCode)) tzs.set(r.marketCode, await this.timezone(r.marketCode));
      out.set(r.id, this.view(r, lang, tzs.get(r.marketCode)!, new Date(), null));
    }
    return out;
  }

  private async views(
    candidates: Candidate[],
    lang: SupportedLanguage,
    tz: string,
    now: Date,
  ): Promise<Map<string, ServiceProviderViewDto>> {
    const ids = [...new Set(candidates.map((c) => c.id))];
    if (ids.length === 0) return new Map();
    const dist = new Map(candidates.map((c) => [c.id, c.distance_m]));
    const rows = await this.prisma.serviceProvider.findMany({
      where: { id: { in: ids } },
      include: PROVIDER_INCLUDE,
    });
    return new Map(
      rows.map((r) => {
        const d = dist.get(r.id);
        return [
          r.id,
          this.view(r, lang, tz, now, d === null || d === undefined ? null : Math.round(Number(d))),
        ];
      }),
    );
  }

  private async timezone(market: string): Promise<string> {
    const m = await this.prisma.market.findUnique({
      where: { code: market },
      select: { timezone: true },
    });
    return m?.timezone ?? 'UTC';
  }

  view(
    p: ProviderRow,
    lang: SupportedLanguage,
    tz: string,
    now: Date,
    distanceM: number | null,
  ): ServiceProviderViewDto {
    const verifiedAt = p.contactVerifiedAt;
    const stale = isStale(verifiedAt, now);
    const sponsored = sponsoredNow(p, now);
    return {
      id: p.id,
      slug: p.slug,
      type: p.type,
      typeLabel: serviceTypeLabel(p.type, lang),
      name: lang === 'ar' ? p.nameAr : p.nameEn,
      description: (lang === 'ar' ? p.descriptionAr : p.descriptionEn) ?? null,
      marketCode: p.marketCode,
      city: p.city,
      address: (lang === 'ar' ? p.addressAr : p.addressEn) ?? p.addressAr ?? p.addressEn ?? null,
      latitude: p.latitude,
      longitude: p.longitude,
      distanceM,
      contact: {
        phone: p.phone,
        whatsapp: p.whatsapp,
        email: p.email,
        websiteUrl: p.websiteUrl,
        verified: verifiedAt !== null,
        verifiedAt: verifiedAt?.toISOString() ?? null,
        stale,
        label: contactLabel(verifiedAt, stale, lang),
      },
      openNow: evaluateOpenNow(p.openingHours as OpeningHours | null, p.isAlwaysOpen, tz, now)
        .state,
      isAlwaysOpen: p.isAlwaysOpen,
      services: p.services,
      brands: p.brands
        .filter((b) => b.brand.status === 'published' && b.brand.deletedAt === null)
        .map((b) => ({
          id: b.brand.id,
          slug: b.brand.slug,
          name:
            (lang === 'ar' ? b.brand.nameAr : b.brand.nameEn) ??
            b.brand.nameEn ??
            b.brand.nameAr ??
            '',
        })),
      logo: this.media.image(p.logo, lang),
      isSponsored: sponsored,
      sponsorLabel: sponsorLabelOf(p, lang, now),
      isDemo: p.isDemo,
    };
  }
}
