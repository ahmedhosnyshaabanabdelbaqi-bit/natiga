import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import { tr } from '../../../common/validation/messages';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../auth';
import { CommunityErrors, fieldError } from '../common/community-errors';
import {
  CAR_DIMENSIONS,
  DIMENSION_LABELS,
  type RatingDimension,
  STATION_DIMENSIONS,
  VERIFIED_OWNER_LABEL,
} from '../common/labels';
import type {
  CreateReviewDto,
  DimensionScoreDto,
  ReviewDto,
  ReviewListQueryDto,
  ReviewSummaryDto,
  ReviewSummaryQueryDto,
  UpdateReviewDto,
} from '../dto/community.dto';
import { CommunityGuardService } from './community-guard.service';
import {
  AUTHOR_SELECT,
  authorOf,
  CommunityViewerService,
  type Viewer,
  visibleWhere,
  votesOf,
} from './community-viewer.service';

export const REVIEW_INCLUDE = {
  user: AUTHOR_SELECT,
  ratings: true,
  ownerVerification: { select: { status: true, expiresAt: true } },
  _count: { select: { comments: { where: { status: 'approved', deletedAt: null } } } },
} satisfies Prisma.ReviewInclude;

export type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;

type Target = { type: 'variant' | 'station'; id: string };

/** The badge needs an approved, unexpired verification (the DB keeps the link valid). */
export function hasVerifiedBadge(r: ReviewRow, now: Date): boolean {
  const v = r.ownerVerification;
  return (
    r.isVerifiedOwner &&
    !!v &&
    v.status === 'approved' &&
    (!v.expiresAt || v.expiresAt.getTime() > now.getTime())
  );
}

