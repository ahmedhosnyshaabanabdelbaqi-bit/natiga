/**
 * Can this tour be published? (REQUIREMENTS §8–9, ARCHITECTURE §4.8)
 *  - at least one scene and an initial scene;
 *  - every scene panorama: processed (`ready`), not deleted, licensed with a
 *    licence valid today, and confirmed by an editor after looking at it
 *    (2:1 alone is no proof);
 *  - every hotspot image / video: ready, not deleted, licensed (valid);
 *  - every hotspot has its title in Arabic AND English;
 *  - a reference tour of a similar trim: difference notes + editor approval;
 *  - the trim is offered in the tour's market, with the same drive side
 *    when the market row states one;
 *  - no other published tour for the same trim × market × drive side × colour.
 * The database re-checks the file / licence / approval / market rules.
 * Pure — unit tested.
 */
import type { Bilingual } from '../../../common/validation/messages';

export type LicenseValidity = 'valid' | 'expired' | 'not_yet_valid';

export interface ReadinessAsset {
  id: string;
  kind: string;
  status: string;
  deleted: boolean;
  licensed: boolean;
  licenseValidity: LicenseValidity | null;
  visualCheckConfirmed: boolean;
  hasTiles: boolean;
}

export interface ReadinessInput {
  tour: {
    matchType: 'exact' | 'reference_similar_trim';
    approved: boolean;
    differenceNoteAr: string | null;
    differenceNoteEn: string | null;
    initialSceneId: string | null;
    driveSide: string;
  };
  variantMarket: { availability: string; driveSide: string | null } | null;
  variantPublic: boolean;
  scenes: { id: string; key: string; asset: ReadinessAsset }[];
  hotspots: {
    id: string;
    sceneId: string;
    type: string;
    locales: string[];
    media: ReadinessAsset | null;
  }[];
  otherPublishedTourId: string | null;
}

export interface ReadinessIssue {
  code: string;
  message: Bilingual;
  sceneId?: string;
  hotspotId?: string;
  assetId?: string;
}

export interface Readiness {
  publishable: boolean;
  problems: ReadinessIssue[];
  warnings: ReadinessIssue[];
}

export const OFFERED_AVAILABILITIES = ['available', 'coming_soon', 'discontinued'];

function assetIssues(
  a: ReadinessAsset,
  prefix: 'scene' | 'hotspot_media',
  ids: { sceneId?: string; hotspotId?: string },
): ReadinessIssue[] {
  const out: ReadinessIssue[] = [];
  const where = { ...ids, assetId: a.id };
  const label =
    prefix === 'scene'
      ? { ar: 'صورة المشهد', en: 'The scene panorama' }
      : { ar: 'ملف النقطة التفاعلية', en: 'The hotspot file' };
  if (a.deleted) {
    out.push({
      code: `${prefix}_asset_deleted`,
      message: { ar: `${label.ar} محذوفة.`, en: `${label.en} was deleted.` },
      ...where,
    });
    return out;
  }
  if (a.status !== 'ready') {
    out.push({
      code: `${prefix}_asset_not_ready`,
      message: {
        ar: `${label.ar} لم تكتمل معالجتها بعد (الحالة: ${a.status}).`,
        en: `${label.en} has not finished processing (status: ${a.status}).`,
      },
      ...where,
    });
  }
  if (!a.licensed) {
    out.push({
      code: `${prefix}_asset_unlicensed`,
      message: {
        ar: `${label.ar} بلا ترخيص مسجّل (صاحب الحقوق والإسناد).`,
        en: `${label.en} has no recorded licence (rights holder, attribution).`,
      },
      ...where,
    });
  } else if (a.licenseValidity === 'expired') {
    out.push({
      code: `${prefix}_licence_expired`,
      message: {
        ar: `ترخيص ${label.ar} منتهٍ.`,
        en: `The licence of ${label.en.toLowerCase()} has expired.`,
      },
      ...where,
    });
  } else if (a.licenseValidity === 'not_yet_valid') {
    out.push({
      code: `${prefix}_licence_not_yet_valid`,
      message: {
        ar: `ترخيص ${label.ar} لم يبدأ بعد.`,
        en: `The licence of ${label.en.toLowerCase()} is not valid yet.`,
      },
      ...where,
    });
  }
  return out;
}

