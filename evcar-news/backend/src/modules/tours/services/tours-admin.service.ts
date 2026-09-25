import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { toPageRequest, type PageRequest } from '../../../common/http/pagination';
import { Prisma } from '../../../generated/prisma/client';
import {
  ContentStatus,
  DriveSide,
  HotspotType,
  MediaKind,
  MediaStatus,
  ScenePosition,
  TourMatchType,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import {
  ADMIN_ASSET_INCLUDE,
  licenseValidity,
  MediaAssetsService,
  visualCheckOf,
} from '../../media';
import { PUBLIC_VARIANT_WHERE } from '../../vehicles';
import { slugify, toPlainText } from '../domain/plain-text';
import {
  evaluateReadiness,
  type Readiness,
  type ReadinessAsset,
  type ReadinessIssue,
} from '../domain/tour-readiness';
import type {
  AdminHotspotDto,
  AdminSceneDto,
  AdminTourDetailDto,
  AdminTourDto,
  AdminTourListQueryDto,
  AdminVariantRefDto,
  CreateHotspotDto,
  CreateSceneDto,
  CreateTourDto,
  HotspotTextsDto,
  TourReadinessDto,
  UpdateHotspotDto,
  UpdateSceneDto,
  UpdateTourDto,
} from '../dto/admin-tour.dto';
import { issueView, TourErrors, tourFieldError } from '../tours-errors';

export const TOUR_EVENTS = {
  PUBLISHED: 'tour.published',
  UNPUBLISHED: 'tour.unpublished',
} as const;

export interface TourEvent {
  tourId: string;
  variantId: string;
  marketCode: string;
  from: string;
  to: string;
}

const VARIANT_REF_SELECT = {
  id: true,
  slug: true,
  nameAr: true,
  nameEn: true,
  status: true,
  modelYearId: true,
  modelYear: {
    select: {
      year: true,
      generation: {
        select: {
          model: {
            select: {
              nameAr: true,
              nameEn: true,
              brand: { select: { nameAr: true, nameEn: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.VehicleVariantSelect;

type VariantRefRow = Prisma.VehicleVariantGetPayload<{ select: typeof VARIANT_REF_SELECT }>;

const TOUR_INCLUDE = {
  variant: { select: VARIANT_REF_SELECT },
  referenceVariant: { select: VARIANT_REF_SELECT },
  _count: { select: { scenes: true } },
} satisfies Prisma.InteriorTourInclude;

const HOTSPOT_INCLUDE = {
  translations: true,
  mediaAsset: { include: { license: true } },
} satisfies Prisma.SceneHotspotInclude;

const TOUR_DETAIL_INCLUDE = {
  ...TOUR_INCLUDE,
  scenes: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      asset: { include: ADMIN_ASSET_INCLUDE },
      hotspots: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: HOTSPOT_INCLUDE,
      },
    },
  },
} satisfies Prisma.InteriorTourInclude;

type TourRow = Prisma.InteriorTourGetPayload<{ include: typeof TOUR_INCLUDE }>;
type TourDetailRow = Prisma.InteriorTourGetPayload<{ include: typeof TOUR_DETAIL_INCLUDE }>;
type SceneRow = TourDetailRow['scenes'][number];
type HotspotRow = SceneRow['hotspots'][number];

type Tx = Prisma.TransactionClient;

const num = (d: Prisma.Decimal | number | null | undefined): number | null =>
  d === null || d === undefined ? null : Number(d);

/** Fields that bind a tour to what it shows (locked while published). */
const BINDING_FIELDS = [
  'variantId',
  'marketCode',
  'driveSide',
  'interiorColorNameEn',
  'interiorColorNameAr',
  'matchType',
  'referenceVariantId',
  'differenceNoteAr',
  'differenceNoteEn',
] as const;

/** Reference-tour fields whose change withdraws an earlier approval. */
const APPROVAL_FIELDS = [
  'variantId',
  'matchType',
  'referenceVariantId',
  'differenceNoteAr',
  'differenceNoteEn',
] as const;

const blank = (v: string | null | undefined): string | null =>
  v === undefined || v === null || v.trim() === '' ? null : v.trim();

function readinessAsset(a: {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  deletedAt: Date | null;
  licenseId: string | null;
  license: { validFrom: Date | null; validUntil: Date | null } | null;
  metadata: Prisma.JsonValue;
  multiresConfig?: Prisma.JsonValue | null;
}): ReadinessAsset {
  return {
    id: a.id,
    kind: a.kind,
    status: a.status,
    deleted: a.deletedAt !== null,
    licensed: a.licenseId !== null,
    licenseValidity: a.license ? licenseValidity(a.license) : null,
    visualCheckConfirmed: visualCheckOf(a) !== null,
    hasTiles: a.multiresConfig !== null && a.multiresConfig !== undefined,
  };
}

/**
 * Admin side of 360° interior tours (REQUIREMENTS §8–9): CRUD of tours
 * (bound to trim + market + drive side + interior colour), scenes (one
 * panorama per seat position, default view, first scene) and hotspots
 * (plain ar/en texts, detail image, licensed video, spec link, scene link);
 * the workflow draft → in_review → published → archived with editor
 * approval of reference tours; publication only when evaluateReadiness()
 * finds no problem (the database re-checks files, licences, approval and
 * market). Every change is audited (AuditInterceptor + annotations).
 */
@Injectable()
export class ToursAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaAssetsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ------------------------------------------------------------------ views

  private variantRef(v: VariantRefRow): AdminVariantRefDto {
    const model = v.modelYear.generation.model;
    return {
      id: v.id,
      slug: v.slug,
      nameAr: v.nameAr,
      nameEn: v.nameEn,
      modelYearId: v.modelYearId,
      year: v.modelYear.year,
      modelNameAr: model.nameAr,
      modelNameEn: model.nameEn,
      brandNameAr: model.brand.nameAr,
      brandNameEn: model.brand.nameEn,
      status: v.status,
    };
  }

  view(t: TourRow): AdminTourDto {
    return {
      id: t.id,
      slug: t.slug,
      status: t.status,
      matchType: t.matchType,
      variant: this.variantRef(t.variant),
      referenceVariant: t.referenceVariant ? this.variantRef(t.referenceVariant) : null,
      marketCode: t.marketCode,
      driveSide: t.driveSide,
      interiorColorNameAr: t.interiorColorNameAr,
      interiorColorNameEn: t.interiorColorNameEn,
      interiorColorHex: t.interiorColorHex,
      titleAr: t.titleAr,
      titleEn: t.titleEn,
      descriptionAr: t.descriptionAr,
      descriptionEn: t.descriptionEn,
      differenceNoteAr: t.differenceNoteAr,
      differenceNoteEn: t.differenceNoteEn,
      approvedAt: t.approvedAt?.toISOString() ?? null,
      approvedById: t.approvedById,
      reviewNote: t.reviewNote,
      initialSceneId: t.initialSceneId,
      publishedAt: t.publishedAt?.toISOString() ?? null,
      sceneCount: t._count.scenes,
      isDemo: t.isDemo,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      deletedAt: t.deletedAt?.toISOString() ?? null,
    };
  }

  hotspotView(h: HotspotRow): AdminHotspotDto {
    const text = (locale: string) => {
      const t = h.translations.find((x) => x.locale === locale);
      return t ? { title: t.title, body: t.body } : null;
    };
    return {
      id: h.id,
      sceneId: h.sceneId,
      type: h.type,
      yaw: Number(h.yaw),
      pitch: Number(h.pitch),
      targetSceneId: h.targetSceneId,
      targetYaw: num(h.targetYaw),
      targetPitch: num(h.targetPitch),
      mediaAssetId: h.mediaAssetId,
      specKey: h.specKey,
      iconKey: h.iconKey,
      sortOrder: h.sortOrder,
      texts: { ar: text('ar'), en: text('en') },
    };
  }

  sceneView(s: SceneRow, initialSceneId: string | null): AdminSceneDto {
    return {
      id: s.id,
      key: s.key,
      position: s.position,
      titleAr: s.titleAr,
      titleEn: s.titleEn,
      sortOrder: s.sortOrder,
      initialYaw: Number(s.initialYaw),
      initialPitch: Number(s.initialPitch),
      initialHfov: Number(s.initialHfov),
      minHfov: num(s.minHfov),
      maxHfov: num(s.maxHfov),
      minPitch: num(s.minPitch),
      maxPitch: num(s.maxPitch),
      northOffset: num(s.northOffset),
      isInitial: s.id === initialSceneId,
      asset: this.media.view(s.asset),
      hotspots: s.hotspots.map((h) => this.hotspotView(h)),
    };
  }

  private readinessView(r: Readiness): TourReadinessDto {
    return {
      publishable: r.publishable,
      problems: r.problems.map(issueView),
      warnings: r.warnings.map(issueView),
    };
  }

  // ------------------------------------------------------------------ loading

  private async loadRow(id: string, db: Tx | PrismaService = this.prisma): Promise<TourRow> {
    const t = await db.interiorTour.findUnique({ where: { id }, include: TOUR_INCLUDE });
    if (!t || t.deletedAt) throw TourErrors.notFound();
    return t;
  }

  private async loadDetailRow(id: string): Promise<TourDetailRow> {
    const t = await this.prisma.interiorTour.findUnique({
      where: { id },
      include: TOUR_DETAIL_INCLUDE,
    });
    if (!t || t.deletedAt) throw TourErrors.notFound();
    return t;
  }

  async readiness(t: TourDetailRow): Promise<Readiness> {
    const [variantMarket, variantPublic, other] = await Promise.all([
      this.prisma.variantMarket.findUnique({
        where: { variantId_marketCode: { variantId: t.variantId, marketCode: t.marketCode } },
        select: { availability: true, driveSide: true },
      }),
      this.prisma.vehicleVariant.count({ where: { id: t.variantId, ...PUBLIC_VARIANT_WHERE } }),
      this.prisma.interiorTour.findFirst({
        where: {
          id: { not: t.id },
          variantId: t.variantId,
          marketCode: t.marketCode,
          driveSide: t.driveSide,
          interiorColorNameEn: t.interiorColorNameEn,
          status: ContentStatus.published,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);
    return evaluateReadiness({
      tour: {
        matchType: t.matchType,
        approved: t.approvedAt !== null && t.approvedById !== null,
        differenceNoteAr: t.differenceNoteAr,
        differenceNoteEn: t.differenceNoteEn,
        initialSceneId: t.initialSceneId,
        driveSide: t.driveSide,
      },
      variantMarket: variantMarket
        ? { availability: variantMarket.availability, driveSide: variantMarket.driveSide }
        : null,
      variantPublic: variantPublic > 0,
      scenes: t.scenes.map((s) => ({ id: s.id, key: s.key, asset: readinessAsset(s.asset) })),
      hotspots: t.scenes.flatMap((s) =>
        s.hotspots.map((h) => ({
          id: h.id,
          sceneId: s.id,
          type: h.type,
          locales: h.translations.map((x) => x.locale),
          media: h.mediaAsset ? readinessAsset(h.mediaAsset) : null,
        })),
      ),
      otherPublishedTourId: other?.id ?? null,
    });
  }

  async detail(id: string): Promise<AdminTourDetailDto> {
    const t = await this.loadDetailRow(id);
    return {
      ...this.view(t),
      scenes: t.scenes.map((s) => this.sceneView(s, t.initialSceneId)),
      readiness: this.readinessView(await this.readiness(t)),
    };
  }

  async readinessOf(id: string): Promise<TourReadinessDto> {
    return this.readinessView(await this.readiness(await this.loadDetailRow(id)));
  }

  async list(
    query: AdminTourListQueryDto,
  ): Promise<{ items: AdminTourDto[]; total: number; page: PageRequest }> {
    const page = toPageRequest(query);
    const where: Prisma.InteriorTourWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.variantId) where.variantId = query.variantId;
    if (query.modelYearId) where.variant = { modelYearId: query.modelYearId };
    if (query.marketCode) where.marketCode = query.marketCode;
    if (query.status) where.status = query.status as ContentStatus;
    if (query.matchType) where.matchType = query.matchType as TourMatchType;
    if (query.isDemo !== undefined) where.isDemo = query.isDemo;
    if (query.q) {
      where.OR = [
        { slug: { contains: query.q.toLowerCase() } },
        { titleAr: { contains: query.q, mode: 'insensitive' } },
        { titleEn: { contains: query.q, mode: 'insensitive' } },
        { interiorColorNameAr: { contains: query.q, mode: 'insensitive' } },
        { interiorColorNameEn: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.interiorTour.findMany({
        where,
        include: TOUR_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.interiorTour.count({ where }),
    ]);
    return { items: rows.map((r) => this.view(r)), total, page };
  }

  // ------------------------------------------------------------------ tours

  private async assertVariant(id: string, field: string): Promise<{ slug: string }> {
    const v = await this.prisma.vehicleVariant.findUnique({
      where: { id },
      select: { slug: true, deletedAt: true },
    });
    if (!v || v.deletedAt) {
      throw tourFieldError(field, 'exists', { ar: 'الفئة غير موجودة.', en: 'Unknown trim.' });
    }
    return v;
  }

  private async assertMarket(code: string): Promise<void> {
    const m = await this.prisma.market.findUnique({ where: { code }, select: { code: true } });
    if (!m) {
      throw tourFieldError('marketCode', 'exists', {
        ar: 'السوق غير موجود.',
        en: 'Unknown market.',
      });
    }
  }

  /** Reference rules (the database CHECK repeats them). */
  private assertReference(next: {
    matchType: string;
    variantId: string;
    referenceVariantId: string | null;
    differenceNoteAr: string | null;
    differenceNoteEn: string | null;
  }): void {
    if (next.matchType === TourMatchType.exact) {
      if (next.referenceVariantId) {
        throw tourFieldError('referenceVariantId', 'onlyForReference', {
          ar: 'الفئة المرجعية تُحدَّد فقط للجولات المرجعية لفئة قريبة.',
          en: 'A reference trim only applies to reference tours of a similar trim.',
        });
      }
      return;
    }
    if (!next.referenceVariantId) {
      throw tourFieldError('referenceVariantId', 'isNotEmpty', {
        ar: 'اختر الفئة التي صُوّرت مقصورتها فعلًا.',
        en: 'Select the trim whose interior was actually photographed.',
      });
    }
    if (next.referenceVariantId === next.variantId) {
      throw tourFieldError('referenceVariantId', 'differentTrim', {
        ar: 'الفئة المرجعية يجب أن تختلف عن فئة الجولة.',
        en: 'The reference trim must differ from the tour trim.',
      });
    }
    for (const [field, value] of [
      ['differenceNoteAr', next.differenceNoteAr],
      ['differenceNoteEn', next.differenceNoteEn],
    ] as const) {
      if (!value?.trim()) {
        throw tourFieldError(field, 'isNotEmpty', {
          ar: 'اكتب الفروق عن الفئة المختارة (عربي وإنجليزي) لتظهر بوضوح للمستخدم.',
          en: 'Describe the differences from the selected trim (Arabic and English); users see it prominently.',
        });
      }
    }
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const root = base.slice(0, 190) || 'tour';
    for (let i = 1; i < 200; i++) {
      const candidate = i === 1 ? root : `${root}-${i}`;
      const clash = await this.prisma.interiorTour.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!clash || clash.id === excludeId) return candidate;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  async create(dto: CreateTourDto, userId: string): Promise<AdminTourDetailDto> {
    const variant = await this.assertVariant(dto.variantId, 'variantId');
    await this.assertMarket(dto.marketCode);
    const matchType = (dto.matchType ?? TourMatchType.exact) as TourMatchType;
    const next = {
      matchType,
      variantId: dto.variantId,
      referenceVariantId: dto.referenceVariantId ?? null,
      differenceNoteAr: blank(dto.differenceNoteAr),
      differenceNoteEn: blank(dto.differenceNoteEn),
    };
    this.assertReference(next);
    if (next.referenceVariantId)
      await this.assertVariant(next.referenceVariantId, 'referenceVariantId');
    let slug: string;
    if (dto.slug) {
      const clash = await this.prisma.interiorTour.findUnique({ where: { slug: dto.slug } });
      if (clash) throw TourErrors.slugTaken(dto.slug);
      slug = dto.slug;
    } else {
      slug = await this.uniqueSlug(
        [
          variant.slug,
          dto.marketCode.toLowerCase(),
          dto.driveSide,
          slugify(dto.interiorColorNameEn, 40),
        ]
          .filter(Boolean)
          .join('-'),
      );
    }
    const created = await this.prisma.interiorTour.create({
      data: {
        slug,
        variantId: dto.variantId,
        marketCode: dto.marketCode,
        driveSide: dto.driveSide as DriveSide,
        interiorColorNameEn: dto.interiorColorNameEn,
        interiorColorNameAr: dto.interiorColorNameAr,
        interiorColorHex: dto.interiorColorHex?.toUpperCase() ?? null,
        titleAr: blank(dto.titleAr),
        titleEn: blank(dto.titleEn),
        descriptionAr: blank(dto.descriptionAr),
        descriptionEn: blank(dto.descriptionEn),
        matchType,
        referenceVariantId: next.referenceVariantId,
        differenceNoteAr: matchType === TourMatchType.exact ? null : next.differenceNoteAr,
        differenceNoteEn: matchType === TourMatchType.exact ? null : next.differenceNoteEn,
        createdById: userId,
        updatedById: userId,
      },
      include: TOUR_INCLUDE,
    });
    this.audit.annotate({ entityType: 'tour', entityId: created.id, after: this.view(created) });
    return this.detail(created.id);
  }

  async update(id: string, dto: UpdateTourDto, userId: string): Promise<AdminTourDetailDto> {
    const current = await this.loadRow(id);
    const changed = (k: (typeof BINDING_FIELDS)[number]) => {
      const v = dto[k];
      if (v === undefined) return false;
      const cur = current[k];
      const normalized = typeof v === 'string' ? blank(v) : v;
      return normalized !== cur;
    };
    if (current.status === ContentStatus.published) {
      const locked = BINDING_FIELDS.filter((k) => changed(k));
      if (locked.length > 0) throw TourErrors.publishedLocked([...locked]);
    }
    const data: Prisma.InteriorTourUncheckedUpdateInput = { updatedById: userId };
    if (dto.variantId !== undefined && dto.variantId !== current.variantId) {
      await this.assertVariant(dto.variantId, 'variantId');
      data.variantId = dto.variantId;
    }
    if (dto.marketCode !== undefined && dto.marketCode !== current.marketCode) {
      await this.assertMarket(dto.marketCode);
      data.marketCode = dto.marketCode;
    }
    if (dto.driveSide !== undefined) data.driveSide = dto.driveSide as DriveSide;
    if (dto.interiorColorNameEn !== undefined) data.interiorColorNameEn = dto.interiorColorNameEn;
    if (dto.interiorColorNameAr !== undefined) data.interiorColorNameAr = dto.interiorColorNameAr;
    if (dto.interiorColorHex !== undefined) {
      data.interiorColorHex = dto.interiorColorHex?.toUpperCase() ?? null;
    }
    for (const k of ['titleAr', 'titleEn', 'descriptionAr', 'descriptionEn'] as const) {
      if (dto[k] !== undefined) data[k] = blank(dto[k]);
    }
    const matchType = (dto.matchType ?? current.matchType) as TourMatchType;
    const next = {
      matchType,
      variantId: dto.variantId ?? current.variantId,
      referenceVariantId:
        dto.referenceVariantId !== undefined ? dto.referenceVariantId : current.referenceVariantId,
      differenceNoteAr:
        dto.differenceNoteAr !== undefined ? blank(dto.differenceNoteAr) : current.differenceNoteAr,
      differenceNoteEn:
        dto.differenceNoteEn !== undefined ? blank(dto.differenceNoteEn) : current.differenceNoteEn,
    };
    if (matchType === TourMatchType.exact && dto.matchType === TourMatchType.exact) {
      // Switching to an exact tour drops the reference data.
      next.referenceVariantId = dto.referenceVariantId ?? null;
      next.differenceNoteAr = null;
      next.differenceNoteEn = null;
    }
    this.assertReference(next);
    if (next.referenceVariantId && next.referenceVariantId !== current.referenceVariantId) {
      await this.assertVariant(next.referenceVariantId, 'referenceVariantId');
    }
    data.matchType = matchType;
    data.referenceVariantId = next.referenceVariantId;
    data.differenceNoteAr = next.differenceNoteAr;
    data.differenceNoteEn = next.differenceNoteEn;
    if (APPROVAL_FIELDS.some((k) => changed(k))) {
      data.approvedAt = null;
      data.approvedById = null;
    }
    if (dto.initialSceneId !== undefined) {
      if (dto.initialSceneId === null) {
        if (current.status === ContentStatus.published) {
          throw TourErrors.publishedLocked(['initialSceneId']);
        }
        data.initialSceneId = null;
      } else {
        const scene = await this.prisma.tourScene.findFirst({
          where: { id: dto.initialSceneId, tourId: id },
          select: { id: true },
        });
        if (!scene) {
          throw tourFieldError('initialSceneId', 'exists', {
            ar: 'المشهد ليس من مشاهد هذه الجولة.',
            en: 'The scene does not belong to this tour.',
          });
        }
        data.initialSceneId = scene.id;
      }
    }
    if (dto.slug !== undefined && dto.slug !== current.slug) {
      const clash = await this.prisma.interiorTour.findUnique({ where: { slug: dto.slug } });
      if (clash) throw TourErrors.slugTaken(dto.slug);
      data.slug = dto.slug;
    }
    const updated = await this.prisma.interiorTour.update({
      where: { id },
      data,
      include: TOUR_INCLUDE,
    });
    this.audit.annotate({
      entityType: 'tour',
      entityId: id,
      before: this.view(current),
      after: this.view(updated),
    });
    return this.detail(id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const t = await this.loadRow(id);
    if (t.status === ContentStatus.published) throw TourErrors.publishedDelete();
    await this.prisma.interiorTour.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    this.audit.annotate({ entityType: 'tour', entityId: id, before: this.view(t) });
  }

  // ------------------------------------------------------------------ workflow

  private async setStatus(
    t: TourRow,
    to: ContentStatus,
    userId: string,
    extra: Prisma.InteriorTourUncheckedUpdateInput = {},
  ): Promise<void> {
    const res = await this.prisma.interiorTour.updateMany({
      where: { id: t.id, status: t.status, deletedAt: null },
      data: { status: to, updatedById: userId, ...extra },
    });
    if (res.count !== 1) throw TourErrors.invalidTransition(t.status, to);
    this.audit.annotate({
      entityType: 'tour',
      entityId: t.id,
      action: `tours.status.${to}`,
      before: { status: t.status },
      after: { status: to, ...extra },
    });
    if (to === ContentStatus.published || t.status === ContentStatus.published) {
      const event: TourEvent = {
        tourId: t.id,
        variantId: t.variantId,
        marketCode: t.marketCode,
        from: t.status,
        to,
      };
      this.events.emit(
        to === ContentStatus.published ? TOUR_EVENTS.PUBLISHED : TOUR_EVENTS.UNPUBLISHED,
        event,
      );
    }
  }

  async submit(id: string, userId: string): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(id);
    if (t.status !== ContentStatus.draft) {
      throw TourErrors.invalidTransition(t.status, ContentStatus.in_review);
    }
    await this.setStatus(t, ContentStatus.in_review, userId, { reviewNote: null });
    return this.detail(id);
  }

  async returnToDraft(id: string, note: string, userId: string): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(id);
    if (t.status !== ContentStatus.in_review) {
      throw TourErrors.invalidTransition(t.status, ContentStatus.draft);
    }
    await this.setStatus(t, ContentStatus.draft, userId, { reviewNote: note.slice(0, 2000) });
    return this.detail(id);
  }

  async approveReference(id: string, userId: string): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(id);
    if (t.matchType !== TourMatchType.reference_similar_trim) throw TourErrors.notReference();
    this.assertReference({
      matchType: t.matchType,
      variantId: t.variantId,
      referenceVariantId: t.referenceVariantId,
      differenceNoteAr: t.differenceNoteAr,
      differenceNoteEn: t.differenceNoteEn,
    });
    await this.prisma.interiorTour.update({
      where: { id },
      data: { approvedAt: new Date(), approvedById: userId, updatedById: userId },
    });
    this.audit.annotate({
      entityType: 'tour',
      entityId: id,
      action: 'tours.reference.approve',
      after: {
        referenceVariantId: t.referenceVariantId,
        differenceNoteAr: t.differenceNoteAr,
        differenceNoteEn: t.differenceNoteEn,
      },
    });
    return this.detail(id);
  }

  async publish(id: string, userId: string): Promise<AdminTourDetailDto> {
    const t = await this.loadDetailRow(id);
    if (t.status !== ContentStatus.draft && t.status !== ContentStatus.in_review) {
      throw TourErrors.invalidTransition(t.status, ContentStatus.published);
    }
    const r = await this.readiness(t);
    if (!r.publishable) throw TourErrors.notPublishable(r.problems);
    await this.setStatus(t, ContentStatus.published, userId, {
      publishedAt: t.publishedAt ?? new Date(),
      reviewNote: null,
    });
    return this.detail(id);
  }

  async unpublish(id: string, userId: string): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(id);
    if (t.status !== ContentStatus.published) {
      throw TourErrors.invalidTransition(t.status, ContentStatus.draft);
    }
    await this.setStatus(t, ContentStatus.draft, userId);
    return this.detail(id);
  }

  async archive(id: string, userId: string): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(id);
    if (t.status === ContentStatus.archived) {
      throw TourErrors.invalidTransition(t.status, ContentStatus.archived);
    }
    await this.setStatus(t, ContentStatus.archived, userId);
    return this.detail(id);
  }

  // ------------------------------------------------------------------ scenes

  /** The scene asset: a non-deleted, non-rejected panorama of the library. */
  private async assertSceneAsset(assetId: string) {
    const a = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: { license: true },
    });
    if (!a || a.deletedAt) {
      throw tourFieldError('assetId', 'exists', { ar: 'الملف غير موجود.', en: 'Unknown file.' });
    }
    if (
      a.kind !== MediaKind.panorama ||
      (a.projection !== 'equirectangular' && a.projection !== 'cubemap')
    ) {
      throw tourFieldError('assetId', 'panorama', {
        ar: 'المشهد يحتاج صورة بانوراما 360° (Equirectangular)؛ الصورة العادية ليست جولة 360°.',
        en: 'A scene needs a 360° (equirectangular) panorama; a regular photo is not a 360° tour.',
      });
    }
    if (a.status === MediaStatus.rejected || a.status === MediaStatus.failed) {
      throw tourFieldError('assetId', 'usable', {
        ar: 'هذا الملف مرفوض أو فشلت معالجته.',
        en: 'This file was rejected or failed processing.',
      });
    }
    return a;
  }

  /** On a published tour a new file must already be fully publishable. */
  private assertLiveAsset(
    tourStatus: ContentStatus,
    a: Parameters<typeof readinessAsset>[0],
    kind: 'scene' | 'hotspot',
  ): void {
    if (tourStatus !== ContentStatus.published) return;
    const r = readinessAsset(a);
    const issues: ReadinessIssue[] = [];
    const msg = (ar: string, en: string) => ({ ar, en });
    if (r.status !== 'ready') {
      issues.push({
        code: 'asset_not_ready',
        message: msg('الملف غير جاهز.', 'The file is not ready.'),
        assetId: r.id,
      });
    }
    if (!r.licensed || r.licenseValidity !== 'valid') {
      issues.push({
        code: 'asset_unlicensed',
        message: msg('الملف بلا ترخيص ساري.', 'The file has no valid licence.'),
        assetId: r.id,
      });
    }
    if (kind === 'scene' && !r.visualCheckConfirmed) {
      issues.push({
        code: 'scene_visual_check_missing',
        message: msg('لم يُؤكَّد الفحص البصري.', 'The visual check is not confirmed.'),
        assetId: r.id,
      });
    }
    if (issues.length > 0) throw TourErrors.publishedAssetNotReady(issues);
  }

  private async sceneKey(
    tourId: string,
    wanted: string | undefined,
    position: string,
    excludeId?: string,
  ) {
    const taken = new Set(
      (
        await this.prisma.tourScene.findMany({
          where: { tourId, ...(excludeId ? { id: { not: excludeId } } : {}) },
          select: { key: true },
        })
      ).map((s) => s.key),
    );
    if (wanted) {
      if (taken.has(wanted)) throw TourErrors.sceneKeyTaken(wanted);
      return wanted;
    }
    for (let i = 1; i < 100; i++) {
      const candidate = i === 1 ? position : `${position}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${position}-${Date.now().toString(36)}`;
  }

  private assertPitchHfov(v: {
    minHfov: number | null;
    maxHfov: number | null;
    minPitch: number | null;
    maxPitch: number | null;
  }): void {
    if (v.minHfov !== null && v.maxHfov !== null && v.minHfov > v.maxHfov) {
      throw tourFieldError('maxHfov', 'min', {
        ar: 'أقصى مجال رؤية يجب ألا يقل عن أدناه.',
        en: 'maxHfov must be at least minHfov.',
      });
    }
    if (v.minPitch !== null && v.maxPitch !== null && v.minPitch > v.maxPitch) {
      throw tourFieldError('maxPitch', 'min', {
        ar: 'أقصى ميل يجب ألا يقل عن أدناه.',
        en: 'maxPitch must be at least minPitch.',
      });
    }
  }

  async createScene(
    tourId: string,
    dto: CreateSceneDto,
    userId: string,
  ): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(tourId);
    const asset = await this.assertSceneAsset(dto.assetId);
    this.assertLiveAsset(t.status, asset, 'scene');
    this.assertPitchHfov({
      minHfov: dto.minHfov ?? null,
      maxHfov: dto.maxHfov ?? null,
      minPitch: dto.minPitch ?? null,
      maxPitch: dto.maxPitch ?? null,
    });
    const key = await this.sceneKey(tourId, dto.key, dto.position);
    const last = await this.prisma.tourScene.aggregate({
      where: { tourId },
      _max: { sortOrder: true },
    });
    const scene = await this.prisma.$transaction(async (tx) => {
      const s = await tx.tourScene.create({
        data: {
          tourId,
          key,
          position: dto.position as ScenePosition,
          titleAr: blank(dto.titleAr),
          titleEn: blank(dto.titleEn),
          assetId: dto.assetId,
          sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? 0) + 1,
          initialYaw: dto.initialYaw ?? 0,
          initialPitch: dto.initialPitch ?? 0,
          initialHfov: dto.initialHfov ?? 100,
          minHfov: dto.minHfov ?? null,
          maxHfov: dto.maxHfov ?? null,
          minPitch: dto.minPitch ?? null,
          maxPitch: dto.maxPitch ?? null,
          northOffset: dto.northOffset ?? null,
        },
      });
      if (dto.isInitial || !t.initialSceneId) {
        await tx.interiorTour.update({
          where: { id: tourId },
          data: { initialSceneId: s.id, updatedById: userId },
        });
      } else {
        await tx.interiorTour.update({ where: { id: tourId }, data: { updatedById: userId } });
      }
      return s;
    });
    this.audit.annotate({
      entityType: 'tour',
      entityId: tourId,
      action: 'tours.scenes.create',
      after: { sceneId: scene.id, key, assetId: dto.assetId },
    });
    return this.detail(tourId);
  }

  private async loadScene(tourId: string, sceneId: string) {
    const s = await this.prisma.tourScene.findFirst({ where: { id: sceneId, tourId } });
    if (!s) throw TourErrors.notFound('scene');
    return s;
  }

  async updateScene(
    tourId: string,
    sceneId: string,
    dto: UpdateSceneDto,
    userId: string,
  ): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(tourId);
    const s = await this.loadScene(tourId, sceneId);
    const data: Prisma.TourSceneUncheckedUpdateInput = {};
    if (dto.assetId !== undefined && dto.assetId !== s.assetId) {
      const asset = await this.assertSceneAsset(dto.assetId);
      this.assertLiveAsset(t.status, asset, 'scene');
      data.assetId = dto.assetId;
    }
    if (dto.position !== undefined) data.position = dto.position as ScenePosition;
    if (dto.key !== undefined && dto.key !== s.key) {
      data.key = await this.sceneKey(tourId, dto.key, dto.position ?? s.position, sceneId);
    }
    if (dto.titleAr !== undefined) data.titleAr = blank(dto.titleAr);
    if (dto.titleEn !== undefined) data.titleEn = blank(dto.titleEn);
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    for (const k of ['initialYaw', 'initialPitch', 'initialHfov'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    for (const k of ['minHfov', 'maxHfov', 'minPitch', 'maxPitch', 'northOffset'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    this.assertPitchHfov({
      minHfov: dto.minHfov !== undefined ? dto.minHfov : num(s.minHfov),
      maxHfov: dto.maxHfov !== undefined ? dto.maxHfov : num(s.maxHfov),
      minPitch: dto.minPitch !== undefined ? dto.minPitch : num(s.minPitch),
      maxPitch: dto.maxPitch !== undefined ? dto.maxPitch : num(s.maxPitch),
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.tourScene.update({ where: { id: sceneId }, data });
      await tx.interiorTour.update({
        where: { id: tourId },
        data: { updatedById: userId, ...(dto.isInitial ? { initialSceneId: sceneId } : {}) },
      });
    });
    this.audit.annotate({
      entityType: 'tour',
      entityId: tourId,
      action: 'tours.scenes.update',
      before: { sceneId, assetId: s.assetId, key: s.key },
      after: { sceneId, ...dto },
    });
    return this.detail(tourId);
  }

  async deleteScene(tourId: string, sceneId: string, userId: string): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(tourId);
    await this.loadScene(tourId, sceneId);
    const others = await this.prisma.tourScene.findMany({
      where: { tourId, id: { not: sceneId } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (t.status === ContentStatus.published && others.length === 0) {
      throw TourErrors.publishedNeedsScene();
    }
    await this.prisma.$transaction(async (tx) => {
      if (t.initialSceneId === sceneId) {
        await tx.interiorTour.update({
          where: { id: tourId },
          data: { initialSceneId: others[0]?.id ?? null, updatedById: userId },
        });
      }
      // Hotspots of the scene and scene links pointing to it cascade.
      await tx.tourScene.delete({ where: { id: sceneId } });
    });
    this.audit.annotate({
      entityType: 'tour',
      entityId: tourId,
      action: 'tours.scenes.delete',
      before: { sceneId },
    });
    return this.detail(tourId);
  }

  async reorderScenes(tourId: string, ids: string[], userId: string): Promise<AdminTourDetailDto> {
    await this.loadRow(tourId);
    const scenes = await this.prisma.tourScene.findMany({
      where: { tourId },
      select: { id: true },
    });
    const all = new Set(scenes.map((s) => s.id));
    if (ids.length !== all.size || ids.some((id) => !all.has(id))) {
      throw tourFieldError('ids', 'sameSet', {
        ar: 'أرسل كل مشاهد الجولة مرة واحدة بالترتيب الجديد.',
        en: 'Send every scene of the tour exactly once, in the new order.',
      });
    }
    await this.prisma.$transaction([
      ...ids.map((id, i) =>
        this.prisma.tourScene.update({ where: { id }, data: { sortOrder: i + 1 } }),
      ),
      this.prisma.interiorTour.update({ where: { id: tourId }, data: { updatedById: userId } }),
    ]);
    return this.detail(tourId);
  }

  // ------------------------------------------------------------------ hotspots

  private cleanTexts(texts: HotspotTextsDto | undefined) {
    const out: Record<'ar' | 'en', { title: string; body: string | null } | null | undefined> = {
      ar: undefined,
      en: undefined,
    };
    for (const locale of ['ar', 'en'] as const) {
      const t = texts?.[locale];
      if (t === undefined) continue;
      if (t === null) {
        out[locale] = null;
        continue;
      }
      const title = toPlainText(t.title, { multiline: false });
      const body = t.body ? toPlainText(t.body, { multiline: true }) : '';
      if (!title) {
        throw tourFieldError(`texts.${locale}.title`, 'isNotEmpty', {
          ar: 'العنوان مطلوب (نص عادي بلا وسوم HTML).',
          en: 'The title is required (plain text, no HTML tags).',
        });
      }
      if (title.length > 200) {
        throw tourFieldError(`texts.${locale}.title`, 'maxLength', {
          ar: 'العنوان أطول من 200 حرف.',
          en: 'The title is longer than 200 characters.',
        });
      }
      out[locale] = { title, body: body || null };
    }
    return out;
  }

  /** Field consistency per hotspot type (the database CHECK / trigger repeat it). */
  private async assertHotspotFields(
    tourId: string,
    sceneId: string,
    tourStatus: ContentStatus,
    h: {
      type: string;
      targetSceneId: string | null;
      targetYaw: number | null;
      targetPitch: number | null;
      mediaAssetId: string | null;
      specKey: string | null;
    },
  ): Promise<void> {
    const forbid = (field: string) =>
      tourFieldError(field, 'notForType', {
        ar: 'هذا الحقل لا يناسب نوع النقطة التفاعلية.',
        en: 'This field does not apply to this hotspot type.',
      });
    const require = (field: string) =>
      tourFieldError(field, 'isNotEmpty', {
        ar: 'هذا الحقل مطلوب لنوع النقطة التفاعلية.',
        en: 'This field is required for this hotspot type.',
      });
    if (h.type === HotspotType.scene_link) {
      if (!h.targetSceneId) throw require('targetSceneId');
      if (h.targetSceneId === sceneId) {
        throw tourFieldError('targetSceneId', 'otherScene', {
          ar: 'الرابط يجب أن ينقل إلى مشهد آخر.',
          en: 'A scene link must lead to another scene.',
        });
      }
      const target = await this.prisma.tourScene.findFirst({
        where: { id: h.targetSceneId, tourId },
        select: { id: true },
      });
      if (!target) {
        throw tourFieldError('targetSceneId', 'exists', {
          ar: 'المشهد الهدف ليس من هذه الجولة.',
          en: 'The target scene does not belong to this tour.',
        });
      }
    } else {
      if (h.targetSceneId) throw forbid('targetSceneId');
      if (h.targetYaw !== null) throw forbid('targetYaw');
      if (h.targetPitch !== null) throw forbid('targetPitch');
    }
    if (h.type === HotspotType.detail_image || h.type === HotspotType.video) {
      if (!h.mediaAssetId) throw require('mediaAssetId');
      const a = await this.prisma.mediaAsset.findUnique({
        where: { id: h.mediaAssetId },
        include: { license: true },
      });
      const wanted = h.type === HotspotType.detail_image ? MediaKind.image : MediaKind.video;
      if (
        !a ||
        a.deletedAt ||
        a.kind !== wanted ||
        a.status === 'rejected' ||
        a.status === 'failed'
      ) {
        throw tourFieldError('mediaAssetId', 'kind', {
          ar:
            wanted === MediaKind.image
              ? 'اختر صورة من مكتبة الوسائط.'
              : 'اختر فيديو مرفوعًا أو رابط فيديو مسموحًا من مكتبة الوسائط.',
          en:
            wanted === MediaKind.image
              ? 'Select an image of the media library.'
              : 'Select an uploaded video or an allow-listed video link of the media library.',
        });
      }
      this.assertLiveAsset(tourStatus, a, 'hotspot');
    } else if (h.mediaAssetId) {
      throw forbid('mediaAssetId');
    }
    if (h.type === HotspotType.spec_link) {
      if (!h.specKey) throw require('specKey');
      const def = await this.prisma.specDefinition.findUnique({
        where: { key: h.specKey },
        select: { key: true },
      });
      if (!def) {
        throw tourFieldError('specKey', 'exists', {
          ar: 'المواصفة غير معروفة.',
          en: 'Unknown spec.',
        });
      }
    } else if (h.specKey) {
      throw forbid('specKey');
    }
  }

  private async writeTexts(
    tx: Tx,
    hotspotId: string,
    texts: ReturnType<ToursAdminService['cleanTexts']>,
  ): Promise<void> {
    for (const locale of ['ar', 'en'] as const) {
      const t = texts[locale];
      if (t === undefined) continue;
      if (t === null) {
        await tx.sceneHotspotTranslation.deleteMany({ where: { hotspotId, locale } });
      } else {
        await tx.sceneHotspotTranslation.upsert({
          where: { hotspotId_locale: { hotspotId, locale } },
          create: { hotspotId, locale, title: t.title, body: t.body },
          update: { title: t.title, body: t.body },
        });
      }
    }
  }

  async createHotspot(
    tourId: string,
    sceneId: string,
    dto: CreateHotspotDto,
    userId: string,
  ): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(tourId);
    await this.loadScene(tourId, sceneId);
    const texts = this.cleanTexts(dto.texts);
    if (!texts.ar && !texts.en) {
      throw tourFieldError('texts', 'isNotEmpty', {
        ar: 'أضف عنوانًا بالعربية أو الإنجليزية على الأقل (كلاهما مطلوب للنشر).',
        en: 'Add a title in Arabic or English at least (both are required to publish).',
      });
    }
    const fields = {
      type: dto.type,
      targetSceneId: dto.targetSceneId ?? null,
      targetYaw: dto.targetYaw ?? null,
      targetPitch: dto.targetPitch ?? null,
      mediaAssetId: dto.mediaAssetId ?? null,
      specKey: dto.specKey ?? null,
    };
    await this.assertHotspotFields(tourId, sceneId, t.status, fields);
    const last = await this.prisma.sceneHotspot.aggregate({
      where: { sceneId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const h = await tx.sceneHotspot.create({
        data: {
          tourId,
          sceneId,
          type: dto.type as HotspotType,
          yaw: dto.yaw,
          pitch: dto.pitch,
          targetSceneId: fields.targetSceneId,
          targetYaw: fields.targetYaw,
          targetPitch: fields.targetPitch,
          mediaAssetId: fields.mediaAssetId,
          specKey: fields.specKey,
          iconKey: dto.iconKey ?? null,
          sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? 0) + 1,
        },
      });
      await this.writeTexts(tx, h.id, texts);
      await tx.interiorTour.update({ where: { id: tourId }, data: { updatedById: userId } });
      return h;
    });
    this.audit.annotate({
      entityType: 'tour',
      entityId: tourId,
      action: 'tours.hotspots.create',
      after: { hotspotId: created.id, sceneId, type: dto.type, texts },
    });
    return this.detail(tourId);
  }

  private async loadHotspot(tourId: string, hotspotId: string) {
    const h = await this.prisma.sceneHotspot.findFirst({ where: { id: hotspotId, tourId } });
    if (!h) throw TourErrors.notFound('hotspot');
    return h;
  }

  async updateHotspot(
    tourId: string,
    hotspotId: string,
    dto: UpdateHotspotDto,
    userId: string,
  ): Promise<AdminTourDetailDto> {
    const t = await this.loadRow(tourId);
    const h = await this.loadHotspot(tourId, hotspotId);
    const type = dto.type ?? h.type;
    const typeChanged = dto.type !== undefined && dto.type !== h.type;
    // Changing the type drops the fields of the old type unless re-sent.
    const pick = <T>(sent: T | undefined, current: T, keep: boolean): T | null =>
      sent !== undefined ? sent : keep ? current : null;
    const fields = {
      type,
      targetSceneId: pick(dto.targetSceneId, h.targetSceneId, !typeChanged),
      targetYaw: pick(dto.targetYaw, num(h.targetYaw), !typeChanged),
      targetPitch: pick(dto.targetPitch, num(h.targetPitch), !typeChanged),
      mediaAssetId: pick(dto.mediaAssetId, h.mediaAssetId, !typeChanged),
      specKey: pick(dto.specKey, h.specKey, !typeChanged),
    };
    await this.assertHotspotFields(tourId, h.sceneId, t.status, fields);
    const texts = this.cleanTexts(dto.texts);
    if (dto.texts) {
      const existing = await this.prisma.sceneHotspotTranslation.findMany({
        where: { hotspotId },
        select: { locale: true },
      });
      const remaining = new Set(existing.map((x) => x.locale));
      for (const locale of ['ar', 'en'] as const) {
        if (texts[locale] === null) remaining.delete(locale);
        if (texts[locale]) remaining.add(locale);
      }
      if (remaining.size === 0) {
        throw tourFieldError('texts', 'isNotEmpty', {
          ar: 'يجب أن يبقى عنوان بلغة واحدة على الأقل.',
          en: 'At least one title must remain.',
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.sceneHotspot.update({
        where: { id: hotspotId },
        data: {
          type: type as HotspotType,
          ...(dto.yaw !== undefined ? { yaw: dto.yaw } : {}),
          ...(dto.pitch !== undefined ? { pitch: dto.pitch } : {}),
          targetSceneId: fields.targetSceneId,
          targetYaw: fields.targetYaw,
          targetPitch: fields.targetPitch,
          mediaAssetId: fields.mediaAssetId,
          specKey: fields.specKey,
          ...(dto.iconKey !== undefined ? { iconKey: dto.iconKey } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      await this.writeTexts(tx, hotspotId, texts);
      await tx.interiorTour.update({ where: { id: tourId }, data: { updatedById: userId } });
    });
    this.audit.annotate({
      entityType: 'tour',
      entityId: tourId,
      action: 'tours.hotspots.update',
      before: { hotspotId, type: h.type },
      after: { hotspotId, ...fields, texts },
    });
    return this.detail(tourId);
  }

  async deleteHotspot(
    tourId: string,
    hotspotId: string,
    userId: string,
  ): Promise<AdminTourDetailDto> {
    await this.loadRow(tourId);
    const h = await this.loadHotspot(tourId, hotspotId);
    await this.prisma.$transaction([
      this.prisma.sceneHotspot.delete({ where: { id: hotspotId } }),
      this.prisma.interiorTour.update({ where: { id: tourId }, data: { updatedById: userId } }),
    ]);
    this.audit.annotate({
      entityType: 'tour',
      entityId: tourId,
      action: 'tours.hotspots.delete',
      before: { hotspotId, sceneId: h.sceneId, type: h.type },
    });
    return this.detail(tourId);
  }

  async reorderHotspots(
    tourId: string,
    sceneId: string,
    ids: string[],
    userId: string,
  ): Promise<AdminTourDetailDto> {
    await this.loadRow(tourId);
    await this.loadScene(tourId, sceneId);
    const rows = await this.prisma.sceneHotspot.findMany({
      where: { sceneId },
      select: { id: true },
    });
    const all = new Set(rows.map((r) => r.id));
    if (ids.length !== all.size || ids.some((id) => !all.has(id))) {
      throw tourFieldError('ids', 'sameSet', {
        ar: 'أرسل كل نقاط المشهد مرة واحدة بالترتيب الجديد.',
        en: 'Send every hotspot of the scene exactly once, in the new order.',
      });
    }
    await this.prisma.$transaction([
      ...ids.map((id, i) =>
        this.prisma.sceneHotspot.update({ where: { id }, data: { sortOrder: i + 1 } }),
      ),
      this.prisma.interiorTour.update({ where: { id: tourId }, data: { updatedById: userId } }),
    ]);
    return this.detail(tourId);
  }
}