/**
 * Owner reviews of a variant (or a station) with optional rating
 * dimensions (REQUIREMENTS §15). Reviews are pre-moderated; the
 * "verified owner" badge only comes from an approved owner_verifications row
 * of the author for that variant — it can never be set by the client.
 * Demo rows (is_demo) are never served.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: CommunityGuardService,
    private readonly viewers: CommunityViewerService,
  ) {}

  private targetOf(q: { variantId?: string; stationId?: string }): Target {
    if (!!q.variantId === !!q.stationId) {
      throw fieldError('variantId', 'exactlyOne', {
        ar: 'حدد فئة سيارة (variantId) أو محطة (stationId)، واحدة فقط.',
        en: 'Give exactly one of variantId or stationId.',
      });
    }
    return q.variantId
      ? { type: 'variant', id: q.variantId }
      : { type: 'station', id: q.stationId! };
  }

  private async assertTarget(t: Target, field: string): Promise<void> {
    const found =
      t.type === 'variant'
        ? await this.prisma.vehicleVariant.findFirst({
            where: { id: t.id, status: 'published', deletedAt: null },
            select: { id: true },
          })
        : await this.prisma.chargingStation.findFirst({
            where: {
              id: t.id,
              publicationStatus: 'published',
              deletedAt: null,
              duplicateOfId: null,
            },
            select: { id: true },
          });
    if (!found) throw CommunityErrors.targetNotFound(field);
  }

  private assertDimensions(t: Target, ratings: DimensionScoreDto[] | undefined): void {
    if (!ratings?.length) return;
    const allowed: readonly string[] = t.type === 'variant' ? CAR_DIMENSIONS : STATION_DIMENSIONS;
    const seen = new Set<string>();
    for (const r of ratings) {
      if (!allowed.includes(r.dimension) || seen.has(r.dimension)) {
        throw fieldError('ratings', 'dimension', {
          ar: 'بُعد تقييم غير مناسب لهذا العنصر أو مكرر.',
          en: 'A rating dimension does not apply here or is repeated.',
        });
      }
      seen.add(r.dimension);
    }
  }

  view(
    r: ReviewRow,
    viewer: Viewer,
    myVote: number | undefined,
    lang: SupportedLanguage,
  ): ReviewDto {
    const verified = hasVerifiedBadge(r, this.guard.now());
    return {
      id: r.id,
      target: r.variantId
        ? { type: 'variant', id: r.variantId }
        : { type: 'station', id: r.stationId! },
      rating: r.rating,
      title: r.title,
      body: r.body,
      pros: r.pros,
      cons: r.cons,
      ownershipMonths: r.ownershipMonths,
      ratings: r.ratings
        .map((x) => ({
          dimension: x.dimension,
          label: tr(DIMENSION_LABELS[x.dimension], lang),
          score: x.score,
        }))
        .sort((a, b) => a.dimension.localeCompare(b.dimension)),
      author: authorOf(r.user, lang),
      verifiedOwner: verified,
      verifiedOwnerLabel: verified ? tr(VERIFIED_OWNER_LABEL, lang) : null,
      locale: r.locale,
      marketCode: r.marketCode,
      votes: votesOf(r, myVote),
      commentCount: r._count.comments,
      status: r.status,
      isMine: !!viewer.id && r.userId === viewer.id,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private async approvedVerificationId(
    db: Prisma.TransactionClient,
    userId: string,
    variantId: string,
  ): Promise<string | null> {
    const v = await db.ownerVerification.findFirst({
      where: {
        userId,
        variantId,
        status: 'approved',
        OR: [{ expiresAt: null }, { expiresAt: { gt: this.guard.now() } }],
      },
      select: { id: true },
    });
    return v?.id ?? null;
  }

  // --- public reads ------------------------------------------------------------------------

  async list(
    q: ReviewListQueryDto,
    viewer: Viewer,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<ReviewDto>> {
    const t = this.targetOf(q);
    await this.assertTarget(t, t.type === 'variant' ? 'variantId' : 'stationId');
    const page = toPageRequest(q);
    const now = this.guard.now();
    const where: Prisma.ReviewWhereInput = {
      ...(t.type === 'variant' ? { variantId: t.id } : { stationId: t.id }),
      isDemo: false,
      ...visibleWhere(viewer),
      ...(q.rating ? { rating: q.rating } : {}),
      ...(q.verifiedOnly
        ? {
            isVerifiedOwner: true,
            ownerVerification: {
              status: 'approved',
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          }
        : {}),
    };
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      q.sort === 'helpful'
        ? [{ upvoteCount: 'desc' }, { createdAt: 'desc' }]
        : q.sort === 'rating_high'
          ? [{ rating: 'desc' }, { createdAt: 'desc' }]
          : q.sort === 'rating_low'
            ? [{ rating: 'asc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: REVIEW_INCLUDE,
      }),
      this.prisma.review.count({ where }),
    ]);
    const votes = await this.viewers.myVotes(
      viewer,
      'review',
      rows.map((r) => r.id),
    );
    return paginated(
      rows.map((r) => this.view(r, viewer, votes.get(r.id), lang)),
      total,
      page,
    );
  }

  async summary(q: ReviewSummaryQueryDto, lang: SupportedLanguage): Promise<ReviewSummaryDto> {
    const t = this.targetOf(q);
    await this.assertTarget(t, t.type === 'variant' ? 'variantId' : 'stationId');
    const now = this.guard.now();
    const where: Prisma.ReviewWhereInput = {
      ...(t.type === 'variant' ? { variantId: t.id } : { stationId: t.id }),
      isDemo: false,
      status: 'approved',
      deletedAt: null,
    };
    const [agg, buckets, verified, dims] = await Promise.all([
      this.prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
      this.prisma.review.count({
        where: {
          ...where,
          isVerifiedOwner: true,
          ownerVerification: {
            status: 'approved',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      }),
      this.prisma.reviewRating.groupBy({
        by: ['dimension'],
        where: { review: where },
        _avg: { score: true },
        _count: { _all: true },
      }),
    ]);
    const count = agg._count._all;
    const dimensionKeys: readonly RatingDimension[] =
      t.type === 'variant' ? CAR_DIMENSIONS : STATION_DIMENSIONS;
    const byDim = new Map(dims.map((d) => [d.dimension as string, d]));
    const round1 = (x: number) => Math.round(x * 10) / 10;
    return {
      target: t,
      count,
      average: count > 0 && agg._avg.rating !== null ? round1(agg._avg.rating) : null,
      distribution: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: buckets.find((b) => b.rating === rating)?._count._all ?? 0,
      })),
      verifiedOwnerCount: verified,
      dimensions: dimensionKeys.map((dimension) => {
        const d = byDim.get(dimension);
        const n = d?._count._all ?? 0;
        return {
          dimension,
          label: tr(DIMENSION_LABELS[dimension], lang),
          average: n > 0 && d?._avg.score != null ? round1(d._avg.score) : null,
          count: n,
        };
      }),
    };
  }

  async get(id: string, viewer: Viewer, lang: SupportedLanguage): Promise<ReviewDto> {
    const r = await this.prisma.review.findUnique({ where: { id }, include: REVIEW_INCLUDE });
    if (!r || r.isDemo || !this.viewers.canSee(viewer, r)) throw CommunityErrors.notFound('review');
    const votes = await this.viewers.myVotes(viewer, 'review', [r.id]);
    return this.view(r, viewer, votes.get(r.id), lang);
  }

  // --- writes ------------------------------------------------------------------------------

  async create(
    dto: CreateReviewDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
    market: string | undefined,
  ): Promise<ReviewDto> {
    const t = this.targetOf(dto);
    await this.assertTarget(t, t.type === 'variant' ? 'variantId' : 'stationId');
    this.assertDimensions(t, dto.ratings);
    const poster = await this.guard.assertCanPost(user, ip);
    const parts = { title: dto.title, body: dto.body, pros: dto.pros, cons: dto.cons };

    const review = await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'review', user.id);
      const existing = await tx.review.findFirst({
        where: {
          userId: user.id,
          deletedAt: null,
          ...(t.type === 'variant' ? { variantId: t.id } : { stationId: t.id }),
        },
        select: { id: true },
      });
      if (existing) throw CommunityErrors.reviewExists(existing.id);
      await this.guard.assertRate(tx, 'review', poster);
      const screening = await this.guard.screen(tx, 'review', poster, parts);
      const ownerVerificationId =
        t.type === 'variant' ? await this.approvedVerificationId(tx, user.id, t.id) : null;
      const marketRow = market
        ? await tx.market.findUnique({ where: { code: market }, select: { code: true } })
        : null;
      const review = await tx.review.create({
        data: {
          userId: user.id,
          variantId: t.type === 'variant' ? t.id : null,
          stationId: t.type === 'station' ? t.id : null,
          rating: dto.rating,
          title: dto.title ?? null,
          body: dto.body,
          pros: dto.pros ?? null,
          cons: dto.cons ?? null,
          ownershipMonths: dto.ownershipMonths ?? null,
          locale: dto.locale ?? lang,
          marketCode: marketRow?.code ?? null,
          ownerVerificationId,
          status: screening.status,
          ratings: dto.ratings?.length
            ? {
                create: dto.ratings.map((r) => ({
                  dimension: r.dimension,
                  score: r.score,
                })),
              }
            : undefined,
        },
        include: REVIEW_INCLUDE,
      });
      await this.guard.recordSignals(
        poster,
        { type: 'review', id: review.id },
        screening.signals,
        tx,
      );
      return review;
    });
    return this.view(review, { id: user.id, mutedIds: [], isStaff: false }, undefined, lang);
  }

  private async ownRow(id: string, userId: string) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r || r.deletedAt || r.isDemo) throw CommunityErrors.notFound('review');
    if (r.userId !== userId) throw CommunityErrors.notAuthor();
    return r;
  }

  async update(
    id: string,
    dto: UpdateReviewDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
  ): Promise<ReviewDto> {
    const before = await this.ownRow(id, user.id);
    if (before.status === 'hidden') throw CommunityErrors.notEditable(before.status);
    const t: Target = before.variantId
      ? { type: 'variant', id: before.variantId }
      : { type: 'station', id: before.stationId! };
    this.assertDimensions(t, dto.ratings);
    const poster = await this.guard.assertCanPost(user, ip);
    const parts = {
      title: dto.title !== undefined ? dto.title : before.title,
      body: dto.body ?? before.body,
      pros: dto.pros !== undefined ? dto.pros : before.pros,
      cons: dto.cons !== undefined ? dto.cons : before.cons,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'review', user.id);
      const screening = await this.guard.screen(tx, 'review', poster, parts, { excludeId: id });
      if (dto.ratings) {
        await tx.reviewRating.deleteMany({ where: { reviewId: id } });
        if (dto.ratings.length) {
          await tx.reviewRating.createMany({
            data: dto.ratings.map((r) => ({
              reviewId: id,
              dimension: r.dimension,
              score: r.score,
            })),
          });
        }
      }
      const updated = await tx.review.update({
        where: { id },
        data: {
          rating: dto.rating,
          title: dto.title,
          body: dto.body,
          pros: dto.pros,
          cons: dto.cons,
          ownershipMonths: dto.ownershipMonths,
          // Every edit goes back to the review queue (reviews are pre-moderated).
          status: screening.status,
        },
        include: REVIEW_INCLUDE,
      });
      await this.guard.recordSignals(poster, { type: 'review', id }, screening.signals, tx);
      return updated;
    });
    const votes = await this.viewers.myVotes(
      { id: user.id, mutedIds: [], isStaff: false },
      'review',
      [id],
    );
    return this.view(row, { id: user.id, mutedIds: [], isStaff: false }, votes.get(id), lang);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.ownRow(id, user.id);
    await this.prisma.review.update({ where: { id }, data: { deletedAt: this.guard.now() } });
  }
}
