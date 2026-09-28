import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { type PaginationQueryDto, toPageRequest } from '../../../common/http/pagination';
import { tr } from '../../../common/validation/messages';
import type { ContentReport } from '../../../generated/prisma/client';
import type { CommunityTargetType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../auth';
import { CommunityErrors, fieldError } from '../common/community-errors';
import { COMMUNITY_POLICY, SIGNAL_SCORES } from '../common/community-rules';
import { REPORT_REASON_FALLBACK } from '../common/labels';
import type {
  ContentReportDto,
  CreateContentReportDto,
  ReportReasonDto,
  VoteDto,
  VoteResultDto,
  VoteTarget,
} from '../dto/community.dto';
import { CommunityGuardService } from './community-guard.service';
import { votesOf } from './community-viewer.service';

interface ContentRow {
  id: string;
  userId: string | null;
  status: string;
  deletedAt: Date | null;
  upvoteCount: number;
  downvoteCount: number;
}

/**
 * Helpful votes (+1 / -1, one per user and item; counters kept by DB
 * trigger) and user reports of community content or users (one open report
 * per reporter and target). Enough distinct open reports send published
 * content back to the review queue until a moderator decides.
 */
@Injectable()
export class VotesReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: CommunityGuardService,
  ) {}

  /** A community item of any type (null when missing). */
  async contentRow(type: VoteTarget, id: string): Promise<ContentRow | null> {
    const select = {
      id: true,
      userId: true,
      status: true,
      deletedAt: true,
      upvoteCount: true,
      downvoteCount: true,
    } as const;
    switch (type) {
      case 'review':
        return this.prisma.review.findFirst({ where: { id, isDemo: false }, select });
      case 'comment':
        return this.prisma.comment.findUnique({ where: { id }, select });
      case 'question':
        return this.prisma.question.findUnique({ where: { id }, select });
      case 'answer':
        return this.prisma.answer.findUnique({ where: { id }, select });
    }
  }

  async vote(dto: VoteDto, user: AuthUser, ip: string | undefined): Promise<VoteResultDto> {
    const row = await this.contentRow(dto.targetType, dto.targetId);
    if (!row || row.deletedAt || row.status !== 'approved') {
      throw CommunityErrors.notFound(dto.targetType);
    }
    if (row.userId === user.id) throw CommunityErrors.selfVote();
    const poster = await this.guard.assertCanPost(user, ip);
    const col = `${dto.targetType}Id`;
    await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'vote', user.id);
      if (dto.value === 0) {
        await tx.communityVote.deleteMany({ where: { userId: user.id, [col]: dto.targetId } });
        return;
      }
      await this.guard.assertRate(tx, 'vote', poster);
      const existing = await tx.communityVote.findFirst({
        where: { userId: user.id, [col]: dto.targetId },
        select: { id: true, value: true },
      });
      if (existing) {
        if (existing.value !== dto.value) {
          await tx.communityVote.update({ where: { id: existing.id }, data: { value: dto.value } });
        }
      } else {
        await tx.communityVote.create({
          data: {
            userId: user.id,
            targetType: dto.targetType,
            [col]: dto.targetId,
            value: dto.value,
          },
        });
      }
    });
    const after = await this.contentRow(dto.targetType, dto.targetId);
    return {
      targetType: dto.targetType,
      targetId: dto.targetId,
      votes: votesOf(after ?? row, dto.value === 0 ? undefined : dto.value),
    };
  }

  // --- reports -----------------------------------------------------------------------------

  async reasonLabels(): Promise<Map<string, { ar: string; en: string; requiresDetails: boolean }>> {
    const rows = await this.prisma.reportReason.findMany({ where: { scope: 'content' } });
    return new Map(
      rows.map((r) => [
        r.code,
        { ar: r.labelAr, en: r.labelEn, requiresDetails: r.requiresDetails },
      ]),
    );
  }

  async reasons(lang: SupportedLanguage): Promise<ReportReasonDto[]> {
    const rows = await this.prisma.reportReason.findMany({
      where: { scope: 'content', isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map((r) => ({
      code: r.code,
      label: lang === 'ar' ? r.labelAr : r.labelEn,
      description: (lang === 'ar' ? r.descriptionAr : r.descriptionEn) ?? null,
      requiresDetails: r.requiresDetails,
    }));
  }

  reportView(
    r: ContentReport,
    labels: Map<string, { ar: string; en: string }>,
    lang: SupportedLanguage,
  ): ContentReportDto {
    return {
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      reasonLabel: labels.get(r.reason)?.[lang] ?? tr(REPORT_REASON_FALLBACK[r.reason], lang),
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async report(
    dto: CreateContentReportDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
  ): Promise<ContentReportDto> {
    let contentAuthor: string | null = null;
    let contentStatus: string | null = null;
    if (dto.targetType === 'user') {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.targetId },
        select: { id: true },
      });
      if (!u) throw CommunityErrors.notFound('user');
      if (u.id === user.id) throw CommunityErrors.selfReport();
    } else {
      const row = await this.contentRow(dto.targetType, dto.targetId);
      // Reporters can only report what they can see.
      if (!row || row.deletedAt || (row.status !== 'approved' && row.userId !== user.id)) {
        throw CommunityErrors.notFound(dto.targetType);
      }
      if (row.userId === user.id) throw CommunityErrors.selfReport();
      contentAuthor = row.userId;
      contentStatus = row.status;
    }
    const labels = await this.reasonLabels();
    const reason = labels.get(dto.reason);
    const needsDetails = reason ? reason.requiresDetails : dto.reason === 'other';
    if (needsDetails && !dto.details) {
      throw fieldError('details', 'required', {
        ar: 'اكتب وصفًا مختصرًا لسبب البلاغ.',
        en: 'Describe the reason briefly.',
      });
    }
    const poster = await this.guard.assertCanPost(user, ip);
    const targetType = dto.targetType as CommunityTargetType;
    const created = await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'report', user.id);
      const open = await tx.contentReport.findFirst({
        where: {
          reporterId: user.id,
          targetType,
          targetId: dto.targetId,
          status: { in: ['open', 'in_review'] },
        },
        select: { id: true },
      });
      if (open) throw CommunityErrors.reportDuplicate(open.id);
      await this.guard.assertRate(tx, 'report', poster);
      const report = await tx.contentReport.create({
        data: {
          reporterId: user.id,
          targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          details: dto.details ?? null,
        },
      });
      if (dto.targetType !== 'user' && contentStatus === 'approved') {
        const reporters = await tx.contentReport.findMany({
          where: { targetType, targetId: dto.targetId, status: { in: ['open', 'in_review'] } },
          distinct: ['reporterId'],
          select: { reporterId: true },
        });
        if (reporters.length >= COMMUNITY_POLICY.autoHoldReports) {
          await this.holdForReview(tx, dto.targetType, dto.targetId);
          await this.guard.recordSignals(
            contentAuthor ? { id: contentAuthor, ipHash: null } : null,
            { type: targetType, id: dto.targetId },
            [
              {
                signal: 'user_reports',
                score: SIGNAL_SCORES.user_reports,
                details: { openReports: reporters.length, heldForReview: true },
              },
            ],
            tx,
          );
        }
      }
      return report;
    });
    return this.reportView(created, labels, lang);
  }

  private async holdForReview(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    type: VoteTarget,
    id: string,
  ): Promise<void> {
    const where = { id, status: 'approved' as const };
    const data = { status: 'pending' as const };
    switch (type) {
      case 'review':
        await tx.review.updateMany({ where, data });
        break;
      case 'comment':
        await tx.comment.updateMany({ where, data });
        break;
      case 'question':
        await tx.question.updateMany({ where, data });
        break;
      case 'answer':
        await tx.answer.updateMany({ where, data });
        break;
    }
  }

  async myReports(
    userId: string,
    q: PaginationQueryDto,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<ContentReportDto>> {
    const page = toPageRequest(q);
    const where = { reporterId: userId };
    const [rows, total, labels] = await Promise.all([
      this.prisma.contentReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.contentReport.count({ where }),
      this.reasonLabels(),
    ]);
    return paginated(
      rows.map((r) => this.reportView(r, labels, lang)),
      total,
      page,
    );
  }
}
