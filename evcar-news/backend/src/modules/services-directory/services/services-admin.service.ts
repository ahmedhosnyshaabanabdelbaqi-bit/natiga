import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import { ContentStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { isValidContentSlug, slugFromTexts, uniqueSlug } from '../../articles/common/slug';
import { AuditService } from '../../audit';
import type { AuthUser } from '../../auth';
import { MediaUrlService } from '../../vehicles';
import { validateOpeningHours } from '../../stations/common/opening-hours';
import {
  conflict,
  fieldError,
  fieldErrors,
  notFound,
  type FieldProblem,
} from '../../search/common/discovery-http';
import { escapeLike } from '../../search/common/text-match';
import type {
  AdminProviderQueryDto,
  AdminProviderViewDto,
  CreateProviderDto,
  UpdateProviderDto,
  VerifyContactDto,
} from '../dto/services.dto';

const ADMIN_INCLUDE = {
  brands: { select: { brandId: true } },
} satisfies Prisma.ServiceProviderInclude;
type AdminRow = Prisma.ServiceProviderGetPayload<{ include: typeof ADMIN_INCLUDE }>;

const CONTACT_FIELDS = ['phone', 'whatsapp', 'email', 'websiteUrl'] as const;
const SPONSOR_FIELDS = ['isSponsored', 'sponsorLabel', 'sponsoredUntil'] as const;

function view(p: AdminRow): AdminProviderViewDto {
  return {
    id: p.id,
    slug: p.slug,
    type: p.type,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    descriptionAr: p.descriptionAr,
    descriptionEn: p.descriptionEn,
    marketCode: p.marketCode,
    city: p.city,
    addressAr: p.addressAr,
    addressEn: p.addressEn,
    latitude: p.latitude,
    longitude: p.longitude,
    phone: p.phone,
    whatsapp: p.whatsapp,
    email: p.email,
    websiteUrl: p.websiteUrl,
    openingHours: p.openingHours ?? null,
    isAlwaysOpen: p.isAlwaysOpen,
    services: p.services,
    brandIds: p.brands.map((b) => b.brandId).sort(),
    logoAssetId: p.logoAssetId,
    contactVerifiedAt: p.contactVerifiedAt?.toISOString() ?? null,
    contactVerifiedById: p.contactVerifiedById,
    contactVerificationNote: p.contactVerificationNote,
    status: p.status,
    isSponsored: p.isSponsored,
    sponsorLabel: p.sponsorLabel,
    sponsoredUntil: p.sponsoredUntil?.toISOString() ?? null,
    isDemo: p.isDemo,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

type ProviderInput = Partial<CreateProviderDto>;

/**
 * Admin services directory: CRUD + publish/unpublish/archive
 * (directory.write), contact verification (directory.verify), sponsorship
 * fields (ads.manage). Any change of contact data clears the verification;
 * a sponsored entry always carries a label (DB CHECK + default label).
 */
@Injectable()
export class ServicesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaUrlService,
  ) {}

  async list(q: AdminProviderQueryDto): Promise<PaginatedResponse<AdminProviderViewDto>> {
    const page = toPageRequest(q);
    const and: Prisma.ServiceProviderWhereInput[] = [{ deletedAt: null }];
    if (q.status) and.push({ status: q.status });
    if (q.type) and.push({ type: q.type });
    if (q.market) and.push({ marketCode: q.market });
    if (q.sponsored !== undefined) and.push({ isSponsored: q.sponsored });
    if (q.verified !== undefined) {
      and.push({ contactVerifiedAt: q.verified ? { not: null } : null });
    }
    if (q.q) {
      const n = `%${escapeLike(normalizeSearchText(q.q))}%`;
      const ids = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p."id"::text AS id FROM "service_providers" p
         WHERE app_normalize_text(concat_ws(' ', p."name_ar", p."name_en", p."slug", p."city")) LIKE ${n}`;
      and.push({ id: { in: ids.map((r) => r.id) } });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.serviceProvider.findMany({
        where,
        include: ADMIN_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.serviceProvider.count({ where }),
    ]);
    return paginated(rows.map(view), total, page);
  }

  async get(id: string): Promise<AdminProviderViewDto> {
    return view(await this.find(id));
  }

  async create(dto: CreateProviderDto, user: AuthUser): Promise<AdminProviderViewDto> {
    this.assertSponsorPermission(dto, user);
    await this.validate(dto, null);
    const slug = await this.slugFor(dto.slug, [dto.nameEn, dto.nameAr], null);
    const row = await this.prisma.serviceProvider.create({
      data: {
        ...(this.fields(dto) as Prisma.ServiceProviderUncheckedCreateInput),
        slug,
        type: dto.type,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        marketCode: dto.marketCode,
        status: ContentStatus.draft,
        createdById: user.id,
        brands: dto.brandIds?.length
          ? { create: [...new Set(dto.brandIds)].map((brandId) => ({ brandId })) }
          : undefined,
      },
      include: ADMIN_INCLUDE,
    });
    const v = view(row);
    this.audit.annotate({ entityId: row.id, after: v });
    return v;
  }

  async update(id: string, dto: UpdateProviderDto, user: AuthUser): Promise<AdminProviderViewDto> {
    const current = await this.find(id);
    this.assertSponsorPermission(dto, user);
    await this.validate(dto, current);
    const data: Record<string, unknown> = { ...this.fields(dto) };
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn;
    if (dto.marketCode !== undefined) data.marketCode = dto.marketCode;
    if (dto.slug !== undefined) data.slug = await this.slugFor(dto.slug, [], id);
    const contactChanged = CONTACT_FIELDS.some(
      (f) => dto[f] !== undefined && (dto[f] ?? null) !== current[f],
    );
    if (contactChanged && current.contactVerifiedAt) {
      data.contactVerifiedAt = null;
      data.contactVerifiedById = null;
      data.contactVerificationNote = null;
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.brandIds !== undefined) {
        await tx.serviceProviderBrand.deleteMany({ where: { providerId: id } });
        if (dto.brandIds.length) {
          await tx.serviceProviderBrand.createMany({
            data: [...new Set(dto.brandIds)].map((brandId) => ({ providerId: id, brandId })),
          });
        }
      }
      return tx.serviceProvider.update({
        where: { id },
        data: data,
        include: ADMIN_INCLUDE,
      });
    });
    const v = view(row);
    this.audit.annotate({ entityId: id, before: view(current), after: v });
    return v;
  }

  async remove(id: string): Promise<void> {
    const current = await this.find(id);
    await this.prisma.serviceProvider.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.annotate({ entityId: id, before: view(current) });
  }

  async setStatus(id: string, action: 'publish' | 'unpublish' | 'archive') {
    const current = await this.find(id);
    const target =
      action === 'publish'
        ? ContentStatus.published
        : action === 'archive'
          ? ContentStatus.archived
          : ContentStatus.draft;
    if (action === 'publish') {
      const problems: FieldProblem[] = [];
      if (current.latitude === null && !current.city) {
        problems.push({
          field: 'city',
          rule: 'locationRequired',
          message: {
            ar: 'حدد المدينة أو الموقع قبل النشر.',
            en: 'Set a city or a location before publishing.',
          },
        });
      }
      if (problems.length) throw fieldErrors(problems);
    }
    if (current.status === target) {
      throw conflict(
        'SERVICE_PROVIDER_INVALID_TRANSITION',
        { ar: 'الحالة مطبقة بالفعل.', en: 'The provider already has this status.' },
        { status: current.status },
      );
    }
    const row = await this.prisma.serviceProvider.update({
      where: { id },
      data: { status: target },
      include: ADMIN_INCLUDE,
    });
    this.audit.annotate({
      action: `services.${action}`,
      entityId: id,
      before: { status: current.status },
      after: { status: row.status },
    });
    return view(row);
  }

  async verify(id: string, dto: VerifyContactDto, user: AuthUser) {
    const current = await this.find(id);
    if (!CONTACT_FIELDS.some((f) => current[f])) {
      throw fieldError('phone', 'contactRequired', {
        ar: 'لا توجد بيانات تواصل للتحقق منها.',
        en: 'There is no contact data to verify.',
      });
    }
    const row = await this.prisma.serviceProvider.update({
      where: { id },
      data: {
        contactVerifiedAt: new Date(),
        contactVerifiedById: user.id,
        contactVerificationNote: dto.note,
      },
      include: ADMIN_INCLUDE,
    });
    this.audit.annotate({
      action: 'services.verify_contact',
      entityId: id,
      before: { contactVerifiedAt: current.contactVerifiedAt?.toISOString() ?? null },
      after: { contactVerifiedAt: row.contactVerifiedAt?.toISOString(), note: dto.note },
    });
    return view(row);
  }

  async unverify(id: string) {
    const current = await this.find(id);
    const row = await this.prisma.serviceProvider.update({
      where: { id },
      data: { contactVerifiedAt: null, contactVerifiedById: null, contactVerificationNote: null },
      include: ADMIN_INCLUDE,
    });
    this.audit.annotate({
      action: 'services.unverify_contact',
      entityId: id,
      before: { contactVerifiedAt: current.contactVerifiedAt?.toISOString() ?? null },
      after: { contactVerifiedAt: null },
    });
    return view(row);
  }

  // ---------------------------------------------------------------------------------------

  private async find(id: string): Promise<AdminRow> {
    const row = await this.prisma.serviceProvider.findFirst({
      where: { id, deletedAt: null },
      include: ADMIN_INCLUDE,
    });
    if (!row) {
      throw notFound('SERVICE_PROVIDER_NOT_FOUND', {
        ar: 'مقدم الخدمة غير موجود.',
        en: 'Service provider not found.',
      });
    }
    return row;
  }

  private assertSponsorPermission(dto: ProviderInput, user: AuthUser): void {
    if (
      SPONSOR_FIELDS.some((f) => dto[f] !== undefined) &&
      !user.permissions.includes('ads.manage')
    ) {
      throw AppException.forbidden(
        {
          ar: 'تعديل الرعاية يتطلب صلاحية إدارة الإعلانات.',
          en: 'Changing sponsorship requires the ads.manage permission.',
        },
        'SPONSORSHIP_PERMISSION_REQUIRED',
      );
    }
  }

  private fields(dto: ProviderInput): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const copy = [
      'descriptionAr',
      'descriptionEn',
      'city',
      'addressAr',
      'addressEn',
      'latitude',
      'longitude',
      'phone',
      'whatsapp',
      'email',
      'websiteUrl',
      'isAlwaysOpen',
      'services',
      'logoAssetId',
      'isSponsored',
      'sponsorLabel',
    ] as const;
    for (const k of copy) if (dto[k] !== undefined) out[k] = dto[k];
    if (dto.openingHours !== undefined) {
      out.openingHours = dto.openingHours === null ? Prisma.DbNull : dto.openingHours;
    }
    if (dto.sponsoredUntil !== undefined) {
      out.sponsoredUntil = dto.sponsoredUntil === null ? null : new Date(dto.sponsoredUntil);
    }
    if (dto.isSponsored === false) {
      out.sponsoredUntil = null;
    }
    return out;
  }

  private async validate(dto: ProviderInput, current: AdminRow | null): Promise<void> {
    const problems: FieldProblem[] = [];
    const lat = dto.latitude !== undefined ? dto.latitude : (current?.latitude ?? null);
    const lng = dto.longitude !== undefined ? dto.longitude : (current?.longitude ?? null);
    if ((lat === null) !== (lng === null)) {
      problems.push({
        field: lat === null ? 'latitude' : 'longitude',
        rule: 'bothOrNeither',
        message: { ar: 'حدد خط العرض والطول معًا.', en: 'Set latitude and longitude together.' },
      });
    }
    if (dto.openingHours) {
      for (const p of validateOpeningHours(dto.openingHours)) {
        problems.push({
          field: p.path,
          rule: p.rule,
          message: { ar: 'مواعيد العمل غير صالحة.', en: 'Invalid opening hours.' },
        });
      }
    }
    const alwaysOpen =
      dto.isAlwaysOpen !== undefined ? dto.isAlwaysOpen : (current?.isAlwaysOpen ?? null);
    const hours =
      dto.openingHours !== undefined ? dto.openingHours : (current?.openingHours ?? null);
    if (alwaysOpen === true && hours) {
      problems.push({
        field: 'openingHours',
        rule: 'nullWhenAlwaysOpen',
        message: {
          ar: 'اترك مواعيد العمل فارغة عند العمل 24/7.',
          en: 'Opening hours must be null when always open.',
        },
      });
    }
    const sponsored =
      dto.isSponsored !== undefined ? dto.isSponsored : (current?.isSponsored ?? false);
    const label =
      dto.sponsorLabel !== undefined ? dto.sponsorLabel : (current?.sponsorLabel ?? null);
    if (sponsored && !label) {
      problems.push({
        field: 'sponsorLabel',
        rule: 'requiredWhenSponsored',
        message: {
          ar: 'الإدراج المموّل يحتاج وسمًا ظاهرًا (مثل «مُموَّل»).',
          en: 'A sponsored entry needs a visible label (e.g. "Sponsored").',
        },
      });
    }
    if (!sponsored && dto.sponsoredUntil) {
      problems.push({
        field: 'sponsoredUntil',
        rule: 'onlyWhenSponsored',
        message: {
          ar: 'تاريخ انتهاء الرعاية لإدراج مموّل فقط.',
          en: 'Only for sponsored entries.',
        },
      });
    }
    if (dto.marketCode) {
      const m = await this.prisma.market.findUnique({ where: { code: dto.marketCode } });
      if (!m) {
        problems.push({
          field: 'marketCode',
          rule: 'exists',
          message: { ar: 'السوق غير موجود.', en: 'Unknown market.' },
        });
      }
    }
    if (dto.brandIds?.length) {
      const ids = [...new Set(dto.brandIds)];
      const found = await this.prisma.brand.count({ where: { id: { in: ids }, deletedAt: null } });
      if (found !== ids.length) {
        problems.push({
          field: 'brandIds',
          rule: 'exists',
          message: { ar: 'ماركة غير موجودة.', en: 'Unknown brand.' },
        });
      }
    }
    if (dto.logoAssetId) {
      const a = await this.prisma.mediaAsset.findUnique({ where: { id: dto.logoAssetId } });
      if (!a || !this.media.isPublishable(a)) {
        problems.push({
          field: 'logoAssetId',
          rule: 'licensedReadyImage',
          message: {
            ar: 'الشعار يجب أن يكون صورة جاهزة ومسجلة الترخيص.',
            en: 'The logo must be a processed image with a recorded licence.',
          },
        });
      }
    }
    if (problems.length) throw fieldErrors(problems);
  }

  private async slugFor(
    requested: string | undefined,
    texts: (string | undefined)[],
    selfId: string | null,
  ): Promise<string> {
    const taken = async (slug: string) =>
      !!(await this.prisma.serviceProvider.findFirst({
        where: { slug, ...(selfId ? { id: { not: selfId } } : {}) },
        select: { id: true },
      }));
    if (requested !== undefined) {
      const slug = requested.toLowerCase();
      if (!isValidContentSlug(slug)) {
        throw fieldError('slug', 'slug', {
          ar: 'الرابط المختصر غير صالح.',
          en: 'Invalid slug.',
        });
      }
      if (await taken(slug)) {
        throw conflict('SERVICE_PROVIDER_SLUG_TAKEN', {
          ar: 'الرابط المختصر مستخدم.',
          en: 'This slug is already used.',
        });
      }
      return slug;
    }
    return uniqueSlug(slugFromTexts(texts), taken);
  }
}
