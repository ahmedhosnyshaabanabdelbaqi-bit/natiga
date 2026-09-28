import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { type PaginationQueryDto, toPageRequest } from '../../../common/http/pagination';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../auth';
import { CommunityErrors, fieldError } from '../common/community-errors';
import type {
  AcceptAnswerDto,
  AnswerDto,
  CreateAnswerDto,
  CreateQuestionDto,
  QuestionDetailDto,
  QuestionDto,
  QuestionListQueryDto,
  QuestionTarget,
  UpdateQuestionDto,
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

const TARGET_COLUMN: Record<QuestionTarget, 'modelId' | 'variantId' | 'stationId'> = {
  model: 'modelId',
  variant: 'variantId',
  station: 'stationId',
};

const ANSWER_INCLUDE = { user: AUTHOR_SELECT } satisfies Prisma.AnswerInclude;
type AnswerRow = Prisma.AnswerGetPayload<{ include: typeof ANSWER_INCLUDE }>;

function questionInclude(viewer: Viewer) {
  return {
    user: AUTHOR_SELECT,
    _count: { select: { answers: { where: visibleWhere(viewer) } } },
  } satisfies Prisma.QuestionInclude;
}
type QuestionRow = Prisma.QuestionGetPayload<{ include: ReturnType<typeof questionInclude> }>;

export function questionTargetOf(q: {
  modelId: string | null;
  variantId: string | null;
  stationId: string | null;
}): { type: QuestionTarget; id: string } | null {
  if (q.variantId) return { type: 'variant', id: q.variantId };
  if (q.modelId) return { type: 'model', id: q.modelId };
  if (q.stationId) return { type: 'station', id: q.stationId };
  return null;
}

/**
 * Questions & answers about car models, variants, stations or general EV
 * topics. The asker may accept one answer. Answers of a question that is not
 * public are not public either.
 */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: CommunityGuardService,
    private readonly viewers: CommunityViewerService,
  ) {}

  private async assertTarget(type: QuestionTarget, id: string): Promise<void> {
    let ok: boolean;
    switch (type) {
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
      case 'station':
        ok = !!(await this.prisma.chargingStation.findFirst({
          where: { id, publicationStatus: 'published', deletedAt: null, duplicateOfId: null },
          select: { id: true },
        }));
        break;
    }
    if (!ok) throw CommunityErrors.targetNotFound('targetId');
  }

  private requireTargetPair(q: { targetType?: QuestionTarget; targetId?: string }): void {
    if (!!q.targetType !== !!q.targetId) {
      throw fieldError(q.targetType ? 'targetId' : 'targetType', 'pair', {
        ar: 'حدد نوع العنصر ومعرّفه معًا.',
        en: 'Give targetType and targetId together.',
      });
    }
  }

  questionView(
    q: QuestionRow,
    viewer: Viewer,
    myVote: number | undefined,
    lang: SupportedLanguage,
  ): QuestionDto {
    return {
      id: q.id,
      target: questionTargetOf(q),
      title: q.title,
      body: q.body,
      locale: q.locale,
      author: authorOf(q.user, lang),
      votes: votesOf(q, myVote),
      answerCount: q._count.answers,
      acceptedAnswerId: q.acceptedAnswerId,
      status: q.status,
      isMine: !!viewer.id && q.userId === viewer.id,
      editedAt: q.editedAt?.toISOString() ?? null,
      createdAt: q.createdAt.toISOString(),
    };
  }

  answerView(
    a: AnswerRow,
    acceptedAnswerId: string | null,
    viewer: Viewer,
    myVote: number | undefined,
    lang: SupportedLanguage,
  ): AnswerDto {
    return {
      id: a.id,
      questionId: a.questionId,
      body: a.body,
      author: authorOf(a.user, lang),
      votes: votesOf(a, myVote),
      isAccepted: acceptedAnswerId === a.id,
      status: a.status,
      isMine: !!viewer.id && a.userId === viewer.id,
      editedAt: a.editedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }

  // --- questions ---------------------------------------------------------------------------

  async list(
    q: QuestionListQueryDto,
    viewer: Viewer,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<QuestionDto>> {
    this.requireTargetPair(q);
    if (q.targetType && q.targetId) await this.assertTarget(q.targetType, q.targetId);
    const page = toPageRequest(q);
    const visible = visibleWhere(viewer);
    const and: Prisma.QuestionWhereInput[] = [visible];
    if (q.targetType && q.targetId) and.push({ [TARGET_COLUMN[q.targetType]]: q.targetId });
    if (q.q) and.push({ title: { contains: q.q, mode: 'insensitive' } });
    if (q.answered === true) {
      and.push({ OR: [{ acceptedAnswerId: { not: null } }, { answers: { some: visible } }] });
    } else if (q.answered === false) {
      and.push({ acceptedAnswerId: null, answers: { none: visible } });
    }
    const where: Prisma.QuestionWhereInput = { AND: and };
    const orderBy: Prisma.QuestionOrderByWithRelationInput[] =
      q.sort === 'votes'
        ? [{ upvoteCount: 'desc' }, { createdAt: 'desc' }]
        : q.sort === 'active'
          ? [{ updatedAt: 'desc' }]
          : [{ createdAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: questionInclude(viewer),
      }),
      this.prisma.question.count({ where }),
    ]);
    const votes = await this.viewers.myVotes(
      viewer,
      'question',
      rows.map((r) => r.id),
    );
    return paginated(
      rows.map((r) => this.questionView(r, viewer, votes.get(r.id), lang)),
      total,
      page,
    );
  }

  private async loadQuestion(id: string, viewer: Viewer): Promise<QuestionRow> {
    const q = await this.prisma.question.findUnique({
      where: { id },
      include: questionInclude(viewer),
    });
    if (!q || !this.viewers.canSee(viewer, q)) throw CommunityErrors.notFound('question');
    return q;
  }

  async get(id: string, viewer: Viewer, lang: SupportedLanguage): Promise<QuestionDetailDto> {
    const q = await this.loadQuestion(id, viewer);
    const accepted = q.acceptedAnswerId
      ? await this.prisma.answer.findUnique({
          where: { id: q.acceptedAnswerId },
          include: ANSWER_INCLUDE,
        })
      : null;
    const acceptedVisible = accepted && this.viewers.canSee(viewer, accepted) ? accepted : null;
    const [qVotes, aVotes] = await Promise.all([
      this.viewers.myVotes(viewer, 'question', [q.id]),
      this.viewers.myVotes(viewer, 'answer', acceptedVisible ? [acceptedVisible.id] : []),
    ]);
    return {
      ...this.questionView(q, viewer, qVotes.get(q.id), lang),
      acceptedAnswer: acceptedVisible
        ? this.answerView(
            acceptedVisible,
            q.acceptedAnswerId,
            viewer,
            aVotes.get(acceptedVisible.id),
            lang,
          )
        : null,
    };
  }

  async create(
    dto: CreateQuestionDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
    market: string | undefined,
  ): Promise<QuestionDetailDto> {
    this.requireTargetPair(dto);
    if (dto.targetType && dto.targetId) await this.assertTarget(dto.targetType, dto.targetId);
    const poster = await this.guard.assertCanPost(user, ip);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'question', user.id);
      await this.guard.assertRate(tx, 'question', poster);
      const screening = await this.guard.screen(tx, 'question', poster, {
        title: dto.title,
        body: dto.body,
      });
      const marketRow = market
        ? await tx.market.findUnique({ where: { code: market }, select: { code: true } })
        : null;
      const created = await tx.question.create({
        data: {
          userId: user.id,
          ...(dto.targetType && dto.targetId
            ? { [TARGET_COLUMN[dto.targetType]]: dto.targetId }
            : {}),
          title: dto.title,
          body: dto.body ?? null,
          locale: dto.locale ?? lang,
          marketCode: marketRow?.code ?? null,
          status: screening.status,
        },
        select: { id: true },
      });
      await this.guard.recordSignals(
        poster,
        { type: 'question', id: created.id },
        screening.signals,
        tx,
      );
      return created;
    });
    return this.get(row.id, { id: user.id, mutedIds: [], isStaff: false }, lang);
  }

  private async ownQuestion(id: string, userId: string) {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q || q.deletedAt) throw CommunityErrors.notFound('question');
    if (q.userId !== userId) throw CommunityErrors.notAuthor();
    return q;
  }

  async update(
    id: string,
    dto: UpdateQuestionDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
  ): Promise<QuestionDetailDto> {
    const before = await this.ownQuestion(id, user.id);
    if (before.status === 'hidden' || before.status === 'rejected') {
      throw CommunityErrors.notEditable(before.status);
    }
    const poster = await this.guard.assertCanPost(user, ip);
    await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'question', user.id);
      const screening = await this.guard.screen(
        tx,
        'question',
        poster,
        {
          title: dto.title ?? before.title,
          body: dto.body !== undefined ? dto.body : before.body,
        },
        { excludeId: id, linkField: dto.body !== undefined ? 'body' : 'title' },
      );
      await tx.question.update({
        where: { id },
        data: {
          title: dto.title,
          body: dto.body,
          editedAt: this.guard.now(),
          status: screening.status,
        },
      });
      await this.guard.recordSignals(poster, { type: 'question', id }, screening.signals, tx);
    });
    return this.get(id, { id: user.id, mutedIds: [], isStaff: false }, lang);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.ownQuestion(id, user.id);
    await this.prisma.question.update({ where: { id }, data: { deletedAt: this.guard.now() } });
  }

  async accept(
    id: string,
    dto: AcceptAnswerDto,
    user: AuthUser,
    lang: SupportedLanguage,
  ): Promise<QuestionDetailDto> {
    const q = await this.ownQuestion(id, user.id);
    if (dto.answerId) {
      const a = await this.prisma.answer.findFirst({
        where: { id: dto.answerId, questionId: q.id, status: 'approved', deletedAt: null },
        select: { id: true },
      });
      if (!a) {
        throw fieldError('answerId', 'belongsToQuestion', {
          ar: 'الإجابة غير موجودة في هذا السؤال.',
          en: 'The answer does not belong to this question.',
        });
      }
    }
    await this.prisma.question.update({
      where: { id },
      data: { acceptedAnswerId: dto.answerId },
    });
    return this.get(id, { id: user.id, mutedIds: [], isStaff: false }, lang);
  }

  // --- answers -----------------------------------------------------------------------------

  async answers(
    questionId: string,
    q: PaginationQueryDto,
    viewer: Viewer,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<AnswerDto>> {
    const question = await this.loadQuestion(questionId, viewer);
    const page = toPageRequest(q);
    if (question.status !== 'approved' || question.deletedAt) {
      return paginated([], 0, page);
    }
    const where: Prisma.AnswerWhereInput = { questionId, ...visibleWhere(viewer) };
    const [rows, total] = await Promise.all([
      this.prisma.answer.findMany({
        where,
        // Most helpful first, then oldest. The accepted answer is also in the
        // question detail (acceptedAnswer) and flagged isAccepted here.
        orderBy: [{ upvoteCount: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: ANSWER_INCLUDE,
      }),
      this.prisma.answer.count({ where }),
    ]);
    const votes = await this.viewers.myVotes(
      viewer,
      'answer',
      rows.map((r) => r.id),
    );
    return paginated(
      rows.map((r) => this.answerView(r, question.acceptedAnswerId, viewer, votes.get(r.id), lang)),
      total,
      page,
    );
  }

  async createAnswer(
    questionId: string,
    dto: CreateAnswerDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
  ): Promise<AnswerDto> {
    const question = await this.prisma.question.findFirst({
      where: { id: questionId, status: 'approved', deletedAt: null },
      select: { id: true, acceptedAnswerId: true },
    });
    if (!question) throw CommunityErrors.notFound('question');
    const poster = await this.guard.assertCanPost(user, ip);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'answer', user.id);
      await this.guard.assertRate(tx, 'answer', poster);
      const screening = await this.guard.screen(tx, 'answer', poster, { body: dto.body });
      const created = await tx.answer.create({
        data: { questionId, userId: user.id, body: dto.body, status: screening.status },
        include: ANSWER_INCLUDE,
      });
      // "active" sort of questions follows new answers.
      await tx.question.update({
        where: { id: questionId },
        data: { updatedAt: this.guard.now() },
      });
      await this.guard.recordSignals(
        poster,
        { type: 'answer', id: created.id },
        screening.signals,
        tx,
      );
      return created;
    });
    return this.answerView(
      row,
      question.acceptedAnswerId,
      { id: user.id, mutedIds: [], isStaff: false },
      undefined,
      lang,
    );
  }

  private async ownAnswer(id: string, userId: string) {
    const a = await this.prisma.answer.findUnique({
      where: { id },
      include: { question: { select: { acceptedAnswerId: true } } },
    });
    if (!a || a.deletedAt) throw CommunityErrors.notFound('answer');
    if (a.userId !== userId) throw CommunityErrors.notAuthor();
    return a;
  }

  async updateAnswer(
    id: string,
    dto: CreateAnswerDto,
    user: AuthUser,
    ip: string | undefined,
    lang: SupportedLanguage,
  ): Promise<AnswerDto> {
    const before = await this.ownAnswer(id, user.id);
    if (before.status === 'hidden' || before.status === 'rejected') {
      throw CommunityErrors.notEditable(before.status);
    }
    const poster = await this.guard.assertCanPost(user, ip);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.guard.lock(tx, 'answer', user.id);
      const screening = await this.guard.screen(
        tx,
        'answer',
        poster,
        { body: dto.body },
        {
          excludeId: id,
        },
      );
      const updated = await tx.answer.update({
        where: { id },
        data: { body: dto.body, editedAt: this.guard.now(), status: screening.status },
        include: ANSWER_INCLUDE,
      });
      await this.guard.recordSignals(poster, { type: 'answer', id }, screening.signals, tx);
      return updated;
    });
    const viewer = { id: user.id, mutedIds: [], isStaff: false };
    const votes = await this.viewers.myVotes(viewer, 'answer', [id]);
    return this.answerView(row, before.question.acceptedAnswerId, viewer, votes.get(id), lang);
  }

  async removeAnswer(id: string, user: AuthUser): Promise<void> {
    await this.ownAnswer(id, user.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.question.updateMany({
        where: { acceptedAnswerId: id },
        data: { acceptedAnswerId: null },
      });
      await tx.answer.update({ where: { id }, data: { deletedAt: this.guard.now() } });
    });
  }
}
