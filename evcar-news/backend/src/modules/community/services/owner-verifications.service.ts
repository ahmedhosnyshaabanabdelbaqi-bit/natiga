import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { type PaginationQueryDto, toPageRequest } from '../../../common/http/pagination';
import type { Prisma } from '../../../generated/prisma/client';
import type { OwnerVerificationStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { STORAGE_PROVIDER } from '../../../providers/provider-tokens';
import type { StorageProvider } from '../../../providers/storage/storage.types';
import { AuditService } from '../../audit';
import type { AuthUser } from '../../auth';
import { CommunityErrors, fieldError } from '../common/community-errors';
import type {
  ApproveVerificationDto,
  AdminVerificationListQueryDto,
  DecisionNoteDto,
} from '../dto/admin.dto';
import type { CreateOwnerVerificationDto, OwnerVerificationDto } from '../dto/community.dto';
import { CommunityGuardService } from './community-guard.service';

const VARIANT_SELECT = {
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
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
  },
} as const;

const ADMIN_INCLUDE = {
  user: { select: { id: true, displayName: true, email: true, createdAt: true } },
  reviewedBy: { select: { id: true, displayName: true } },
  variant: VARIANT_SELECT,
  evidenceAsset: {
    select: {
      id: true,
      mimeType: true,
      originalFilename: true,
      sizeBytes: true,
      storageKey: true,
      deletedAt: true,
    },
  },
  _count: { select: { reviews: true } },
} satisfies Prisma.OwnerVerificationInclude;
type AdminRow = Prisma.OwnerVerificationGetPayload<{ include: typeof ADMIN_INCLUDE }>;

const USER_INCLUDE = { variant: VARIANT_SELECT } satisfies Prisma.OwnerVerificationInclude;
type UserRow = Prisma.OwnerVerificationGetPayload<{ include: typeof USER_INCLUDE }>;

/** Max verification requests a user may open per 24 h. */
export const VERIFICATION_REQUESTS_PER_DAY = 5;
/** Lifetime of the signed evidence URL shown to reviewers. */
const EVIDENCE_URL_TTL_S = 300;

function variantName(v: UserRow['variant'], lang: SupportedLanguage): string | null {
  const pick = (ar: string | null | undefined, en: string | null | undefined) =>
    (lang === 'ar' ? ar || en : en || ar) ?? null;
  const model = v.modelYear?.generation?.model;
  const parts = [
    pick(model?.brand?.nameAr, model?.brand?.nameEn),
    pick(model?.nameAr, model?.nameEn),
    pick(v.nameAr, v.nameEn),
  ].filter(Boolean);
  const name = parts.join(' ');
  return name ? (v.modelYear?.year ? `${name} (${v.modelYear.year})` : name) : null;
}

/**
 * The "مالك موثّق / verified owner" flow (REQUIREMENTS §15: never a badge
 * without a real check). A user asks for verification of a trim they own
 * (document review with a private evidence file, or dealer confirmation);
 * holders of community.verify_owners approve / reject / revoke. Approval
 * links the author's reviews of that trim (the DB trigger validates the link
 * and maintains the badge); leaving "approved" removes it. The evidence file
 * is deleted from storage right after the decision.
 */
@Injectable()
export class OwnerVerificationsService {
  private readonly logger = new Logger(OwnerVerificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: CommunityGuardService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Approved verifications past their end of validity become expired (badges removed by trigger). */
  async expireDue(): Promise<number> {
    const res = await this.prisma.ownerVerification.updateMany({
      where: { status: 'approved', expiresAt: { lte: this.guard.now() } },
      data: { status: 'expired' },
    });
    return res.count;
  }

  userView(v: UserRow, lang: SupportedLanguage): OwnerVerificationDto {
    return {
      id: v.id,
      variantId: v.variantId,
      variantName: variantName(v.variant, lang),
      userVehicleId: v.userVehicleId,
      method: v.method,
      status: v.status,
      hasEvidence: !!v.evidenceAssetId && !v.evidenceDeletedAt,
      evidenceDeletedAt: v.evidenceDeletedAt?.toISOString() ?? null,
      reviewedAt: v.reviewedAt?.toISOString() ?? null,
      decisionNote: v.decisionNote,
      expiresAt: v.expiresAt?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
    };
  }

  // --- user side ---------------------------------------------------------------------------

  async mine(
    userId: string,
    q: PaginationQueryDto,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<OwnerVerificationDto>> {
    await this.expireDue();
    const page = toPageRequest(q);
    const [rows, total] = await Promise.all([
      this.prisma.ownerVerification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: USER_INCLUDE,
      }),
      this.prisma.ownerVerification.count({ where: { userId } }),
    ]);
    return paginated(
      rows.map((r) => this.userView(r, lang)),
      total,
      page,
    );
  }

