import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { tr, type Bilingual } from '../../../common/validation/messages';

/**
 * Localized errors of the stations area (ar/en), passed explicitly to
 * AppException (the shared server catalogs belong to the i18n module).
 * Field errors use the global validation shape:
 *   422 VALIDATION_FAILED, details: [{ field, constraints: { <rule>: <message> } }]
 */
export interface FieldProblem {
  field: string;
  rule: string;
  message: Bilingual;
}

export function fieldErrors(problems: FieldProblem[]): AppException {
  const byField = new Map<string, Record<string, string>>();
  for (const p of problems) {
    const c = byField.get(p.field) ?? {};
    c[p.rule] = tr(p.message);
    byField.set(p.field, c);
  }
  return AppException.validation(
    [...byField.entries()].map(([field, constraints]) => ({ field, constraints })),
  );
}

export function fieldError(field: string, rule: string, message: Bilingual): AppException {
  return fieldErrors([{ field, rule, message }]);
}

function err(status: HttpStatus, code: string, message: Bilingual, details?: unknown) {
  return new AppException({ status, code, message, details });
}

export const StationErrors = {
  notFound: (entity = 'station') =>
    new AppException({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      details: { entity },
    }),

  merged: (mergedIntoId: string) =>
    err(
      HttpStatus.NOT_FOUND,
      'STATION_MERGED',
      {
        ar: 'دُمجت هذه المحطة في محطة أخرى مكررة.',
        en: 'This station was merged into another (duplicate) station.',
      },
      { mergedIntoId },
    ),

  geoRequired: () =>
    fieldError('bbox', 'geoRequired', {
      ar: 'حدد نطاق الخريطة (bbox) أو نقطة (lat و lng).',
      en: 'Give a map area (bbox) or a point (lat and lng).',
    }),

  vehicleCompatibilityUnknown: (details: {
    reason: 'variant_not_in_market' | 'no_verified_inlets';
    variantId: string;
    marketCode: string;
  }) =>
    err(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'VEHICLE_COMPATIBILITY_UNKNOWN',
      details.reason === 'variant_not_in_market'
        ? {
            ar: 'لا توجد بيانات لهذه الفئة في هذا السوق، لذلك لا يمكن تحديد المنافذ المتوافقة.',
            en: 'This trim has no data in this market, so compatible connectors cannot be determined.',
          }
        : {
            ar: 'لا توجد بيانات موثقة لمنافذ شحن هذه الفئة في هذا السوق، لذلك لا يمكن تحديد المنافذ المتوافقة.',
            en: 'There is no verified charging-inlet data for this trim in this market, so compatible connectors cannot be determined.',
          },
      details,
    ),

  vehicleNotFound: (field: 'vehicleVariantId' | 'userVehicleId' | 'variantId') =>
    fieldError(field, 'exists', {
      ar: 'السيارة غير موجودة.',
      en: 'The vehicle was not found.',
    }),

  signInForGarage: () =>
    AppException.unauthorized(ErrorCode.UNAUTHORIZED, {
      ar: 'سجّل الدخول لاستخدام سيارتك من الجراج.',
      en: 'Sign in to use a car from your garage.',
    }),

  reportDuplicate: (reportId: string) =>
    err(
      HttpStatus.CONFLICT,
      'STATION_REPORT_DUPLICATE',
      {
        ar: 'لديك بلاغ مفتوح من النوع نفسه لهذه المحطة، وسيراجعه الفريق.',
        en: 'You already have an open report of this type for this station; the team will review it.',
      },
      { reportId },
    ),

  reportLimit: () =>
    new AppException({
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'STATION_REPORT_LIMIT',
      message: {
        ar: 'أرسلت بلاغات كثيرة خلال 24 ساعة. حاول لاحقًا.',
        en: 'You sent many reports in the last 24 hours. Please try again later.',
      },
      headers: { 'Retry-After': '3600' },
    }),

  checkinTooSoon: (retryAfterSeconds: number) =>
    new AppException({
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'STATION_CHECKIN_TOO_SOON',
      message: {
        ar: 'سجّلت زيارة لهذه المحطة قبل قليل.',
        en: 'You checked in at this station a moment ago.',
      },
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) },
    }),

  checkinLimit: () =>
    new AppException({
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'STATION_CHECKIN_LIMIT',
      message: {
        ar: 'سجّلت زيارات كثيرة خلال 24 ساعة. حاول لاحقًا.',
        en: 'You checked in many times in the last 24 hours. Please try again later.',
      },
      headers: { 'Retry-After': '3600' },
    }),

  suggestionLimit: () =>
    new AppException({
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'STATION_SUGGESTION_LIMIT',
      message: {
        ar: 'لديك اقتراحات كثيرة قيد المراجعة. انتظر مراجعتها أولًا.',
        en: 'You have many suggestions awaiting review. Please wait until they are reviewed.',
      },
    }),

  suggestionNotPending: () =>
    err(HttpStatus.CONFLICT, 'STATION_SUGGESTION_NOT_PENDING', {
      ar: 'تمت مراجعة هذا الاقتراح أو سحبه بالفعل.',
      en: 'This suggestion was already reviewed or withdrawn.',
    }),

  notPublishedTarget: () =>
    err(HttpStatus.CONFLICT, 'STATION_NOT_PUBLISHED', {
      ar: 'المحطة غير منشورة.',
      en: 'The station is not published.',
    }),

  mergedCannotPublish: () =>
    err(HttpStatus.CONFLICT, 'STATION_MERGED_NOT_PUBLISHABLE', {
      ar: 'لا يمكن نشر محطة مدمجة في محطة أخرى.',
      en: 'A station merged into another one cannot be published.',
    }),

  publishForbidden: () =>
    AppException.forbidden({
      ar: 'نشر المحطات يتطلب صلاحية النشر.',
      en: 'Publishing stations requires the publish permission.',
    }),

  duplicateNotPending: () =>
    err(HttpStatus.CONFLICT, 'STATION_DUPLICATE_NOT_PENDING', {
      ar: 'تمت مراجعة هذا الزوج بالفعل.',
      en: 'This pair was already reviewed.',
    }),

  duplicateKeepInvalid: () =>
    fieldError('keepStationId', 'pair', {
      ar: 'يجب أن تكون المحطة المحتفظ بها إحدى محطتي الزوج.',
      en: 'The station to keep must be one of the two stations of the pair.',
    }),

  duplicateSameStation: () =>
    fieldError('otherStationId', 'different', {
      ar: 'اختر محطتين مختلفتين.',
      en: 'Choose two different stations.',
    }),

  alreadyMerged: () =>
    err(HttpStatus.CONFLICT, 'STATION_ALREADY_MERGED', {
      ar: 'إحدى المحطتين مدمجة بالفعل في محطة أخرى.',
      en: 'One of the stations is already merged into another station.',
    }),

  slugTaken: (slug: string) =>
    err(
      HttpStatus.CONFLICT,
      'SLUG_TAKEN',
      {
        ar: `المعرّف النصي (slug) "${slug}" مستخدم بالفعل.`,
        en: `The slug "${slug}" is already in use.`,
      },
      { slug },
    ),

  inUse: (entity: string, counts: Record<string, number>) =>
    err(
      HttpStatus.CONFLICT,
      'IN_USE',
      {
        ar: 'لا يمكن الحذف لأن العنصر مستخدم في بيانات أخرى.',
        en: 'This record is still used by other data.',
      },
      { entity, counts },
    ),

  sourceNotSyncable: (source: string) =>
    err(
      HttpStatus.BAD_REQUEST,
      'SOURCE_NOT_SYNCABLE',
      {
        ar: 'لا يمكن مزامنة هذا المصدر.',
        en: 'This station source cannot be synchronised.',
      },
      { source },
    ),

  syncRunning: (jobId: string) =>
    err(
      HttpStatus.CONFLICT,
      'STATION_SYNC_RUNNING',
      {
        ar: 'توجد مزامنة بنفس الإعدادات قيد التشغيل.',
        en: 'A synchronisation with the same settings is already running.',
      },
      { jobId },
    ),

  unknownTarget: () =>
    fieldError('observations', 'target', {
      ar: 'تعذر تحديد المحطة أو المنفذ لبعض القراءات.',
      en: 'The station or connector of some observations could not be resolved.',
    }),
};
