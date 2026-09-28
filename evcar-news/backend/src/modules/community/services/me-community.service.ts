import { Injectable } from '@nestjs/common';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../auth';
import { COMMUNITY_POLICY, excerpt, isNewAccount } from '../common/community-rules';
import type { CommunityStatusDto, MyContentItemDto, MyContentQueryDto } from '../dto/community.dto';
import { commentTargetOf } from './comments.service';
import { CommunityGuardService } from './community-guard.service';
import { votesOf } from './community-viewer.service';
import { questionTargetOf } from './questions.service';

/**
 * The signed-in user's own community content in every moderation state
 * (so the app can show "waiting for review" / "hidden by a moderator") and
 * whether they may post right now.
 */
@Injectable()
export class MeCommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: CommunityGuardService,
  ) {}

  async status(user: AuthUser): Promise<CommunityStatusDto> {
    const [block, row] = await Promise.all([
      this.guard.activeBlock(user.id),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } }),
    ]);
    const now = this.guard.now();
    const isNew = isNewAccount(row.createdAt, now);
    return {
      canPost: user.emailVerified && !block,
      emailVerified: user.emailVerified,
      isNewAccount: isNew,
      newAccountUntil: isNew
        ? new Date(row.createdAt.getTime() + COMMUNITY_POLICY.newAccountMs).toISOString()
        : null,
      block: block
        ? {
            scope: block.scope,
            reason: block.reason,
            expiresAt: block.expiresAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async content(
    userId: string,
    q: MyContentQueryDto,
  ): Promise<PaginatedResponse<MyContentItemDto>> {
    const page = toPageRequest(q);
    const where = { userId, deletedAt: null };
    const args = {
      where,
      orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }],
      skip: page.skip,
      take: page.take,
    };
    let items: MyContentItemDto[];
    let total: number;
    switch (q.type) {
      case 'review': {
        const [rows, n] = await Promise.all([
          this.prisma.review.findMany({ ...args, where: { ...where, isDemo: false } }),
          this.prisma.review.count({ where: { ...where, isDemo: false } }),
        ]);
        total = n;
        items = rows.map((r) => ({
          type: 'review',
          id: r.id,
          target: r.variantId
            ? { type: 'variant', id: r.variantId }
            : { type: 'station', id: r.stationId! },
          title: r.title,
          excerpt: excerpt(r.body) ?? '',
          status: r.status,
          votes: votesOf(r, undefined),
          createdAt: r.createdAt.toISOString(),
        }));
        break;
      }
      case 'comment': {
        const [rows, n] = await Promise.all([
          this.prisma.comment.findMany(args),
          this.prisma.comment.count({ where }),
        ]);
        total = n;
        items = rows.map((c) => ({
          type: 'comment',
          id: c.id,
          target: commentTargetOf(c),
          title: null,
          excerpt: excerpt(c.body) ?? '',
          status: c.status,
          votes: votesOf(c, undefined),
          createdAt: c.createdAt.toISOString(),
        }));
        break;
      }
      case 'question': {
        const [rows, n] = await Promise.all([
          this.prisma.question.findMany(args),
          this.prisma.question.count({ where }),
        ]);
        total = n;
        items = rows.map((x) => ({
          type: 'question',
          id: x.id,
          target: questionTargetOf(x),
          title: x.title,
          excerpt: excerpt(x.body ?? x.title) ?? '',
          status: x.status,
          votes: votesOf(x, undefined),
          createdAt: x.createdAt.toISOString(),
        }));
        break;
      }
      case 'answer': {
        const [rows, n] = await Promise.all([
          this.prisma.answer.findMany(args),
          this.prisma.answer.count({ where }),
        ]);
        total = n;
        items = rows.map((a) => ({
          type: 'answer',
          id: a.id,
          target: { type: 'question', id: a.questionId },
          title: null,
          excerpt: excerpt(a.body) ?? '',
          status: a.status,
          votes: votesOf(a, undefined),
          createdAt: a.createdAt.toISOString(),
        }));
        break;
      }
    }
    return paginated(items, total, page);
  }
}
