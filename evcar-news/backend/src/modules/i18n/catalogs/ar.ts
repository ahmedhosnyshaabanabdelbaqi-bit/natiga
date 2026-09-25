/**
 * Server message catalog — Arabic (default language). Same keys and
 * {placeholders} as en.ts (enforced by catalogs.spec.ts).
 */
export const AR: Record<string, string> = {
  // --- أخطاء عامة ---------------------------------------------------------------------
  'errors.BAD_REQUEST': 'الطلب غير صالح.',
  'errors.INVALID_JSON': 'نص JSON في الطلب غير صالح.',
  'errors.VALIDATION_FAILED': 'بعض الحقول غير صالحة. راجع التفاصيل.',
  'errors.UNAUTHORIZED': 'يجب تسجيل الدخول.',
  'errors.TOKEN_EXPIRED': 'انتهت صلاحية الجلسة.',
  'errors.FORBIDDEN': 'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  'errors.NOT_FOUND': 'العنصر المطلوب غير موجود.',
  'errors.METHOD_NOT_ALLOWED': 'الطريقة غير مسموحة.',
  'errors.CONFLICT': 'يتعارض الطلب مع بيانات موجودة.',
  'errors.GONE': 'لم يعد هذا العنصر متاحًا.',
  'errors.PAYLOAD_TOO_LARGE': 'حجم البيانات المرسلة أكبر من المسموح.',
  'errors.UNSUPPORTED_MEDIA_TYPE': 'نوع المحتوى غير مدعوم.',
  'errors.PRECONDITION_FAILED': 'تغيّر العنصر منذ آخر قراءة.',
  'errors.RATE_LIMITED': 'طلبات كثيرة جدًا. حاول مرة أخرى بعد قليل.',
  'errors.INTEGRATION_NOT_CONFIGURED': 'هذه الخدمة غير مهيأة بعد.',
  'errors.SERVICE_UNAVAILABLE': 'الخدمة غير متاحة حاليًا.',
  'errors.UPSTREAM_ERROR': 'تعذر الوصول إلى خدمة خارجية.',
  'errors.NOT_IMPLEMENTED': 'هذه الميزة غير منفذة بعد.',
  'errors.INTERNAL_ERROR': 'حدث خطأ غير متوقع.',

  // --- أخطاء المنصة ------------------------------------------------------------------
  'errors.SETTING_UNKNOWN': 'الإعداد "{key}" غير معروف.',
  'errors.SETTING_INVALID': 'قيمة غير صالحة للإعداد "{key}". راجع التفاصيل.',
  'errors.DEFAULT_MARKET_INVALID': 'يجب أن يكون السوق الافتراضي سوقًا موجودًا ومفعّلًا.',
  'errors.LOGO_INVALID':
    'يجب أن يكون الشعار صورة PNG أو JPEG أو WebP بأبعاد {min}×{min} بكسل على الأقل.',
  'errors.LOGO_TOO_LARGE': 'حجم ملف الشعار أكبر من {maxKb} كيلوبايت.',
  'errors.MARKET_EXISTS': 'يوجد سوق بالرمز {code} بالفعل.',
  'errors.MARKET_IS_DEFAULT':
    'لا يمكن تعطيل السوق الافتراضي أو حذفه. اختر سوقًا افتراضيًا آخر أولًا.',
  'errors.MARKET_IN_USE': 'السوق {code} مستخدم في بيانات موجودة؛ عطّله بدلًا من حذفه.',
  'errors.CURRENCY_EXISTS': 'توجد عملة بالرمز {code} بالفعل.',
  'errors.CURRENCY_NOT_FOUND': 'العملة {code} غير موجودة.',
  'errors.CURRENCY_IN_USE': 'العملة {code} مستخدمة في أسواق أو أسعار أو تعرفات ولا يمكن حذفها.',
  'errors.TIMEZONE_INVALID':
    'المنطقة الزمنية "{timezone}" غير معروفة (استخدم اسم IANA مثل Africa/Cairo).',
  'errors.TRANSLATION_EXISTS': 'توجد ترجمة مخصصة لهذا المفتاح وهذه اللغة بالفعل.',
  'errors.TRANSLATION_KEY_UNKNOWN': 'رسالة الخادم "{key}" غير موجودة.',
  'errors.TRANSLATION_PLACEHOLDERS_MISMATCH':
    'يجب أن يستخدم النص هذه المتغيرات فقط: {placeholders}.',
  'errors.JOBS_UNAVAILABLE':
    'المهام الخلفية غير متاحة حاليًا: تعذر الاتصال بـ Redis. أعد المحاولة لاحقًا.',
  'errors.JOB_NOT_FAILED': 'يمكن إعادة تشغيل المهام الفاشلة فقط.',
  'errors.JOB_ACTIVE': 'لا يمكن حذف مهمة قيد التنفيذ.',
  'errors.IMPORT_TYPE_INVALID': 'نوع مهمة الاستيراد غير صالح.',
  'errors.IMPORT_JOB_CANCELLED': 'تم إلغاء مهمة الاستيراد.',
  'errors.IMPORT_JOB_FINISHED': 'انتهت مهمة الاستيراد بالفعل.',
  'errors.FEED_URL_NOT_ALLOWED': 'رابط الخلاصة غير مسموح: يجب أن يكون https وعلى عنوان عام.',
  'errors.FEED_INVALID': 'المحتوى المستلم ليس خلاصة RSS أو Atom صالحة.',
  'errors.ROUTE_NOT_FOUND': 'تعذر إيجاد مسار قيادة بين هذه النقاط.',
  'errors.SOURCE_NOT_SYNCABLE': 'مصدر المحطات هذا لا يدعم المزامنة.',

  // --- الإشعارات --------------------------------------------------------------------
  'notifications.article_published.title': 'خبر جديد عن {subject}',
  'notifications.article_published.body': '{title}',
  'notifications.new_vehicle.title': 'جديد في دليل السيارات: {car}',
  'notifications.new_vehicle.body': '{summary}',
  'notifications.price_changed.title': 'تحديث سعر {car}',
  'notifications.price_changed.body':
    'السعر الجديد في {market}: {price} ({priceType})، ساري من {date}.',
  'notifications.tour_published.title': 'جولة 360° جديدة: {car}',
  'notifications.tour_published.body': 'شاهد مقصورة {car} ({trim}) من الداخل.',
  'notifications.reminder_due.title': 'تذكير: {title}',
  'notifications.reminder_due.body': 'موعد {title} لسيارتك {car} في {date}.',
  'notifications.station_report_update.title': 'تحديث على بلاغك',
  'notifications.station_report_update.body': 'حالة بلاغك عن محطة {station} أصبحت: {status}.',
  'notifications.comment_reply.title': 'رد جديد على تعليقك',
  'notifications.comment_reply.body': '{author}: {excerpt}',
  'notifications.answer_posted.title': 'إجابة جديدة على سؤالك',
  'notifications.answer_posted.body': '{excerpt}',

  // --- تسميات ------------------------------------------------------------------------
  'labels.not_available': 'غير متوفر',
  'labels.price_type.official_msrp': 'السعر الرسمي',
  'labels.price_type.dealer': 'سعر الوكيل',
  'labels.price_type.market_estimate': 'تقدير السوق',
  'labels.price.converted_estimate': 'تقديري بعد التحويل',
  'labels.report_status.open': 'مفتوح',
  'labels.report_status.in_review': 'قيد المراجعة',
  'labels.report_status.resolved': 'تمت المعالجة',
  'labels.report_status.rejected': 'مرفوض',
  'labels.availability.unknown': 'الحالة اللحظية غير معروفة',
};
