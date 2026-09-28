import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { paginated } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import { tr } from '../../../common/validation/messages';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  CommunityTargetType,
  ContentReportReason,
  ModerationActionType,
  ModerationStatus,
  ReportStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { PRIVILEGED_ROLES } from '../../rbac';
import { CommunityErrors, fieldError } from '../common/community-errors';
import { excerpt } from '../common/community-rules';
import { type ContentReportReasonCode, REPORT_REASON_FALLBACK } from '../common/labels';
import type {
  AdminBlockListQueryDto,
  AdminContentListQueryDto,
  AdminReportListQueryDto,
  BlockUserDto,
  ModerateDto,
  ModerationActionName,
  UnblockUserDto,
  UpdateContentReportDto,
  WarnUserDto,
} from '../dto/admin.dto';
import type { ContentType } from '../dto/community.dto';
import { commentTargetOf } from './comments.service';
import { CommunityGuardService } from './community-guard.service';
import { questionTargetOf } from './questions.service';
import { VotesReportsService } from './votes-reports.service';

const OPEN: ReportStatus[] = ['open', 'in_review'];
const USER_SELECT = {
  select: { id: true, displayName: true, email: true, createdAt: true },
} as const;

interface Item {
  type: ContentType;
  id: string;
  userId: string | null;
  status: ModerationStatus;
  deletedAt: Date | null;
  title: string | null;
  body: string;
  rating: number | null;
  verifiedOwner: boolean | null;
  target: { type: string; id: string } | null;
  parentId: string | null;
  upvoteCount: number;
  downvoteCount: number;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; displayName: string; email: string; createdAt: Date } | null;
}

interface Transition {
  from: (s: ModerationStatus, deleted: boolean) => boolean;
  to: ModerationStatus | null;
  /** How open reports on the item are closed. */
  reports: 'resolved' | 'rejected';
  dbAction: ModerationActionType;
}

const TRANSITIONS: Record<ModerationActionName, Transition> = {
  approve: {
    from: (s, d) => !d && s === 'pending',
    to: 'approved',
    reports: 'rejected',
    dbAction: 'approve',
  },
  reject: {
    from: (s, d) => !d && s === 'pending',
    to: 'rejected',
    reports: 'resolved',
    dbAction: 'reject',
  },
  hide: {
    from: (s, d) => !d && (s === 'approved' || s === 'pending'),
    to: 'hidden',
    reports: 'resolved',
    dbAction: 'hide',
  },
  restore: {
    from: (s, d) => d || s === 'hidden' || s === 'rejected',
    to: 'approved',
    reports: 'rejected',
    dbAction: 'restore',
  },
  delete: { from: (_s, d) => !d, to: null, reports: 'resolved', dbAction: 'delete' },
};

