import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { PrismaService } from '../../../prisma/prisma.service';
import { PUBLIC_BRAND_WHERE, PUBLIC_MODEL_WHERE } from '../../vehicles';
import { fieldErrors, type FieldProblem } from '../../search/common/discovery-http';
import type { InterestsDto, UpdateInterestsDto } from '../dto/home.dto';

const pick = (
  lang: SupportedLanguage,
  ar: string | null | undefined,
  en: string | null | undefined,
) => (lang === 'ar' ? (ar ?? en) : (en ?? ar)) ?? '';

export interface InterestKeys {
  brandIds: string[];
  modelIds: string[];
  categoryIds: string[];
}

/** Followed brands / models / news categories (home personalization only). */
@Injectable()
export class InterestsService {
  constructor(private readonly prisma: PrismaService) {}

  async keys(userId: string): Promise<InterestKeys> {
    const rows = await this.prisma.userInterest.findMany({ where: { userId } });
    return {
      brandIds: rows.map((r) => r.brandId).filter((x): x is string => !!x),
      modelIds: rows.map((r) => r.modelId).filter((x): x is string => !!x),
      categoryIds: rows.map((r) => r.categoryId).filter((x): x is string => !!x),
    };
  }

  async get(userId: string, lang: SupportedLanguage): Promise<InterestsDto> {
    const k = await this.keys(userId);
    const [brands, models, categories] = await Promise.all([
      this.prisma.brand.findMany({
        where: { id: { in: k.brandIds }, ...PUBLIC_BRAND_WHERE },
        select: { id: true, slug: true, nameAr: true, nameEn: true },
        orderBy: { nameEn: 'asc' },
      }),
      this.prisma.carModel.findMany({
        where: { id: { in: k.modelIds }, ...PUBLIC_MODEL_WHERE },
        select: {
          id: true,
          slug: true,
          nameAr: true,
          nameEn: true,
          brand: { select: { nameAr: true, nameEn: true } },
        },
        orderBy: { nameEn: 'asc' },
      }),
      this.prisma.category.findMany({
        where: { id: { in: k.categoryIds }, isActive: true },
        select: { id: true, slug: true, translations: { select: { locale: true, name: true } } },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    return {
      brands: brands.map((b) => ({ id: b.id, slug: b.slug, name: pick(lang, b.nameAr, b.nameEn) })),
      models: models.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: pick(lang, m.nameAr, m.nameEn),
        brandName: pick(lang, m.brand.nameAr, m.brand.nameEn),
      })),
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name:
          c.translations.find((t) => t.locale === lang)?.name ?? c.translations[0]?.name ?? c.slug,
      })),
    };
  }

  async replace(userId: string, dto: UpdateInterestsDto, lang: SupportedLanguage) {
    const brandIds = [...new Set(dto.brandIds.map((x) => x.toLowerCase()))];
    const modelIds = [...new Set(dto.modelIds.map((x) => x.toLowerCase()))];
    const categoryIds = [...new Set(dto.categoryIds.map((x) => x.toLowerCase()))];
    const [brands, models, categories] = await Promise.all([
      this.prisma.brand.findMany({
        where: { id: { in: brandIds }, ...PUBLIC_BRAND_WHERE },
        select: { id: true },
      }),
      this.prisma.carModel.findMany({
        where: { id: { in: modelIds }, ...PUBLIC_MODEL_WHERE },
        select: { id: true },
      }),
      this.prisma.category.findMany({
        where: { id: { in: categoryIds }, isActive: true },
        select: { id: true },
      }),
    ]);
    const problems: FieldProblem[] = [];
    const check = (field: 'brandIds' | 'modelIds' | 'categoryIds', found: { id: string }[]) => {
      const ok = new Set(found.map((f) => f.id));
      dto[field].forEach((id, i) => {
        if (!ok.has(id.toLowerCase())) {
          problems.push({
            field: `${field}[${i}]`,
            rule: 'exists',
            message: { ar: 'العنصر غير موجود أو غير منشور.', en: 'Unknown or unpublished item.' },
          });
        }
      });
    };
    check('brandIds', brands);
    check('modelIds', models);
    check('categoryIds', categories);
    if (problems.length) throw fieldErrors(problems);
    await this.prisma.$transaction([
      this.prisma.userInterest.deleteMany({ where: { userId } }),
      this.prisma.userInterest.createMany({
        data: [
          ...brandIds.map((brandId) => ({ userId, brandId })),
          ...modelIds.map((modelId) => ({ userId, modelId })),
          ...categoryIds.map((categoryId) => ({ userId, categoryId })),
        ],
      }),
    ]);
    return this.get(userId, lang);
  }
}