export function evaluateReadiness(input: ReadinessInput): Readiness {
  const problems: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const { tour } = input;

  if (input.scenes.length === 0) {
    problems.push({
      code: 'no_scenes',
      message: { ar: 'أضف مشهدًا واحدًا على الأقل.', en: 'Add at least one scene.' },
    });
  } else if (!tour.initialSceneId || !input.scenes.some((s) => s.id === tour.initialSceneId)) {
    problems.push({
      code: 'no_initial_scene',
      message: { ar: 'اختر المشهد الأول للجولة.', en: 'Choose the first scene of the tour.' },
    });
  }

  for (const s of input.scenes) {
    problems.push(...assetIssues(s.asset, 'scene', { sceneId: s.id }));
    if (s.asset.kind !== 'panorama') {
      problems.push({
        code: 'scene_asset_not_panorama',
        message: {
          ar: 'المشهد يجب أن يستخدم صورة بانوراما 360°.',
          en: 'A scene must use a 360° panorama.',
        },
        sceneId: s.id,
        assetId: s.asset.id,
      });
    } else if (!s.asset.visualCheckConfirmed) {
      problems.push({
        code: 'scene_visual_check_missing',
        message: {
          ar: `لم يؤكد محرر صلاحية بانوراما المشهد "${s.key}" بعد فحصها بصريًا.`,
          en: `No editor has confirmed the panorama of scene "${s.key}" after looking at it.`,
        },
        sceneId: s.id,
        assetId: s.asset.id,
      });
    }
    if (s.asset.status === 'ready' && !s.asset.hasTiles) {
      warnings.push({
        code: 'scene_without_tiles',
        message: {
          ar: `المشهد "${s.key}" بلا مربعات متعددة الدقة؛ سيعرض العارض النسخة المناسبة للجهاز.`,
          en: `Scene "${s.key}" has no multires tiles; the viewer will use a device rendition.`,
        },
        sceneId: s.id,
        assetId: s.asset.id,
      });
    }
  }

  for (const h of input.hotspots) {
    if (h.media) problems.push(...assetIssues(h.media, 'hotspot_media', { hotspotId: h.id }));
    for (const locale of ['ar', 'en']) {
      if (!h.locales.includes(locale)) {
        problems.push({
          code: 'hotspot_translation_missing',
          message: {
            ar: `نص النقطة التفاعلية ناقص باللغة ${locale === 'ar' ? 'العربية' : 'الإنجليزية'}.`,
            en: `A hotspot text is missing in ${locale === 'ar' ? 'Arabic' : 'English'}.`,
          },
          hotspotId: h.id,
          sceneId: h.sceneId,
        });
      }
    }
  }

  if (tour.matchType === 'reference_similar_trim') {
    if (!tour.differenceNoteAr?.trim() || !tour.differenceNoteEn?.trim()) {
      problems.push({
        code: 'reference_notes_missing',
        message: {
          ar: 'اكتب الفروق عن الفئة المختارة بالعربية والإنجليزية.',
          en: 'Describe the differences from the selected trim in Arabic and English.',
        },
      });
    }
    if (!tour.approved) {
      problems.push({
        code: 'reference_not_approved',
        message: {
          ar: 'الجولة المرجعية لفئة قريبة تحتاج موافقة محرر مخوّل قبل النشر.',
          en: 'A reference tour of a similar trim needs an authorised editor’s approval before publishing.',
        },
      });
    }
  }

  const vm = input.variantMarket;
  if (!vm || !OFFERED_AVAILABILITIES.includes(vm.availability)) {
    problems.push({
      code: 'variant_not_in_market',
      message: {
        ar: 'الفئة غير معروضة في سوق هذه الجولة.',
        en: 'The trim is not offered in the market of this tour.',
      },
    });
  } else if (vm.driveSide && vm.driveSide !== tour.driveSide) {
    problems.push({
      code: 'drive_side_mismatch',
      message: {
        ar: 'اتجاه القيادة في الجولة يختلف عن الفئة المباعة في هذا السوق.',
        en: 'The drive side of the tour differs from the trim sold in this market.',
      },
    });
  }

  if (input.otherPublishedTourId) {
    problems.push({
      code: 'duplicate_published',
      message: {
        ar: 'توجد جولة منشورة أخرى لنفس الفئة والسوق واتجاه القيادة ولون المقصورة؛ ألغِ نشرها أولًا.',
        en: 'Another published tour exists for the same trim, market, drive side and interior colour; unpublish it first.',
      },
    });
  }

  if (!input.variantPublic) {
    warnings.push({
      code: 'variant_not_public',
      message: {
        ar: 'الفئة غير منشورة للعامة؛ لن تظهر الجولة في التطبيق حتى تُنشر الفئة.',
        en: 'The trim is not public; the tour will not appear in the app until the trim is published.',
      },
    });
  }

  return { publishable: problems.length === 0, problems, warnings };
}
