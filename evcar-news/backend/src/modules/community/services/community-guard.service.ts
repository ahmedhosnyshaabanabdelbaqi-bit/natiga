import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config';
import { Prisma } from '../../../generated/prisma/client';
import type { CommunityTargetType, SpamSignalType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../auth';
import { COMMUNITY_CLOCK, type CommunityClock } from '../common/clock';
import { CommunityErrors } from '../common/community-errors';
import {
  checkRate,
  COMMUNITY_POLICY,
  countLinks,
  type ContentKind,
  type HoldReason,
  initialStatus,
  isNewAccount,
  longestWindowMs,
  maxLinksFor,
  SIGNAL_SCORES,
  type WriteKind,
} from '../common/community-rules';

type Db = Prisma.TransactionClient | PrismaService;

export interface Poster {
  id: string;
  newAccount: boolean;
  ipHash: string | null;
}

export interface SignalDraft {
  signal: SpamSignalType;
  score: number;
  contentHash?: string | null;
  details?: Record<string, unknown>;
}

export interface Screening {
  status: 'approved' | 'pending';
  holdReasons: HoldReason[];
  contentHash: string;
  signals: SignalDraft[];
}

export interface TextParts {
  title?: string | null;
  body?: string | null;
  pros?: string | null;
  cons?: string | null;
}

const TABLE: Record<ContentKind, string> = {
  review: 'reviews',
  comment: 'comments',
  question: 'questions',
  answer: 'answers',
};

/**
 * Anti-spam and posting policy of the community (REQUIREMENTS §15):
 *  - only verified e-mail addresses, never while a community / all block is in force;
 *  - per-user sliding-window limits per kind (stricter for new accounts), on
 *    top of the per-IP route throttles;
 *  - link limits (none for new accounts) and links → review queue;
 *  - duplicate detection with the DB content_hash (same normalization as
 *    search): same author → 409, other authors → review queue;
 *  - new accounts' posts wait for a moderator;
 *  - every hit is recorded in spam_signals (IP only as an HMAC).
 */
@Injectable()
export class CommunityGuardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock,
  ) {}

  now(): Date {
    return this.clock.now();
  }

  ipHash(ip: string | undefined): string | null {
    if (!ip) return null;
    return createHmac('sha256', this.config.auth.ipHashSalt || 'evcar-community')
      .update(`community:${ip}`)
      .digest('hex');
  }

  /** Active block of the user (community or all), or null. */
  async activeBlock(userId: string) {
    const now = this.now();
    return this.prisma.userBlock.findFirst({
      where: {
        userId,
        revokedAt: null,
        scope: { in: ['community', 'all'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Verified e-mail, not blocked. Returns the posting context. */
  async assertCanPost(user: AuthUser, ip?: string): Promise<Poster> {
    if (!user.emailVerified) throw CommunityErrors.emailNotVerified();
    const [block, row] = await Promise.all([
      this.activeBlock(user.id),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } }),
    ]);
    if (block) {
      throw CommunityErrors.blocked({
        scope: block.scope,
        reason: block.reason,
        expiresAt: block.expiresAt?.toISOString() ?? null,
      });
    }
    return {
      id: user.id,
      newAccount: isNewAccount(row.createdAt, this.now()),
      ipHash: this.ipHash(ip),
    };
  }

  /** Serializes writes of one user of one kind inside a transaction. */
  async lock(tx: Prisma.TransactionClient, kind: WriteKind, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`community:${kind}:${userId}`}))`;
  }

  private async recentWrites(
    db: Db,
    kind: WriteKind,
    userId: string,
    since: Date,
  ): Promise<Date[]> {
    const where = { createdAt: { gte: since } };
    switch (kind) {
      case 'review':
        return (
          await db.review.findMany({ where: { ...where, userId }, select: { createdAt: true } })
        ).map((r) => r.createdAt);
      case 'comment':
        return (
          await db.comment.findMany({ where: { ...where, userId }, select: { createdAt: true } })
        ).map((r) => r.createdAt);
      case 'question':
        return (
          await db.question.findMany({ where: { ...where, userId }, select: { createdAt: true } })
        ).map((r) => r.createdAt);
      case 'answer':
        return (
          await db.answer.findMany({ where: { ...where, userId }, select: { createdAt: true } })
        ).map((r) => r.createdAt);
      case 'report':
        return (
          await db.contentReport.findMany({
            where: { ...where, reporterId: userId },
            select: { createdAt: true },
          })
        ).map((r) => r.createdAt);
      case 'vote':
        return (
          await db.communityVote.findMany({
            where: { userId, updatedAt: { gte: since } },
            select: { updatedAt: true },
          })
        ).map((r) => r.updatedAt);
    }
  }

  /** Per-user sliding-window limit; records a rate_limited signal and throws 429. */
  async assertRate(db: Db, kind: WriteKind, poster: Poster): Promise<void> {
    const now = this.now();
    const recent = await this.recentWrites(
      db,
      kind,
      poster.id,
      new Date(now.getTime() - longestWindowMs(kind)),
    );
    const res = checkRate(kind, recent, now, poster.newAccount);
    if (res.ok) return;
    const details = {
      kind,
      windowSeconds: (res.rule?.windowMs ?? 0) / 1000,
      limit: poster.newAccount ? res.rule?.newAccountMax : res.rule?.max,
      newAccount: poster.newAccount,
    };
    await this.recordSignals(poster, null, [
      { signal: 'rate_limited', score: SIGNAL_SCORES.rate_limited, details },
    ]);
    throw CommunityErrors.rateLimited(res.retryAfterSeconds, details);
  }

  /** content_hash + normalized length exactly as the DB trigger computes them. */
  async hashOf(db: Db, parts: TextParts): Promise<{ hash: string; normalizedLength: number }> {
    const rows = await db.$queryRaw<{ h: string; n: number }[]>`
      SELECT encode(sha256(convert_to(coalesce(app_normalize_text(
               concat_ws(' ', ${parts.title ?? null}::text, ${parts.body ?? null}::text,
                         ${parts.pros ?? null}::text, ${parts.cons ?? null}::text)), ''), 'UTF8')), 'hex') AS h,
             length(coalesce(app_normalize_text(
               concat_ws(' ', ${parts.title ?? null}::text, ${parts.body ?? null}::text,
                         ${parts.pros ?? null}::text, ${parts.cons ?? null}::text)), ''))::int AS n`;
    return { hash: rows[0].h, normalizedLength: Number(rows[0].n) };
  }

  private async findSameHash(
    db: Db,
    kind: ContentKind,
    hash: string,
    since: Date,
    opts: { userId: string; sameUser: boolean; excludeId?: string },
  ): Promise<string | null> {
    const table = Prisma.raw(`"${TABLE[kind]}"`);
    const userCond = opts.sameUser
      ? Prisma.sql`"user_id" = ${opts.userId}::uuid`
      : Prisma.sql`"user_id" IS DISTINCT FROM ${opts.userId}::uuid`;
    const exclude = opts.excludeId ? Prisma.sql`AND "id" <> ${opts.excludeId}::uuid` : Prisma.empty;
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id"::text AS id FROM ${table}
      WHERE "content_hash" = ${hash} AND ${userCond} AND "deleted_at" IS NULL
        AND "created_at" >= ${since} ${exclude}
      ORDER BY "created_at" DESC LIMIT 1`;
    return rows[0]?.id ?? null;
  }

  /**
   * Link limit, duplicate detection and new-account hold for a text about to
   * be stored. Throws 422 (too many links) or 409 (same author duplicate).
   */
  async screen(
    db: Db,
    kind: ContentKind,
    poster: Poster,
    parts: TextParts,
    opts: { excludeId?: string; linkField?: string } = {},
  ): Promise<Screening> {
    const signals: SignalDraft[] = [];
    const holds: HoldReason[] = [];
    const links =
      countLinks(parts.title) +
      countLinks(parts.body) +
      countLinks(parts.pros) +
      countLinks(parts.cons);
    const maxLinks = maxLinksFor(poster.newAccount);
    if (links > maxLinks) {
      await this.recordSignals(poster, null, [
        {
          signal: 'link_spam',
          score: SIGNAL_SCORES.link_spam * 2,
          details: { kind, links, maxLinks },
        },
      ]);
      throw CommunityErrors.tooManyLinks(opts.linkField ?? 'body', maxLinks);
    }
    if (links > 0) {
      holds.push('links');
      signals.push({
        signal: 'link_spam',
        score: SIGNAL_SCORES.link_spam,
        details: { kind, links },
      });
    }

    const { hash, normalizedLength } = await this.hashOf(db, parts);
    const now = this.now().getTime();
    const mine = await this.findSameHash(
      db,
      kind,
      hash,
      new Date(now - COMMUNITY_POLICY.duplicateWindowMs),
      { userId: poster.id, sameUser: true, excludeId: opts.excludeId },
    );
    if (mine) {
      await this.recordSignals(poster, null, [
        {
          signal: 'duplicate_content',
          score: SIGNAL_SCORES.duplicate_content,
          contentHash: hash,
          details: { kind, sameAuthor: true, existingId: mine },
        },
      ]);
      throw CommunityErrors.duplicate(mine);
    }
    if (normalizedLength >= COMMUNITY_POLICY.crossUserDuplicateMinLength) {
      const other = await this.findSameHash(
        db,
        kind,
        hash,
        new Date(now - COMMUNITY_POLICY.crossUserDuplicateWindowMs),
        { userId: poster.id, sameUser: false, excludeId: opts.excludeId },
      );
      if (other) {
        holds.push('cross_user_duplicate');
        signals.push({
          signal: 'duplicate_content',
          score: SIGNAL_SCORES.duplicate_content,
          contentHash: hash,
          details: { kind, sameAuthor: false, otherId: other },
        });
      }
    }
    if (poster.newAccount) {
      holds.push('new_account');
      signals.push({ signal: 'new_account', score: SIGNAL_SCORES.new_account, details: { kind } });
    }
    const { status, holdReasons } = initialStatus(kind, holds);
    return { status, holdReasons, contentHash: hash, signals };
  }

  async recordSignals(
    poster: Pick<Poster, 'id' | 'ipHash'> | null,
    target: { type: CommunityTargetType; id: string } | null,
    drafts: SignalDraft[],
    db: Db = this.prisma,
  ): Promise<void> {
    if (!drafts.length) return;
    await db.spamSignal.createMany({
      data: drafts.map((d) => ({
        userId: poster?.id ?? null,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        signal: d.signal,
        score: Math.max(0, Math.min(100, d.score)),
        contentHash: d.contentHash ?? null,
        ipHash: poster?.ipHash ?? null,
        details: (d.details ?? {}) as Prisma.InputJsonObject,
      })),
    });
  }
}
