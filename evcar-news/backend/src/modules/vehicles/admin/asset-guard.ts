import { Injectable } from '@nestjs/common';
import { MediaKind, MediaStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { fieldError, Msg } from '../common/catalog-errors';

/**
 * Checks references written by the catalog admin: gallery / logo images
 * (must be ready, licensed, non-deleted images — never a panorama),
 * sources, markets and connector types.
 */
@Injectable()
export class AssetGuard {
  constructor(private readonly prisma: PrismaService) {}

  async assertImage(assetId: string, field = 'assetId'): Promise<void> {
    const a = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { kind: true, status: true, licenseId: true, deletedAt: true },
    });
    if (!a || a.deletedAt) {
      throw fieldError(field, 'exists', { ar: 'الملف غير موجود.', en: 'Unknown media asset.' });
    }
    if (a.kind !== MediaKind.image) {
      throw fieldError(field, 'imageOnly', {
        ar: 'يجب أن يكون الملف صورة عادية (البانوراما 360° تُدار من الجولات فقط).',
        en: 'The asset must be a regular image (360° panoramas belong to interior tours).',
      });
    }
    if (a.status !== MediaStatus.ready) {
      throw fieldError(field, 'ready', {
        ar: 'الصورة لم تكتمل معالجتها بعد.',
        en: 'The image has not finished processing.',
      });
    }
    if (!a.licenseId) {
      throw fieldError(field, 'licensed', {
        ar: 'سجّل ترخيص الصورة وصاحب الحقوق أولًا.',
        en: 'Record the licence / rights holder of the image first.',
      });
    }
  }

  async assertSource(sourceId: string | null | undefined, field = 'sourceId'): Promise<void> {
    if (!sourceId) return;
    const s = await this.prisma.specificationSource.findUnique({
      where: { id: sourceId },
      select: { id: true },
    });
    if (!s) throw fieldError(field, 'exists', Msg.unknownSource);
  }

  async assertSources(ids: (string | null | undefined)[], fieldOf: (i: number) => string) {
    const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (wanted.length === 0) return;
    const found = new Set(
      (
        await this.prisma.specificationSource.findMany({
          where: { id: { in: wanted } },
          select: { id: true },
        })
      ).map((s) => s.id),
    );
    ids.forEach((id, i) => {
      if (id && !found.has(id)) throw fieldError(fieldOf(i), 'exists', Msg.unknownSource);
    });
  }

  async market(code: string, field = 'marketCode') {
    const m = await this.prisma.market.findUnique({ where: { code } });
    if (!m) throw fieldError(field, 'exists', Msg.unknownMarket);
    return m;
  }

  async assertMarkets(codes: (string | null | undefined)[], fieldOf: (i: number) => string) {
    const wanted = [...new Set(codes.filter((x): x is string => Boolean(x)))];
    if (wanted.length === 0) return;
    const found = new Set(
      (
        await this.prisma.market.findMany({
          where: { code: { in: wanted } },
          select: { code: true },
        })
      ).map((m) => m.code),
    );
    codes.forEach((c, i) => {
      if (c && !found.has(c)) throw fieldError(fieldOf(i), 'exists', Msg.unknownMarket);
    });
  }
}
