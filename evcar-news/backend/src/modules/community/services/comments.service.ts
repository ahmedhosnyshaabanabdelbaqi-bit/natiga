import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { type PaginationQueryDto, toPageRequest } from '../../../common/http/pagination';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../auth';
import { CommunityErrors, fieldError } from '../common/community-errors';
import type {
  CommentDto,
  CommentListQueryDto,
  CommentTarget,
  CreateCommentDto,
  UpdateCommentDto,
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

/** Replies embedded in list items (the rest via /comments/:id/replies). */
export const EMBEDDED_REPLIES = 3;

const TARGET_COLUMN: Record<CommentTarget, 'articleId' | 'reviewId' | 'modelId' | 'variantId'> = {
  article: 'articleId',
  review: 'reviewId',
  model: 'modelId',
  variant: 'variantId',
};

const BASE_INCLUDE = { user: AUTHOR_SELECT } satisfies Prisma.CommentInclude;
type BaseRow = Prisma.CommentGetPayload<{ include: typeof BASE_INCLUDE }>;
type ListRow = BaseRow & { replies?: BaseRow[]; _count?: { replies: number } };

export function commentTargetOf(c: {
  articleId: string | null;
  reviewId: string | null;
  modelId: string | null;
  variantId: string | null;
}): { type: CommentTarget; id: string } {
  if (c.articleId) return { type: 'article', id: c.articleId };
  if (c.reviewId) return { type: 'review', id: c.reviewId };
  if (c.modelId) return { type: 'model', id: c.modelId };
  return { type: 'variant', id: c.variantId! };
}

/**
 * Comments on articles, reviews, car model pages and variant pages, with one
 * level of replies (a reply to a reply is attached to the thread root).
 * Published immediately unless the anti-spam screening holds them.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: CommunityGuardService,
    private readonly viewers: CommunityViewerService,
  ) {}

  /** The target must be public; articles must allow comments (writes only). */
  private async assertTarget(type: CommentTarget, id: string, forWrite: boolean): Promise<void> {
    let ok = false;
    switch (type) {
      case 'article': {
        const a = await this.prisma.article.findFirst({
          where: { id, status: 'published', deletedAt: null },
          select: { allowComments: true },
        });
        ok = !!a;
        if (a && forWrite && !a.allowComments) throw CommunityErrors.commentsClosed();
        break;
      }
      case 'review':
        ok = !!(await this.prisma.review.findFirst({
          where: { id, status: 'approved', deletedAt: null, isDemo: false },
          select: { id: true },
        }));
        break;
      case 'model':
        ok = !!(await this.prisma.carModel.findFirst({
          where: { id, status: 'published', deletedAt: null },
          select: { id: true },
        }));
        break;
      case 'variant':
        ok = !!(await this.prisma.vehicleVariant.findFirst({
          where: { id, status: 'published', deletedAt: null },
          select: { id: true },
        }));
        break;
    }
    if (!ok) throw CommunityErrors.targetNotFound('targetId');
  }

  view(
    c: ListRow,
    viewer: Viewer,
    votes: Map<string, number>,
    lang: SupportedLanguage,
  ): CommentDto {
    return {
      id: c.id,
      target: commentTargetOf(c),
      parentId: c.parentId,
      body: c.body,
      author: authorOf(c.user, lang),
      votes: votesOf(c, votes.get(c.id)),
      status: c.status,
      isMine: !!viewer.id && c.userId === viewer.id,
      replyCount: c._count?.replies ?? 0,
      replies: (c.replies ?? []).map((r) => this.view(r, viewer, votes, lang)),
      editedAt: c.editedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async list(
    q: CommentListQueryDto,
    viewer: Viewer,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<CommentDto>> {
    await this.assertTarget(q.targetType, q.targetId, false);
    const page = toPageRequest(q);
    const visible = visibleWhere(viewer);
    const where: Prisma.CommentWhereInput = {
      [TARGET_COLUMN[q.targetType]]: q.targetId,
      parentId: null,
      ...visible,
    };
    const orderBy: Prisma.CommentOrderByWithRelationInput[] =
      q.sort === 'oldest'
        ? [{ createdAt: 'asc' }]
        : q.sort === 'top'
          ? [{ upvoteCount: 'desc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: {
          ...BASE_INCLUDE,
          replies: {
            where: visible,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: EMBEDDED_REPLIES,
            include: BASE_INCLUDE,
          },
          _count: { select: { replies: { where: visible } } },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);
    const ids = rows.flatMap((r) => [r.id, ...r.replies.map((x) => x.id)]);
    const votes = await this.viewers.myVotes(viewer, 'comment', ids);
    return paginated(
      rows.map((r) => this.view(r, viewer, votes, lang)),
      total,
      page,
    );
  }

  private async visibleRoot(id: string, viewer: Viewer) {
    const c = await this.prisma.comment.findUnique({ where: { id }, include: BASE_INCLUDE });
    if (!c || !this.viewers.canSee(viewer, c)) throw CommunityErrors.notFound('comment');
    return c;
  }

  async replies(
    id: string,
    q: PaginationQueryDto,
    viewer: Viewer,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<CommentDto>> {
    const root = await this.visibleRoot(id, viewer);
    if (root.status !== 'approved' || root.deletedAt) {
      // Replies of a hidden thread are hidden with it.
      return paginated([], 0, toPageRequest(q));
    }
    const page = toPageRequest(q);
    const where: Prisma.CommentWhereInput = { parentId: id, ...visibleWhere(viewer) };
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: BASE_INCLUDE,
      }),
      this.prisma.comment.count({ where }),
    ]);
    const votes = await this.viewers.myVotes(
      viewer,
      'comment',
      rows.map((r) => r.id),
    );
    return paginated(
      rows.map((r) => this.view(r, viewer, votes, lang)),
      total,
      page,
    );
  }

  async get(id: string, viewer: Viewer, lang: SupportedLanguage): Promise<CommentDto> {
    const c = await this.visibleRoot(id, viewer);
    const votes = await this.viewers.myVotes(viewer, 'comment', [c.id]);
    return this.view(c, viewer, votes, lang);
  }

  async create(
    dto: CreateCommentDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
  ): Promise<CommentDto> {
    await this.assertTarget(dto.targetType, dto.targetId, true);
    const col = TARGET_COLUMN[dto.targetType];
    let parentId: string | null = null;
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: dto.parentId } });
      if (
        !parent ||
        parent.deletedAt ||
        parent.status !== 'approved' ||
        parent[col] !== dto.targetId
      ) {
        throw fieldError('parentId', 'sameTarget', {
          ar: 'التعليق الذي ترد عليه غير موجود في هذا المحتوى.',
          en: 'The comment you reply to does not exist on this target.',
        });
      }
      parentId = parent.parentId ?? parent.id;
    }
    const poster = await this.guard.assertCanPost(user, ip);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'comment', user.id);
      await this.guard.assertRate(tx, 'comment', poster);
      const screening = await this.guard.screen(tx, 'comment', poster, { body: dto.body });
      const created = await tx.comment.create({
        data: {
          userId: user.id,
          [col]: dto.targetId,
          parentId,
          body: dto.body,
          locale: lang,
          status: screening.status,
        },
        include: BASE_INCLUDE,
      });
      await this.guard.recordSignals(
        poster,
        { type: 'comment', id: created.id },
        screening.signals,
        tx,
      );
      return created;
    });
    return this.view(row, { id: user.id, mutedIds: [], isStaff: false }, new Map(), lang);
  }

  private async ownRow(id: string, userId: string) {
    const c = await this.prisma.comment.findUnique({ where: { id } });
    if (!c || c.deletedAt) throw CommunityErrors.notFound('comment');
    if (c.userId !== userId) throw CommunityErrors.notAuthor();
    return c;
  }

  async update(
    id: string,
    dto: UpdateCommentDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
  ): Promise<CommentDto> {
    const before = await this.ownRow(id, user.id);
    if (before.status === 'hidden' || before.status === 'rejected') {
      throw CommunityErrors.notEditable(before.status);
    }
    const poster = await this.guard.assertCanPost(user, ip);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'comment', user.id);
      const screening = await this.guard.screen(
        tx,
        'comment',
        poster,
        { body: dto.body },
        {
          excludeId: id,
        },
      );
      const updated = await tx.comment.update({
        where: { id },
        data: { body: dto.body, editedAt: this.guard.now(), status: screening.status },
        include: BASE_INCLUDE,
      });
      await this.guard.recordSignals(poster, { type: 'comment', id }, screening.signals, tx);
      return updated;
    });
    const viewer = { id: user.id, mutedIds: [], isStaff: false };
    return this.view(row, viewer, await this.viewers.myVotes(viewer, 'comment', [id]), lang);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.ownRow(id, user.id);
    await this.prisma.comment.update({ where: { id }, data: { deletedAt: this.guard.now() } });
  }
}
