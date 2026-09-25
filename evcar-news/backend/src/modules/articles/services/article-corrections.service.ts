import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { contentError, fieldError } from '../common/content-errors';
import type {
  CorrectionDto,
  CreateCorrectionDto,
  UpdateCorrectionDto,
} from '../dto/admin-article.dto';
import { ArticlesAdminService } from './articles-admin.service';

type CorrectionRow = {
  id: string;
  kind: string;
  noteAr: string | null;
  noteEn: string | null;
  revisionVersion: number | null;
  correctedAt: Date;
  isPublic: boolean;
  createdAt: Date;
  createdBy: { id: string; displayName: string } | null;
};

const SELECT = {
  id: true,
  kind: true,
  noteAr: true,
  noteEn: true,
  revisionVersion: true,
  correctedAt: true,
  isPublic: true,
  createdAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const;

function toDto(r: CorrectionRow): CorrectionDto {
  return {
    id: r.id,
    kind: r.kind,
    noteAr: r.noteAr,
    noteEn: r.noteEn,
    revisionVersion: r.revisionVersion,
    correctedAt: r.correctedAt.toISOString(),
    isPublic: r.isPublic,
    createdBy: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.displayName } : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Public corrections log of an article ("تصحيح / توضيح / تحديث"), shown to
 * readers under the article with its date. Writing corrections is a public
 * editorial statement → articles.publish.
 */
@Injectable()
export class ArticleCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesAdminService,
    private readonly audit: AuditService,
  ) {}

  async list(articleId: string): Promise<CorrectionDto[]> {
    await this.articles.load(articleId, { includeDeleted: true });
    const rows = await this.prisma.articleCorrection.findMany({
      where: { articleId },
      select: SELECT,
      orderBy: { correctedAt: 'desc' },
    });
    return rows.map(toDto);
  }

  private validate(
    noteAr: string | null | undefined,
    noteEn: string | null | undefined,
    revisionVersion: number | null | undefined,
    currentVersion: number,
  ): void {
    if (!noteAr?.trim() && !noteEn?.trim()) {
      throw fieldError('noteAr', 'isNotEmpty', {
        ar: 'اكتب نص التصحيح بالعربية أو الإنجليزية.',
        en: 'Write the correction note in Arabic or English.',
      });
    }
    if (revisionVersion && revisionVersion > currentVersion) {
      throw fieldError('revisionVersion', 'max', {
        ar: 'رقم الإصدار أكبر من الإصدار الحالي.',
        en: 'The version is newer than the current version.',
      });
    }
  }

  async create(
    articleId: string,
    dto: CreateCorrectionDto,
    userId: string,
  ): Promise<CorrectionDto> {
    const a = await this.articles.load(articleId);
    this.validate(dto.noteAr, dto.noteEn, dto.revisionVersion, a.currentVersion);
    const row = await this.prisma.articleCorrection.create({
      data: {
        articleId,
        kind: dto.kind ?? 'correction',
        noteAr: dto.noteAr?.trim() || null,
        noteEn: dto.noteEn?.trim() || null,
        revisionVersion: dto.revisionVersion ?? null,
        correctedAt: dto.correctedAt ? new Date(dto.correctedAt) : new Date(),
        isPublic: dto.isPublic ?? true,
        createdById: userId,
      },
      select: SELECT,
    });
    const view = toDto(row);
    this.audit.annotate({
      entityType: 'article',
      entityId: articleId,
      after: { correction: view },
    });
    return view;
  }

  private async find(articleId: string, correctionId: string) {
    const row = await this.prisma.articleCorrection.findFirst({
      where: { id: correctionId, articleId },
      select: SELECT,
    });
    if (!row) throw contentError('ARTICLE_CORRECTION_NOT_FOUND');
    return row;
  }

  async update(
    articleId: string,
    correctionId: string,
    dto: UpdateCorrectionDto,
  ): Promise<CorrectionDto> {
    const a = await this.articles.load(articleId);
    const before = await this.find(articleId, correctionId);
    const noteAr = dto.noteAr === undefined ? before.noteAr : dto.noteAr?.trim() || null;
    const noteEn = dto.noteEn === undefined ? before.noteEn : dto.noteEn?.trim() || null;
    const revisionVersion =
      dto.revisionVersion === undefined ? before.revisionVersion : dto.revisionVersion;
    this.validate(noteAr, noteEn, revisionVersion, a.currentVersion);
    const row = await this.prisma.articleCorrection.update({
      where: { id: correctionId },
      data: {
        noteAr,
        noteEn,
        revisionVersion,
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.correctedAt !== undefined ? { correctedAt: new Date(dto.correctedAt) } : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
      },
      select: SELECT,
    });
    const view = toDto(row);
    this.audit.annotate({
      entityType: 'article',
      entityId: articleId,
      before: { correction: toDto(before) },
      after: { correction: view },
    });
    return view;
  }

  async remove(articleId: string, correctionId: string): Promise<void> {
    await this.articles.load(articleId);
    const before = await this.find(articleId, correctionId);
    await this.prisma.articleCorrection.delete({ where: { id: correctionId } });
    this.audit.annotate({
      entityType: 'article',
      entityId: articleId,
      before: { correction: toDto(before) },
    });
  }
}
