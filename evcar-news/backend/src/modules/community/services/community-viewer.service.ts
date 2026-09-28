import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import { tr } from '../../../common/validation/messages';
import type { VoteTargetType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../auth';
import { CommunityErrors, fieldError } from '../common/community-errors';
import { DELETED_USER_LABEL } from '../common/labels';
import type { AuthorDto, MutedUserDto, VotesDto } from '../dto/community.dto';
import type { PaginationQueryDto } from '../../../common/http/pagination';

/** Who is looking: guests have no id; staff with community.read also see hidden items by id. */
export interface Viewer {
  id: string | null;
  mutedIds: string[];
  isStaff: boolean;
}

export const AUTHOR_SELECT = { select: { id: true, displayName: true } } as const;

/** Where-clause of publicly visible content (approved, not deleted, muted authors excluded). */
export function visibleWhere(viewer: Viewer) {
  return {
    status: 'approved' as const,
    deletedAt: null,
    ...(viewer.mutedIds.length
      ? { OR: [{ userId: null }, { userId: { notIn: viewer.mutedIds } }] }
      : {}),
  };
}

export function authorOf(
  user: { id: string; displayName: string } | null,
  lang: SupportedLanguage,
): AuthorDto {
  if (!user) return { id: null, displayName: tr(DELETED_USER_LABEL, lang), isDeleted: true };
  return { id: user.id, displayName: user.displayName, isDeleted: false };
}

export function votesOf(
  row: { upvoteCount: number; downvoteCount: number },
  myVote: number | undefined,
): VotesDto {
  return {
    up: row.upvoteCount,
    down: row.downvoteCount,
    score: row.upvoteCount - row.downvoteCount,
    myVote: myVote === 1 ? 1 : myVote === -1 ? -1 : null,
  };
}

const VOTE_COLUMN: Record<VoteTargetType, 'reviewId' | 'commentId' | 'questionId' | 'answerId'> = {
  review: 'reviewId',
  comment: 'commentId',
  question: 'questionId',
  answer: 'answerId',
};

/**
 * Viewer context (mutes, own votes) and user mutes (“block this user” in the
 * app: hides that user's community content for the muting user only).
 */
@Injectable()
export class CommunityViewerService {
  constructor(private readonly prisma: PrismaService) {}

  async viewer(user: AuthUser | undefined): Promise<Viewer> {
    if (!user) return { id: null, mutedIds: [], isStaff: false };
    const mutes = await this.prisma.userMute.findMany({
      where: { userId: user.id },
      select: { mutedUserId: true },
    });
    return {
      id: user.id,
      mutedIds: mutes.map((m) => m.mutedUserId),
      isStaff:
        user.permissions.includes('community.read') ||
        user.permissions.includes('community.moderate'),
    };
  }

  /** The viewer's votes on the given targets (targetId → +1 / -1). */
  async myVotes(viewer: Viewer, type: VoteTargetType, ids: string[]): Promise<Map<string, number>> {
    if (!viewer.id || !ids.length) return new Map();
    const col = VOTE_COLUMN[type];
    const rows = await this.prisma.communityVote.findMany({
      where: { userId: viewer.id, [col]: { in: ids } },
      select: { reviewId: true, commentId: true, questionId: true, answerId: true, value: true },
    });
    return new Map(rows.map((r) => [r[col] as string, r.value]));
  }

  /**
   * May the viewer see an item that is not publicly visible? Authors see
   * their own pending / hidden / rejected items; community staff see all.
   * Deleted items are only for staff.
   */
  canSee(
    viewer: Viewer,
    row: { status: string; deletedAt: Date | null; userId: string | null },
  ): boolean {
    if (viewer.isStaff) return true;
    if (row.deletedAt) return false;
    if (row.status === 'approved') {
      return !(row.userId && viewer.mutedIds.includes(row.userId));
    }
    return !!viewer.id && row.userId === viewer.id;
  }

  // --- mutes -----------------------------------------------------------------------------------

  async listMutes(userId: string, q: PaginationQueryDto): Promise<PaginatedResponse<MutedUserDto>> {
    const page = toPageRequest(q);
    const [rows, total] = await Promise.all([
      this.prisma.userMute.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
        include: { mutedUser: { select: { id: true, displayName: true } } },
      }),
      this.prisma.userMute.count({ where: { userId } }),
    ]);
    return paginated(
      rows.map((r) => ({
        userId: r.mutedUserId,
        displayName: r.mutedUser.displayName,
        mutedAt: r.createdAt.toISOString(),
      })),
      total,
      page,
    );
  }

  async mute(userId: string, mutedUserId: string): Promise<MutedUserDto> {
    if (userId === mutedUserId) {
      throw fieldError('userId', 'notSelf', {
        ar: 'لا يمكنك حظر نفسك.',
        en: 'You cannot block yourself.',
      });
    }
    const target = await this.prisma.user.findUnique({
      where: { id: mutedUserId },
      select: { id: true, displayName: true },
    });
    if (!target) throw CommunityErrors.notFound('user');
    const row = await this.prisma.userMute.upsert({
      where: { userId_mutedUserId: { userId, mutedUserId } },
      create: { userId, mutedUserId },
      update: {},
    });
    return {
      userId: target.id,
      displayName: target.displayName,
      mutedAt: row.createdAt.toISOString(),
    };
  }

  async unmute(userId: string, mutedUserId: string): Promise<void> {
    await this.prisma.userMute.deleteMany({ where: { userId, mutedUserId } });
  }
}