/**
 * Admin moderation API (community_moderator): review queues per content type,
 * moderation actions (approve / reject / hide / restore / delete) with an
 * audit trail in moderation_actions + audit_logs, the content-report queue,
 * user blocks ("ban") and warnings, and a per-user overview (history, spam
 * signals).
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: CommunityGuardService,
    private readonly audit: AuditService,
    private readonly reports: VotesReportsService,
  ) {}

  // --- generic content access ------------------------------------------------------------

  private async fetch(
    type: ContentType,
    where: Record<string, unknown>,
    opts: { orderBy?: Record<string, unknown>[]; skip?: number; take?: number } = {},
  ): Promise<Item[]> {
    const args = { where, orderBy: opts.orderBy, skip: opts.skip, take: opts.take };
    switch (type) {
      case 'review':
        return (
          await this.prisma.review.findMany({
            ...(args as Prisma.ReviewFindManyArgs),
            include: { user: USER_SELECT },
          })
        ).map((r) => ({
          type,
          id: r.id,
          userId: r.userId,
          status: r.status,
          deletedAt: r.deletedAt,
          title: r.title,
          body: [r.body, r.pros && `+ ${r.pros}`, r.cons && `- ${r.cons}`]
            .filter(Boolean)
            .join('\n'),
          rating: r.rating,
          verifiedOwner: r.isVerifiedOwner,
          target: r.variantId
            ? { type: 'variant', id: r.variantId }
            : { type: 'station', id: r.stationId! },
          parentId: null,
          upvoteCount: r.upvoteCount,
          downvoteCount: r.downvoteCount,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          user: r.user,
        }));
      case 'comment':
        return (
          await this.prisma.comment.findMany({
            ...(args as Prisma.CommentFindManyArgs),
            include: { user: USER_SELECT },
          })
        ).map((c) => ({
          type,
          id: c.id,
          userId: c.userId,
          status: c.status,
          deletedAt: c.deletedAt,
          title: null,
          body: c.body,
          rating: null,
          verifiedOwner: null,
          target: commentTargetOf(c),
          parentId: c.parentId,
          upvoteCount: c.upvoteCount,
          downvoteCount: c.downvoteCount,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          user: c.user,
        }));
      case 'question':
        return (
          await this.prisma.question.findMany({
            ...(args as Prisma.QuestionFindManyArgs),
            include: { user: USER_SELECT },
          })
        ).map((q) => ({
          type,
          id: q.id,
          userId: q.userId,
          status: q.status,
          deletedAt: q.deletedAt,
          title: q.title,
          body: q.body ?? '',
          rating: null,
          verifiedOwner: null,
          target: questionTargetOf(q),
          parentId: null,
          upvoteCount: q.upvoteCount,
          downvoteCount: q.downvoteCount,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          user: q.user,
        }));
      case 'answer':
        return (
          await this.prisma.answer.findMany({
            ...(args as Prisma.AnswerFindManyArgs),
            include: { user: USER_SELECT },
          })
        ).map((a) => ({
          type,
          id: a.id,
          userId: a.userId,
          status: a.status,
          deletedAt: a.deletedAt,
          title: null,
          body: a.body,
          rating: null,
          verifiedOwner: null,
          target: { type: 'question', id: a.questionId },
          parentId: null,
          upvoteCount: a.upvoteCount,
          downvoteCount: a.downvoteCount,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          user: a.user,
        }));
    }
  }

  private count(type: ContentType, where: Record<string, unknown>): Promise<number> {
    switch (type) {
      case 'review':
        return this.prisma.review.count({ where: where });
      case 'comment':
        return this.prisma.comment.count({ where: where });
      case 'question':
        return this.prisma.question.count({ where: where });
      case 'answer':
        return this.prisma.answer.count({ where: where });
    }
  }

  private async setState(
    tx: Prisma.TransactionClient,
    type: ContentType,
    id: string,
    data: { status?: ModerationStatus; deletedAt?: Date | null },
  ): Promise<void> {
    switch (type) {
      case 'review':
        await tx.review.update({ where: { id }, data });
        break;
      case 'comment':
        await tx.comment.update({ where: { id }, data });
        break;
      case 'question':
        await tx.question.update({ where: { id }, data });
        break;
      case 'answer':
        await tx.answer.update({ where: { id }, data });
        break;
    }
  }

  private async one(type: ContentType, id: string): Promise<Item> {
    const [item] = await this.fetch(type, type === 'review' ? { id, isDemo: false } : { id });
    if (!item) throw CommunityErrors.notFound(type);
    return item;
  }

  private async reportStats(type: ContentType | 'user', ids: string[]) {
    if (!ids.length) return { reports: new Map<string, number>(), spam: new Map<string, number>() };
    const targetType = type as CommunityTargetType;
    const [reports, spam] = await Promise.all([
      this.prisma.contentReport.groupBy({
        by: ['targetId'],
        where: { targetType, targetId: { in: ids }, status: { in: OPEN } },
        _count: { _all: true },
      }),
      this.prisma.spamSignal.groupBy({
        by: ['targetId'],
        where: { targetType, targetId: { in: ids } },
        _sum: { score: true },
      }),
    ]);
    return {
      reports: new Map(reports.map((r) => [r.targetId, r._count._all])),
      spam: new Map(spam.map((s) => [s.targetId!, s._sum.score ?? 0])),
    };
  }

  private itemView(i: Item, stats: { reports: Map<string, number>; spam: Map<string, number> }) {
    return {
      type: i.type,
      id: i.id,
      status: i.status,
      deletedAt: i.deletedAt?.toISOString() ?? null,
      title: i.title,
      body: i.body,
      excerpt: excerpt(i.title ? `${i.title} — ${i.body}` : i.body),
      rating: i.rating,
      verifiedOwner: i.verifiedOwner,
      target: i.target,
      parentId: i.parentId,
      author: i.user
        ? {
            id: i.user.id,
            displayName: i.user.displayName,
            email: i.user.email,
            createdAt: i.user.createdAt.toISOString(),
          }
        : null,
      votes: { up: i.upvoteCount, down: i.downvoteCount },
      openReports: stats.reports.get(i.id) ?? 0,
      spamScore: stats.spam.get(i.id) ?? 0,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    };
  }

  // --- queues ------------------------------------------------------------------------------

  async overview() {
    const types: ContentType[] = ['review', 'comment', 'question', 'answer'];
    const now = this.guard.now();
    const [pending, openReports, pendingVerifications, activeBlocks] = await Promise.all([
      Promise.all(types.map((t) => this.count(t, { status: 'pending', deletedAt: null }))),
      this.prisma.contentReport.count({ where: { status: { in: OPEN } } }),
      this.prisma.ownerVerification.count({ where: { status: 'pending' } }),
      this.prisma.userBlock.count({
        where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      }),
    ]);
    return {
      pending: Object.fromEntries(types.map((t, i) => [t, pending[i]])),
      openReports,
      pendingVerifications,
      activeBlocks,
    };
  }

  async list(type: ContentType, q: AdminContentListQueryDto) {
    const page = toPageRequest(q);
    const where: Record<string, unknown> = {
      status: { in: q.status?.length ? q.status : ['pending'] },
      ...(q.includeDeleted ? {} : { deletedAt: null }),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(type === 'review' ? { isDemo: false } : {}),
    };
    if (q.q) {
      const text = { contains: q.q, mode: 'insensitive' };
      where.OR =
        type === 'review' || type === 'question'
          ? [{ title: text }, { body: text }]
          : [{ body: text }];
    }
    const targetType = type as CommunityTargetType;
    if (q.reported || q.sort === 'most_reported') {
      const grouped = await this.prisma.contentReport.groupBy({
        by: ['targetId'],
        where: { targetType, status: { in: OPEN } },
        _count: { _all: true },
        orderBy: { _count: { targetId: 'desc' } },
      });
      where.id = { in: grouped.map((g) => g.targetId) };
      if (q.sort === 'most_reported') {
        const order = new Map(grouped.map((g, idx) => [g.targetId, idx]));
        const all = await this.fetch(type, where);
        all.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        const slice = all.slice(page.skip, page.skip + page.take);
        const stats = await this.reportStats(
          type,
          slice.map((i) => i.id),
        );
        return paginated(
          slice.map((i) => this.itemView(i, stats)),
          all.length,
          page,
        );
      }
    }
    const orderBy = [{ createdAt: q.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }];
    const [items, total] = await Promise.all([
      this.fetch(type, where, { orderBy, skip: page.skip, take: page.take }),
      this.count(type, where),
    ]);
    const stats = await this.reportStats(
      type,
      items.map((i) => i.id),
    );
    return paginated(
      items.map((i) => this.itemView(i, stats)),
      total,
      page,
    );
  }

  async detail(type: ContentType, id: string, lang: SupportedLanguage) {
    const item = await this.one(type, id);
    const targetType = type as CommunityTargetType;
    const [stats, reports, actions, signals, labels] = await Promise.all([
      this.reportStats(type, [id]),
      this.prisma.contentReport.findMany({
        where: { targetType, targetId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { reporter: { select: { id: true, displayName: true } } },
      }),
      this.prisma.moderationAction.findMany({
        where: { targetType, targetId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { moderator: { select: { id: true, displayName: true } } },
      }),
      this.prisma.spamSignal.findMany({
        where: { targetType, targetId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.reports.reasonLabels(),
    ]);
    return {
      ...this.itemView(item, stats),
      reports: reports.map((r) => ({
        ...this.reports.reportView(r, labels, lang),
        reporter: r.reporter,
        handledAt: r.handledAt?.toISOString() ?? null,
      })),
      history: actions.map((a) => this.actionView(a)),
      spamSignals: signals.map((s) => ({
        signal: s.signal,
        score: s.score,
        details: s.details,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  private actionView(
    a: Prisma.ModerationActionGetPayload<{
      include: { moderator: { select: { id: true; displayName: true } } };
    }>,
  ) {
    return {
      id: a.id,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      reason: a.reason,
      reportId: a.reportId,
      moderator: a.moderator,
      createdAt: a.createdAt.toISOString(),
    };
  }

  async moderate(
    type: ContentType,
    id: string,
    dto: ModerateDto,
    moderatorId: string,
    lang: SupportedLanguage,
  ) {
    const item = await this.one(type, id);
    const t = TRANSITIONS[dto.action];
    if (!t.from(item.status, !!item.deletedAt)) {
      throw CommunityErrors.invalidTransition(item.deletedAt ? 'deleted' : item.status, dto.action);
    }
    const targetType = type as CommunityTargetType;
    if (dto.reportId) {
      const r = await this.prisma.contentReport.findFirst({
        where: { id: dto.reportId, targetType, targetId: id },
        select: { id: true },
      });
      if (!r) {
        throw fieldError('reportId', 'sameTarget', {
          ar: 'البلاغ لا يخص هذا المحتوى.',
          en: 'The report is not about this item.',
        });
      }
    }
    const now = this.guard.now();
    await this.prisma.$transaction(async (tx) => {
      if (dto.action === 'delete') {
        await this.setState(tx, type, id, { deletedAt: now });
        if (type === 'answer') {
          await tx.question.updateMany({
            where: { acceptedAnswerId: id },
            data: { acceptedAnswerId: null },
          });
        }
      } else {
        await this.setState(tx, type, id, {
          status: t.to!,
          ...(dto.action === 'restore' ? { deletedAt: null } : {}),
        });
      }
      await tx.moderationAction.create({
        data: {
          moderatorId,
          targetType,
          targetId: id,
          action: t.dbAction,
          reason: dto.reason ?? null,
          reportId: dto.reportId ?? null,
        },
      });
      await tx.contentReport.updateMany({
        where: { targetType, targetId: id, status: { in: OPEN } },
        data: { status: t.reports, handledById: moderatorId, handledAt: now },
      });
    });
    this.audit.annotate({
      entityType: `community_${type}`,
      entityId: id,
      before: { status: item.status, deletedAt: item.deletedAt?.toISOString() ?? null },
      after: { action: dto.action, reason: dto.reason ?? null },
    });
    return this.detail(type, id, lang);
  }

  // --- reports -----------------------------------------------------------------------------

  async listReports(q: AdminReportListQueryDto, lang: SupportedLanguage) {
    const page = toPageRequest(q);
    const where: Prisma.ContentReportWhereInput = {
      status: { in: (q.status?.length ? q.status : OPEN) as ReportStatus[] },
      ...(q.targetType?.length
        ? { targetType: { in: q.targetType as CommunityTargetType[] } }
        : {}),
      ...(q.reason?.length ? { reason: { in: q.reason as ContentReportReason[] } } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
    };
    const [rows, total, labels] = await Promise.all([
      this.prisma.contentReport.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: {
          reporter: { select: { id: true, displayName: true } },
          handledBy: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.contentReport.count({ where }),
      this.reports.reasonLabels(),
    ]);
    // Snapshot of each reported item (or user) for the queue.
    const snapshots = new Map<string, unknown>();
    for (const type of ['review', 'comment', 'question', 'answer'] as const) {
      const ids = rows.filter((r) => r.targetType === type).map((r) => r.targetId);
      if (!ids.length) continue;
      for (const i of await this.fetch(type, { id: { in: ids } })) {
        snapshots.set(`${type}:${i.id}`, {
          status: i.status,
          deleted: !!i.deletedAt,
          excerpt: excerpt(i.title ? `${i.title} — ${i.body}` : i.body),
          author: i.user ? { id: i.user.id, displayName: i.user.displayName } : null,
        });
      }
    }
    const userIds = rows.filter((r) => r.targetType === 'user').map((r) => r.targetId);
    if (userIds.length) {
      for (const u of await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, status: true },
      })) {
        snapshots.set(`user:${u.id}`, { displayName: u.displayName, accountStatus: u.status });
      }
    }
    return paginated(
      rows.map((r) => ({
        ...this.reports.reportView(r, labels, lang),
        reporter: r.reporter,
        handledBy: r.handledBy,
        handledAt: r.handledAt?.toISOString() ?? null,
        target: snapshots.get(`${r.targetType}:${r.targetId}`) ?? null,
      })),
      total,
      page,
    );
  }

  async updateReport(
    id: string,
    dto: UpdateContentReportDto,
    moderatorId: string,
    lang: SupportedLanguage,
  ) {
    const before = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!before) throw CommunityErrors.notFound('content_report');
    const closing = dto.status === 'resolved' || dto.status === 'rejected';
    if (dto.status === 'open' || dto.status === 'in_review') {
      // Re-opening must not collide with another open report of the same reporter.
      const other = before.reporterId
        ? await this.prisma.contentReport.findFirst({
            where: {
              id: { not: id },
              reporterId: before.reporterId,
              targetType: before.targetType,
              targetId: before.targetId,
              status: { in: OPEN },
            },
            select: { id: true },
          })
        : null;
      if (other) throw CommunityErrors.reportDuplicate(other.id);
    }
    const after = await this.prisma.contentReport.update({
      where: { id },
      data: {
        status: dto.status,
        handledById: closing ? moderatorId : null,
        handledAt: closing ? this.guard.now() : null,
      },
    });
    this.audit.annotate({
      entityType: 'content_report',
      entityId: id,
      before: { status: before.status },
      after: { status: after.status },
    });
    return this.reports.reportView(after, await this.reports.reasonLabels(), lang);
  }

  // --- users: blocks ("ban"), warnings, overview ---------------------------------------------

  private blockView(
    b: Prisma.UserBlockGetPayload<{
      include: {
        user: { select: { id: true; displayName: true } };
        blockedBy: { select: { id: true; displayName: true } };
      };
    }>,
  ) {
    const now = this.guard.now();
    return {
      id: b.id,
      user: b.user,
      blockedBy: b.blockedBy,
      scope: b.scope,
      reason: b.reason,
      expiresAt: b.expiresAt?.toISOString() ?? null,
      revokedAt: b.revokedAt?.toISOString() ?? null,
      active: !b.revokedAt && (!b.expiresAt || b.expiresAt > now),
      createdAt: b.createdAt.toISOString(),
    };
  }

  private readonly blockInclude = {
    user: { select: { id: true, displayName: true } },
    blockedBy: { select: { id: true, displayName: true } },
  } as const;

  async listBlocks(q: AdminBlockListQueryDto) {
    const page = toPageRequest(q);
    const now = this.guard.now();
    const where: Prisma.UserBlockWhereInput = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.active === false
        ? {}
        : { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.userBlock.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: this.blockInclude,
      }),
      this.prisma.userBlock.count({ where }),
    ]);
    return paginated(
      rows.map((b) => this.blockView(b)),
      total,
      page,
    );
  }

  private async assertBlockable(userId: string, moderatorId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, roles: { select: { role: { select: { key: true } } } } },
    });
    if (!target) throw CommunityErrors.notFound('user');
    if (userId === moderatorId || target.roles.some((r) => PRIVILEGED_ROLES.includes(r.role.key))) {
      throw CommunityErrors.cannotBlockStaff();
    }
  }

  async block(userId: string, dto: BlockUserDto, moderatorId: string) {
    await this.assertBlockable(userId, moderatorId);
    const now = this.guard.now();
    const scope = dto.scope ?? 'community';
    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (expiresAt.getTime() <= now.getTime()) {
        throw fieldError('expiresAt', 'future', {
          ar: 'تاريخ انتهاء الحظر يجب أن يكون في المستقبل.',
          en: 'The block end must be in the future.',
        });
      }
    }
    const { block, hidden } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`community-block:${userId}`}))`;
      const current = await tx.userBlock.findFirst({ where: { userId, scope, revokedAt: null } });
      if (current) {
        if (!current.expiresAt || current.expiresAt > now)
          throw CommunityErrors.blockExists(current.id);
        // An expired block still occupies the "one active per scope" slot: close it.
        await tx.userBlock.update({ where: { id: current.id }, data: { revokedAt: now } });
      }
      const block = await tx.userBlock.create({
        data: { userId, blockedById: moderatorId, scope, reason: dto.reason, expiresAt },
        include: this.blockInclude,
      });
      let hidden = 0;
      if (dto.hideContent) {
        const where = {
          userId,
          deletedAt: null,
          status: { in: ['approved', 'pending'] as ModerationStatus[] },
        };
        const data = { status: 'hidden' as const };
        hidden += (await tx.review.updateMany({ where, data })).count;
        hidden += (await tx.comment.updateMany({ where, data })).count;
        hidden += (await tx.question.updateMany({ where, data })).count;
        hidden += (await tx.answer.updateMany({ where, data })).count;
      }
      await tx.moderationAction.create({
        data: {
          moderatorId,
          targetType: 'user',
          targetId: userId,
          action: 'block_user',
          reason: `[${scope}${expiresAt ? ` until ${expiresAt.toISOString()}` : ''}${
            dto.hideContent ? `, ${hidden} posts hidden` : ''
          }] ${dto.reason}`,
        },
      });
      return { block, hidden };
    });
    this.audit.annotate({
      entityType: 'user_block',
      entityId: block.id,
      after: { userId, scope, expiresAt: expiresAt?.toISOString() ?? null, hiddenPosts: hidden },
    });
    return { ...this.blockView(block), hiddenPosts: hidden };
  }

  async unblock(userId: string, dto: UnblockUserDto, moderatorId: string) {
    const now = this.guard.now();
    const active = await this.prisma.userBlock.findMany({
      where: { userId, revokedAt: null, ...(dto.scope ? { scope: dto.scope } : {}) },
    });
    if (!active.length) throw CommunityErrors.notFound('user_block');
    await this.prisma.$transaction(async (tx) => {
      await tx.userBlock.updateMany({
        where: { id: { in: active.map((b) => b.id) } },
        data: { revokedAt: now },
      });
      await tx.moderationAction.create({
        data: {
          moderatorId,
          targetType: 'user',
          targetId: userId,
          action: 'unblock_user',
          reason: dto.reason ?? null,
        },
      });
    });
    this.audit.annotate({
      entityType: 'user_block',
      entityId: userId,
      before: { blocks: active.map((b) => ({ id: b.id, scope: b.scope })) },
      after: { revokedAt: now.toISOString() },
    });
    return { userId, revoked: active.length };
  }

  async warn(userId: string, dto: WarnUserDto, moderatorId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) throw CommunityErrors.notFound('user');
    const action = await this.prisma.moderationAction.create({
      data: {
        moderatorId,
        targetType: 'user',
        targetId: userId,
        action: 'warn_user',
        reason: dto.reason,
      },
      include: { moderator: { select: { id: true, displayName: true } } },
    });
    return this.actionView(action);
  }

  async userOverview(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        createdAt: true,
        emailVerifiedAt: true,
      },
    });
    if (!user) throw CommunityErrors.notFound('user');
    const since = new Date(this.guard.now().getTime() - 30 * 86_400_000);
    const byStatus = async (type: ContentType) => {
      const rows = await (async () => {
        switch (type) {
          case 'review':
            return this.prisma.review.groupBy({
              by: ['status'],
              where: { userId },
              _count: { _all: true },
            });
          case 'comment':
            return this.prisma.comment.groupBy({
              by: ['status'],
              where: { userId },
              _count: { _all: true },
            });
          case 'question':
            return this.prisma.question.groupBy({
              by: ['status'],
              where: { userId },
              _count: { _all: true },
            });
          case 'answer':
            return this.prisma.answer.groupBy({
              by: ['status'],
              where: { userId },
              _count: { _all: true },
            });
        }
      })();
      return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    };
    const [
      reviews,
      comments,
      questions,
      answers,
      blocks,
      actions,
      signals,
      reportsAgainst,
      verifications,
    ] = await Promise.all([
      byStatus('review'),
      byStatus('comment'),
      byStatus('question'),
      byStatus('answer'),
      this.prisma.userBlock.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: this.blockInclude,
      }),
      this.prisma.moderationAction.findMany({
        where: { targetType: 'user', targetId: userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { moderator: { select: { id: true, displayName: true } } },
      }),
      this.prisma.spamSignal.groupBy({
        by: ['signal'],
        where: { userId, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { score: true },
      }),
      this.prisma.contentReport.count({
        where: { targetType: 'user', targetId: userId, status: { in: OPEN } },
      }),
      this.prisma.ownerVerification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, variantId: true, status: true, method: true, createdAt: true },
      }),
    ]);
    return {
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      },
      content: { reviews, comments, questions, answers },
      blocks: blocks.map((b) => this.blockView(b)),
      history: actions.map((a) => this.actionView(a)),
      spamSignals30d: signals.map((s) => ({
        signal: s.signal,
        count: s._count._all,
        score: s._sum.score ?? 0,
      })),
      openReportsAgainstUser: reportsAgainst,
      ownerVerifications: verifications.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  }

  /** Label helper for other callers (moderation UI). */
  reasonLabel(code: string, lang: SupportedLanguage): string {
    return tr(
      REPORT_REASON_FALLBACK[code as ContentReportReasonCode] ?? { ar: code, en: code },
      lang,
    );
  }
}