  async request(
    dto: CreateOwnerVerificationDto,
    user: AuthUser,
    lang: SupportedLanguage,
  ): Promise<OwnerVerificationDto> {
    const variant = await this.prisma.vehicleVariant.findFirst({
      where: { id: dto.variantId, status: 'published', deletedAt: null },
      select: { id: true },
    });
    if (!variant) throw CommunityErrors.targetNotFound('variantId');
    if (dto.userVehicleId) {
      const car = await this.prisma.userVehicle.findFirst({
        where: { id: dto.userVehicleId, userId: user.id, variantId: dto.variantId },
        select: { id: true },
      });
      if (!car) {
        throw fieldError('userVehicleId', 'ownCar', {
          ar: 'السيارة يجب أن تكون من سياراتك في المرآب ومن الفئة نفسها.',
          en: 'The car must be one of your garage cars of the same trim.',
        });
      }
    }
    if (dto.evidenceAssetId) {
      const session = await this.prisma.uploadSession.findFirst({
        where: { assetId: dto.evidenceAssetId, userId: user.id, purpose: 'owner_evidence' },
        select: { asset: { select: { id: true, deletedAt: true } } },
      });
      if (!session?.asset || session.asset.deletedAt) {
        throw fieldError('evidenceAssetId', 'ownEvidence', {
          ar: 'المستند غير موجود أو لم يُرفع من حسابك لغرض توثيق الملكية.',
          en: 'The document does not exist or was not uploaded by you as ownership evidence.',
        });
      }
    }
    await this.guard.assertCanPost(user);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`owner-verification:${user.id}`}))`;
      const active = await tx.ownerVerification.findFirst({
        where: {
          userId: user.id,
          variantId: dto.variantId,
          status: { in: ['pending', 'approved'] },
        },
        select: { id: true, status: true, expiresAt: true },
      });
      if (active && !(active.expiresAt && active.expiresAt <= this.guard.now())) {
        throw CommunityErrors.verificationExists(active.id, active.status);
      }
      if (active) {
        await tx.ownerVerification.update({
          where: { id: active.id },
          data: { status: 'expired' },
        });
      }
      const recent = await tx.ownerVerification.count({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(this.guard.now().getTime() - 86_400_000) },
        },
      });
      if (recent >= VERIFICATION_REQUESTS_PER_DAY) {
        throw CommunityErrors.rateLimited(3600, { kind: 'owner_verification' });
      }
      return tx.ownerVerification.create({
        data: {
          userId: user.id,
          variantId: dto.variantId,
          userVehicleId: dto.userVehicleId ?? null,
          method: dto.method,
          evidenceAssetId: dto.evidenceAssetId ?? null,
        },
        include: USER_INCLUDE,
      });
    });
    return this.userView(created, lang);
  }

  /** The user withdraws a pending request (the row and its evidence are deleted). */
  async withdraw(id: string, userId: string): Promise<void> {
    const v = await this.prisma.ownerVerification.findUnique({ where: { id } });
    if (!v || v.userId !== userId) throw CommunityErrors.notFound('owner_verification');
    if (v.status !== 'pending') throw CommunityErrors.verificationState(v.status, ['pending']);
    await this.deleteEvidence(v.evidenceAssetId, null);
    await this.prisma.ownerVerification.delete({ where: { id } });
  }

  // --- staff side --------------------------------------------------------------------------

  private async adminView(v: AdminRow, lang: SupportedLanguage, withUrl: boolean) {
    const ev = v.evidenceAsset;
    const evidenceAvailable = !!ev && !ev.deletedAt && !v.evidenceDeletedAt;
    return {
      id: v.id,
      user: {
        id: v.user.id,
        displayName: v.user.displayName,
        email: v.user.email,
        createdAt: v.user.createdAt.toISOString(),
      },
      variant: { id: v.variant.id, name: variantName(v.variant, lang) },
      userVehicleId: v.userVehicleId,
      method: v.method,
      status: v.status,
      evidence: ev
        ? {
            assetId: ev.id,
            mimeType: ev.mimeType,
            filename: ev.originalFilename,
            sizeBytes: ev.sizeBytes === null ? null : Number(ev.sizeBytes),
            available: evidenceAvailable,
            url: withUrl && evidenceAvailable ? await this.evidenceUrl(ev.storageKey) : null,
            urlExpiresInSeconds: withUrl && evidenceAvailable ? EVIDENCE_URL_TTL_S : null,
          }
        : null,
      evidenceDeletedAt: v.evidenceDeletedAt?.toISOString() ?? null,
      reviewedBy: v.reviewedBy,
      reviewedAt: v.reviewedAt?.toISOString() ?? null,
      decisionNote: v.decisionNote,
      expiresAt: v.expiresAt?.toISOString() ?? null,
      linkedReviews: v._count.reviews,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  }

  private async evidenceUrl(key: string): Promise<string | null> {
    try {
      return await this.storage.signedUrl(key, { expiresInSeconds: EVIDENCE_URL_TTL_S });
    } catch (e) {
      this.logger.warn(`evidence url failed: ${(e as Error).message}`);
      return null;
    }
  }

  async list(q: AdminVerificationListQueryDto, lang: SupportedLanguage) {
    await this.expireDue();
    const page = toPageRequest(q);
    const where: Prisma.OwnerVerificationWhereInput = {
      status: { in: (q.status?.length ? q.status : ['pending']) as OwnerVerificationStatus[] },
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.variantId ? { variantId: q.variantId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.ownerVerification.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: ADMIN_INCLUDE,
      }),
      this.prisma.ownerVerification.count({ where }),
    ]);
    return paginated(
      await Promise.all(rows.map((r) => this.adminView(r, lang, false))),
      total,
      page,
    );
  }

  private async load(id: string): Promise<AdminRow> {
    const v = await this.prisma.ownerVerification.findUnique({
      where: { id },
      include: ADMIN_INCLUDE,
    });
    if (!v) throw CommunityErrors.notFound('owner_verification');
    return v;
  }

  async get(id: string, lang: SupportedLanguage) {
    await this.expireDue();
    return this.adminView(await this.load(id), lang, true);
  }

  async approve(id: string, dto: ApproveVerificationDto, staffId: string, lang: SupportedLanguage) {
    const v = await this.load(id);
    if (v.status !== 'pending') throw CommunityErrors.verificationState(v.status, ['pending']);
    if (v.method === 'document_review') {
      const ev = v.evidenceAsset;
      if (!ev || ev.deletedAt || v.evidenceDeletedAt)
        throw CommunityErrors.verificationNeedsEvidence();
    } else if (!dto.decisionNote) {
      throw fieldError('decisionNote', 'required', {
        ar: 'اكتب كيف تم التحقق من الملكية.',
        en: 'Describe how ownership was confirmed.',
      });
    }
    const now = this.guard.now();
    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (expiresAt.getTime() <= now.getTime()) {
        throw fieldError('expiresAt', 'future', {
          ar: 'تاريخ الانتهاء يجب أن يكون في المستقبل.',
          en: 'The end of validity must be in the future.',
        });
      }
    }
    const linked = await this.prisma.$transaction(async (tx) => {
      const res = await tx.ownerVerification.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'approved',
          reviewedAt: now,
          reviewedById: staffId,
          decisionNote: dto.decisionNote ?? null,
          expiresAt,
        },
      });
      if (res.count !== 1) throw CommunityErrors.verificationState('changed', ['pending']);
      const reviews = await tx.review.updateMany({
        where: {
          userId: v.userId,
          variantId: v.variantId,
          deletedAt: null,
          ownerVerificationId: null,
        },
        data: { ownerVerificationId: id },
      });
      return reviews.count;
    });
    await this.deleteEvidence(v.evidenceAssetId, id);
    this.audit.annotate({
      entityType: 'owner_verification',
      entityId: id,
      before: { status: v.status },
      after: {
        status: 'approved',
        linkedReviews: linked,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });
    return this.get(id, lang);
  }

  async reject(id: string, dto: DecisionNoteDto, staffId: string, lang: SupportedLanguage) {
    const v = await this.load(id);
    if (v.status !== 'pending') throw CommunityErrors.verificationState(v.status, ['pending']);
    await this.prisma.ownerVerification.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedAt: this.guard.now(),
        reviewedById: staffId,
        decisionNote: dto.decisionNote,
      },
    });
    await this.deleteEvidence(v.evidenceAssetId, id);
    this.audit.annotate({
      entityType: 'owner_verification',
      entityId: id,
      before: { status: v.status },
      after: { status: 'rejected' },
    });
    return this.get(id, lang);
  }

  async revoke(id: string, dto: DecisionNoteDto, staffId: string, lang: SupportedLanguage) {
    const v = await this.load(id);
    if (v.status !== 'approved') throw CommunityErrors.verificationState(v.status, ['approved']);
    await this.prisma.ownerVerification.update({
      where: { id },
      data: {
        status: 'revoked',
        reviewedAt: this.guard.now(),
        reviewedById: staffId,
        decisionNote: dto.decisionNote,
      },
    });
    await this.deleteEvidence(v.evidenceAssetId, id);
    this.audit.annotate({
      entityType: 'owner_verification',
      entityId: id,
      before: { status: v.status },
      after: { status: 'revoked' },
    });
    return this.get(id, lang);
  }

  /**
   * Deletes the private evidence file (original + derived files) and marks
   * the asset deleted; sets evidence_deleted_at on the verification.
   */
  private async deleteEvidence(
    assetId: string | null,
    verificationId: string | null,
  ): Promise<void> {
    if (!assetId) return;
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        storageKey: true,
        deletedAt: true,
        variants: { select: { storageKey: true } },
      },
    });
    if (asset) {
      for (const key of [asset.storageKey, ...asset.variants.map((x) => x.storageKey)]) {
        try {
          await this.storage.delete(key);
        } catch (e) {
          this.logger.warn(`evidence file ${key} not deleted: ${(e as Error).message}`);
        }
      }
      if (!asset.deletedAt) {
        await this.prisma.mediaAsset.update({
          where: { id: asset.id },
          data: { deletedAt: this.guard.now() },
        });
      }
    }
    if (verificationId) {
      await this.prisma.ownerVerification.updateMany({
        where: { id: verificationId, evidenceDeletedAt: null },
        data: { evidenceDeletedAt: this.guard.now() },
      });
    }
  }
}
