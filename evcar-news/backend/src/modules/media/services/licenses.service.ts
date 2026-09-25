import { Injectable } from '@nestjs/common';
import { toPageRequest, type PageRequest } from '../../../common/http/pagination';
import type { AssetLicense, Prisma } from '../../../generated/prisma/client';
import { LicenseType, MediaKind } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { daysLeft, isoDay, licenseValidity, todayUtc } from '../domain/licenses';
import type {
  CreateLicenseDto,
  LicenseDto,
  LicenseListQueryDto,
  UpdateLicenseDto,
} from '../dto/media.dto';
import { MediaErrors, mediaFieldError } from '../media-errors';

type LicenseWithCount = AssetLicense & { _count: { assets: number } };

const dateOrNull = (v: string | null | undefined): Date | null | undefined =>
  v === undefined ? undefined : v === null || v === '' ? null : new Date(`${v}T00:00:00.000Z`);

const blankToNull = (v: string | null | undefined): string | null | undefined =>
  v === undefined ? undefined : v === null || v.trim() === '' ? null : v;

/**
 * Rights records (REQUIREMENTS §9): who holds the rights, the licence,
 * attribution requirements, permitted uses and validity. A tour can only be
 * published when every file has a valid licence (database + service
 * checks); a licence still assigned to files cannot be deleted.
 */
