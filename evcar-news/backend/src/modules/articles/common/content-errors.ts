import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import type { LocalizedText } from '../../../common/i18n/localized-text';
import { tr } from '../../../common/validation/messages';

/**
 * Error codes of the news area (articles, categories, tags, RSS) with their
 * ar/en messages. They are passed explicitly to AppException (the shared
 * server catalogs belong to the i18n module), so clients always get a
 * localized message plus a stable machine code.
 */
export const CONTENT_ERRORS = {
  ARTICLE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    ar: 'المادة غير موجودة.',
    en: 'The article was not found.',
  },
  ARTICLE_VERSION_CONFLICT: {
    status: HttpStatus.CONFLICT,
    ar: 'عدّل شخص آخر هذه المادة منذ فتحتها. حدّث الصفحة وأعد التعديل.',
    en: 'Someone else changed this article since you opened it. Reload and try again.',
  },
  ARTICLE_SLUG_TAKEN: {
    status: HttpStatus.CONFLICT,
    ar: 'الرابط المختصر مستخدم لمادة أخرى.',
    en: 'This slug is already used by another article.',
  },
  ARTICLE_SLUG_LOCKED: {
    status: HttpStatus.CONFLICT,
    ar: 'لا يمكن تغيير رابط مادة سبق نشرها لأن الروابط المشاركة ستتعطل.',
    en: 'The slug of an article that has been published cannot change (shared links would break).',
  },
  ARTICLE_INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    ar: 'لا يمكن تنفيذ هذا الإجراء في حالة المادة الحالية.',
    en: 'This action is not possible in the current status of the article.',
  },
  ARTICLE_NOT_APPROVED: {
    status: HttpStatus.CONFLICT,
    ar: 'يجب اعتماد المادة من مراجع المحتوى قبل نشرها أو جدولتها.',
    en: 'A content reviewer must approve the article before it can be published or scheduled.',
  },
  ARTICLE_NOT_PUBLISHABLE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'المادة غير جاهزة للنشر. راجع التفاصيل.',
    en: 'The article is not ready to be published. See details.',
  },
  ARTICLE_ARCHIVED: {
    status: HttpStatus.CONFLICT,
    ar: 'المادة مؤرشفة. أعد نشرها أو أعدها إلى مسودة قبل التعديل.',
    en: 'The article is archived. Republish it or return it to draft before editing.',
  },
  ARTICLE_IS_LIVE: {
    status: HttpStatus.CONFLICT,
    ar: 'لا يمكن حذف مادة منشورة أو مجدولة. أرشفها أو ألغِ نشرها أولًا.',
    en: 'A published or scheduled article cannot be deleted. Archive or unpublish it first.',
  },
  ARTICLE_EDIT_NEEDS_PUBLISH: {
    status: HttpStatus.FORBIDDEN,
    ar: 'تعديل مادة منشورة أو مجدولة يتطلب صلاحية النشر.',
    en: 'Editing a published or scheduled article requires the publish permission.',
  },
  ARTICLE_NOT_OWNER: {
    status: HttpStatus.FORBIDDEN,
    ar: 'يمكنك تعديل موادك فقط.',
    en: 'You can only edit your own articles.',
  },
  ARTICLE_TRANSLATION_ORIGINAL: {
    status: HttpStatus.CONFLICT,
    ar: 'لا يمكن حذف نص اللغة الأصلية للمادة.',
    en: 'The text in the original language of the article cannot be removed.',
  },
  ARTICLE_TRANSLATION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    ar: 'لا يوجد نص للمادة بهذه اللغة.',
    en: 'The article has no text in this language.',
  },
  ARTICLE_TRANSLATION_NOT_MACHINE: {
    status: HttpStatus.CONFLICT,
    ar: 'هذا النص مكتوب بشريًا ولا يحتاج إلى اعتماد ترجمة.',
    en: 'This text was written by a person; there is no machine translation to review.',
  },
  ARTICLE_COVER_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'صورة الغلاف غير صالحة (يجب أن تكون صورة جاهزة من مكتبة الوسائط).',
    en: 'The cover must be an image from the media library.',
  },
  ARTICLE_IMAGE_NOT_LICENSED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'تحتوي المادة على صور غير مرفوعة إلى مكتبة الوسائط مع ترخيصها. ارفع الصور أولًا.',
    en: 'The article contains images that were not uploaded to the media library with a licence. Upload them first.',
  },
  ARTICLE_EMBED_NOT_ALLOWED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'يُسمح فقط بتضمين فيديو من YouTube (بدون تتبع) أو Vimeo.',
    en: 'Only YouTube (no-cookie) and Vimeo video embeds are allowed.',
  },
  ARTICLE_REFERENCE_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'بعض العناصر المرتبطة غير موجودة. راجع التفاصيل.',
    en: 'Some referenced items do not exist. See details.',
  },
  ARTICLE_FEATURE_NEEDS_PUBLISH: {
    status: HttpStatus.FORBIDDEN,
    ar: 'تمييز المادة في الواجهة يتطلب صلاحية النشر.',
    en: 'Featuring an article requires the publish permission.',
  },
  ARTICLE_REVISION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    ar: 'هذا الإصدار غير موجود.',
    en: 'This revision does not exist.',
  },
  ARTICLE_CORRECTION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    ar: 'التصحيح غير موجود.',
    en: 'The correction was not found.',
  },
  ARTICLE_NOT_DELETED: {
    status: HttpStatus.CONFLICT,
    ar: 'المادة غير محذوفة.',
    en: 'The article is not deleted.',
  },
  PREVIEW_TOKEN_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    ar: 'رابط المعاينة غير صالح.',
    en: 'The preview link is invalid.',
  },
  PREVIEW_TOKEN_EXPIRED: {
    status: HttpStatus.UNAUTHORIZED,
    ar: 'انتهت صلاحية رابط المعاينة.',
    en: 'The preview link has expired.',
  },
  CATEGORY_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    ar: 'التصنيف غير موجود.',
    en: 'The category was not found.',
  },
  CATEGORY_SLUG_TAKEN: {
    status: HttpStatus.CONFLICT,
    ar: 'الرابط المختصر مستخدم لتصنيف آخر.',
    en: 'This slug is already used by another category.',
  },
  CATEGORY_IS_SYSTEM: {
    status: HttpStatus.CONFLICT,
    ar: 'هذا تصنيف أساسي لا يُحذف. يمكنك إيقافه بدلًا من ذلك.',
    en: 'This is a built-in category and cannot be deleted. Deactivate it instead.',
  },
  CATEGORY_IN_USE: {
    status: HttpStatus.CONFLICT,
    ar: 'التصنيف مستخدم ولا يمكن حذفه. أوقفه بدلًا من ذلك.',
    en: 'The category is in use and cannot be deleted. Deactivate it instead.',
  },
  CATEGORY_PARENT_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'التصنيف الأب غير صالح (لا يمكن أن يكون التصنيف نفسه أو أحد فروعه، والحد الأقصى مستويان).',
    en: 'Invalid parent category (not itself or one of its children; at most two levels).',
  },
  TAG_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    ar: 'الوسم غير موجود.',
    en: 'The tag was not found.',
  },
  TAG_SLUG_TAKEN: {
    status: HttpStatus.CONFLICT,
    ar: 'الرابط المختصر مستخدم لوسم آخر.',
    en: 'This slug is already used by another tag.',
  },
  TAG_IN_USE: {
    status: HttpStatus.CONFLICT,
    ar: 'الوسم مستخدم في مواد. استخدم الحذف القسري أو الدمج.',
    en: 'The tag is used by articles. Use force delete or merge it.',
  },
  TAG_MERGE_SELF: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'لا يمكن دمج الوسم في نفسه.',
    en: 'A tag cannot be merged into itself.',
  },
  RSS_FEED_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    ar: 'مصدر RSS غير موجود.',
    en: 'The RSS feed was not found.',
  },
  RSS_FEED_EXISTS: {
    status: HttpStatus.CONFLICT,
    ar: 'هذا المصدر مضاف مسبقًا.',
    en: 'This feed already exists.',
  },
  RSS_FEED_IN_USE: {
    status: HttpStatus.CONFLICT,
    ar: 'أُنشئت مواد من هذا المصدر؛ أوقفه بدلًا من حذفه حتى يبقى إسناد المصدر.',
    en: 'Articles were created from this feed; deactivate it instead so their attribution is kept.',
  },
  RSS_PERMISSION_REQUIRED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'استخدام الملخص أو المحتوى الكامل أو صور المصدر يتطلب تسجيل مرجع إذن النشر.',
    en: 'Using summaries, full content or the feed images requires a recorded permission reference.',
  },
  RSS_FETCH_IN_PROGRESS: {
    status: HttpStatus.CONFLICT,
    ar: 'يجري جلب هذا المصدر الآن. حاول بعد قليل.',
    en: 'This feed is being fetched right now. Try again shortly.',
  },
  RSS_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    ar: 'عنصر RSS غير موجود.',
    en: 'The RSS item was not found.',
  },
  RSS_ITEM_ALREADY_DRAFTED: {
    status: HttpStatus.CONFLICT,
    ar: 'أُنشئت مسودة من هذا العنصر مسبقًا.',
    en: 'A draft was already created from this item.',
  },
  RSS_ITEM_NOT_DRAFTABLE: {
    status: HttpStatus.CONFLICT,
    ar: 'لا يمكن إنشاء مسودة من عنصر مكرر أو متجاهَل. استعده أولًا.',
    en: 'A duplicate or ignored item cannot become a draft. Restore it first.',
  },
  RSS_ITEM_LANGUAGE_UNSUPPORTED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    ar: 'لغة العنصر غير مدعومة. حدّد لغة المسودة (ar أو en).',
    en: 'The item language is not supported. Choose the draft language (ar or en).',
  },
} as const satisfies Record<string, LocalizedText & { status: HttpStatus }>;

export type ContentErrorCode = keyof typeof CONTENT_ERRORS;

/** AppException with the localized message of a news-area error code. */
export function contentError(
  code: ContentErrorCode,
  details?: unknown,
  headers?: Record<string, string>,
): AppException {
  const def = CONTENT_ERRORS[code];
  return new AppException({
    status: def.status,
    code,
    message: { ar: def.ar, en: def.en },
    details,
    headers,
  });
}

/** 422 VALIDATION_FAILED for one field (same `details` shape as the validation pipe). */
export function fieldError(field: string, constraint: string, message: LocalizedText) {
  return AppException.validation([{ field, constraints: { [constraint]: tr(message) } }]);
}