@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  view(l: LicenseWithCount, today = new Date()): LicenseDto {
    return {
      id: l.id,
      licenseType: l.licenseType,
      rightsHolder: l.rightsHolder,
      attributionText: l.attributionText,
      attributionRequired: l.attributionRequired,
      licenseUrl: l.licenseUrl,
      sourceUrl: l.sourceUrl,
      permittedUses: l.permittedUses,
      restrictions: l.restrictions,
      validFrom: l.validFrom ? isoDay(l.validFrom) : null,
      validUntil: l.validUntil ? isoDay(l.validUntil) : null,
      validity: licenseValidity(l, today),
      daysLeft: daysLeft(l, today),
      proofAssetId: l.proofAssetId,
      notes: l.notes,
      assetCount: l._count.assets,
      isDemo: l.isDemo,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    };
  }

  async list(
    query: LicenseListQueryDto,
  ): Promise<{ items: LicenseDto[]; total: number; page: PageRequest }> {
    const page = toPageRequest(query);
    const where: Prisma.AssetLicenseWhereInput = {};
    if (query.q) {
      where.OR = [
        { rightsHolder: { contains: query.q, mode: 'insensitive' } },
        { attributionText: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.licenseType) where.licenseType = query.licenseType as LicenseType;
    if (query.expiringWithinDays !== undefined) {
      const limit = new Date(todayUtc().getTime() + query.expiringWithinDays * 86_400_000);
      where.validUntil = { not: null, lte: limit };
    }
    const [rows, total] = await Promise.all([
      this.prisma.assetLicense.findMany({
        where,
        include: { _count: { select: { assets: true } } },
        orderBy:
          query.expiringWithinDays !== undefined
            ? [{ validUntil: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.assetLicense.count({ where }),
    ]);
    return { items: rows.map((r) => this.view(r)), total, page };
  }

  async get(id: string): Promise<LicenseDto> {
    const l = await this.prisma.assetLicense.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });
    if (!l) throw MediaErrors.notFound('license');
    return this.view(l);
  }

  private async assertProof(proofAssetId: string | null | undefined): Promise<void> {
    if (!proofAssetId) return;
    const a = await this.prisma.mediaAsset.findUnique({
      where: { id: proofAssetId },
      select: { kind: true, deletedAt: true, status: true },
    });
    if (
      !a ||
      a.deletedAt ||
      (a.kind !== MediaKind.document && a.kind !== MediaKind.image) ||
      a.status === 'rejected'
    ) {
      throw mediaFieldError('proofAssetId', 'exists', {
        ar: 'مستند الإثبات يجب أن يكون ملف PDF أو صورة من مكتبة الوسائط.',
        en: 'The proof must be a PDF or image of the media library.',
      });
    }
  }

  private assertRules(next: {
    attributionRequired: boolean;
    attributionText: string | null;
    validFrom: Date | null;
    validUntil: Date | null;
  }): void {
    if (next.attributionRequired && !next.attributionText?.trim()) {
      throw mediaFieldError('attributionText', 'isNotEmpty', {
        ar: 'اكتب نص الإسناد المطلوب عندما يشترط الترخيص الإسناد.',
        en: 'Enter the credit line when the licence requires attribution.',
      });
    }
    if (next.validFrom && next.validUntil && next.validUntil < next.validFrom) {
      throw mediaFieldError('validUntil', 'afterValidFrom', {
        ar: 'تاريخ انتهاء الترخيص يجب أن يكون بعد تاريخ بدايته.',
        en: 'The licence end date must be after its start date.',
      });
    }
  }

  async create(dto: CreateLicenseDto, userId: string): Promise<LicenseDto> {
    const data = {
      licenseType: dto.licenseType as LicenseType,
      rightsHolder: dto.rightsHolder,
      attributionRequired: dto.attributionRequired ?? false,
      attributionText: blankToNull(dto.attributionText) ?? null,
      licenseUrl: blankToNull(dto.licenseUrl) ?? null,
      sourceUrl: blankToNull(dto.sourceUrl) ?? null,
      permittedUses: blankToNull(dto.permittedUses) ?? null,
      restrictions: blankToNull(dto.restrictions) ?? null,
      validFrom: dateOrNull(dto.validFrom) ?? null,
      validUntil: dateOrNull(dto.validUntil) ?? null,
      proofAssetId: dto.proofAssetId ?? null,
      notes: blankToNull(dto.notes) ?? null,
    };
    this.assertRules(data);
    await this.assertProof(data.proofAssetId);
    const created = await this.prisma.assetLicense.create({
      data: { ...data, createdById: userId },
      include: { _count: { select: { assets: true } } },
    });
    const view = this.view(created);
    this.audit.annotate({ entityId: created.id, after: view });
    return view;
  }

  async update(id: string, dto: UpdateLicenseDto): Promise<LicenseDto> {
    const current = await this.prisma.assetLicense.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });
    if (!current) throw MediaErrors.notFound('license');
    const patch: Prisma.AssetLicenseUncheckedUpdateInput = {};
    if (dto.licenseType !== undefined) patch.licenseType = dto.licenseType as LicenseType;
    if (dto.rightsHolder !== undefined) patch.rightsHolder = dto.rightsHolder;
    if (dto.attributionRequired !== undefined) patch.attributionRequired = dto.attributionRequired;
    for (const k of [
      'attributionText',
      'licenseUrl',
      'sourceUrl',
      'permittedUses',
      'restrictions',
      'notes',
    ] as const) {
      const v = blankToNull(dto[k]);
      if (v !== undefined) patch[k] = v;
    }
    const vf = dateOrNull(dto.validFrom);
    const vu = dateOrNull(dto.validUntil);
    if (vf !== undefined) patch.validFrom = vf;
    if (vu !== undefined) patch.validUntil = vu;
    if (dto.proofAssetId !== undefined) {
      await this.assertProof(dto.proofAssetId);
      patch.proofAssetId = dto.proofAssetId;
    }
    this.assertRules({
      attributionRequired: dto.attributionRequired ?? current.attributionRequired,
      attributionText:
        (patch.attributionText as string | null | undefined) !== undefined
          ? (patch.attributionText as string | null)
          : current.attributionText,
      validFrom: vf !== undefined ? vf : current.validFrom,
      validUntil: vu !== undefined ? vu : current.validUntil,
    });
    const updated = await this.prisma.assetLicense.update({
      where: { id },
      data: patch,
      include: { _count: { select: { assets: true } } },
    });
    const view = this.view(updated);
    this.audit.annotate({ entityId: id, before: this.view(current), after: view });
    return view;
  }

  async remove(id: string): Promise<void> {
    const l = await this.prisma.assetLicense.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });
    if (!l) throw MediaErrors.notFound('license');
    if (l._count.assets > 0) throw MediaErrors.licenseInUse(l._count.assets);
    await this.prisma.assetLicense.delete({ where: { id } });
    this.audit.annotate({ entityId: id, before: this.view(l) });
  }

  /** Throws 422 when the licence does not exist (field `licenseId`). */
  async assertExists(licenseId: string, field = 'licenseId'): Promise<void> {
    const l = await this.prisma.assetLicense.findUnique({
      where: { id: licenseId },
      select: { id: true },
    });
    if (!l) {
      throw mediaFieldError(field, 'exists', {
        ar: 'الترخيص غير موجود.',
        en: 'Unknown licence.',
      });
    }
  }
}
