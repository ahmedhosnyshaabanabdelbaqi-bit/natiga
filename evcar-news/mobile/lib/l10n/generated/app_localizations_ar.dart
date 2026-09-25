// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get accountDeleteAccount => 'حذف الحساب';

  @override
  String get accountDeleteAcknowledge => 'أفهم أن الحذف نهائي ولا يمكن التراجع عنه.';

  @override
  String get accountDeleteButton => 'حذف الحساب نهائيًا';

  @override
  String get accountDeletePasswordLabel => 'أدخل كلمة المرور للتأكيد';

  @override
  String get accountDeleteTitle => 'حذف الحساب';

  @override
  String get accountDeleteWarning =>
      'سيُحذف حسابك وبياناتك الشخصية نهائيًا، مثل الجراج والمفضلة وسجل الشحن والتذكيرات والإعدادات المتزامنة. أما مساهماتك العامة مثل المراجعات والتعليقات فتُنسب إلى مستخدم مجهول. لا يمكن التراجع عن هذا الإجراء.';

  @override
  String get accountDeleted => 'تم حذف حسابك.';

  @override
  String get accountEmailNotVerified => 'لم يتم تأكيد بريدك الإلكتروني بعد.';

  @override
  String get accountEmailVerified => 'البريد مؤكد';

  @override
  String get accountExploreSection => 'استكشاف';

  @override
  String get accountGuestMessage =>
      'كل المحتوى العام متاح دون تسجيل. أنشئ حسابًا لحفظ سياراتك ومفضلتك ومزامنتها بين أجهزتك.';

  @override
  String get accountGuestTitle => 'أنت تتصفح كزائر';

  @override
  String get accountLoggedOut => 'تم تسجيل الخروج.';

  @override
  String get accountLogout => 'تسجيل الخروج';

  @override
  String get accountLogoutConfirm => 'هل تريد تسجيل الخروج من هذا الجهاز؟';

  @override
  String get accountMyToolsSection => 'أدواتي';

  @override
  String get accountOfflineUser => 'تُعرض بيانات الحساب المحفوظة لعدم توفر الاتصال.';

  @override
  String get accountPreferredLanguageLabel => 'لغة الرسائل والإشعارات';

  @override
  String get accountProfile => 'الملف الشخصي';

  @override
  String get accountProfileSaved => 'تم حفظ التغييرات.';

  @override
  String get accountProfileTitle => 'الملف الشخصي';

  @override
  String get accountRestoring => 'جارٍ استعادة الجلسة…';

  @override
  String accountSessionCreated(String time) {
    return 'بدأت: $time';
  }

  @override
  String accountSessionIp(String ip) {
    return 'عنوان IP: $ip';
  }

  @override
  String accountSessionLastUsed(String time) {
    return 'آخر استخدام: $time';
  }

  @override
  String get accountSessionRevoke => 'إنهاء الجلسة';

  @override
  String get accountSessionRevokeConfirm => 'هل تريد إنهاء هذه الجلسة؟ سيحتاج ذلك الجهاز إلى تسجيل الدخول مجددًا.';

  @override
  String get accountSessionRevoked => 'تم إنهاء الجلسة.';

  @override
  String get accountSessionThisDevice => 'هذا الجهاز';

  @override
  String get accountSessionUnknownDevice => 'جهاز غير معروف';

  @override
  String get accountSessions => 'الأجهزة والجلسات';

  @override
  String get accountSessionsEmpty => 'لا توجد جلسات نشطة.';

  @override
  String get accountSessionsTitle => 'الأجهزة والجلسات';

  @override
  String get accountSettingsSection => 'الإعدادات والخصوصية';

  @override
  String get accountTitle => 'حسابي';

  @override
  String get accountVerifyNow => 'تأكيد الآن';

  @override
  String get authBackToLogin => 'العودة لتسجيل الدخول';

  @override
  String get authConfirmPasswordLabel => 'تأكيد كلمة المرور';

  @override
  String get authContinueAsGuest => 'المتابعة كزائر';

  @override
  String get authDisplayNameLabel => 'الاسم الظاهر';

  @override
  String authDisplayNameTooLong(int max) {
    return 'الاسم أطول من المسموح ($max حرفًا).';
  }

  @override
  String get authEmailInvalid => 'أدخل بريدًا إلكترونيًا صحيحًا.';

  @override
  String get authEmailLabel => 'البريد الإلكتروني';

  @override
  String get authForgotButton => 'إرسال الرابط';

  @override
  String get authForgotDone => 'إن كان هناك حساب بهذا البريد، فستصلك رسالة بتعليمات إعادة التعيين.';

  @override
  String get authForgotIntro => 'أدخل بريدك الإلكتروني وسنرسل إليك رابطًا لإعادة تعيين كلمة المرور.';

  @override
  String get authForgotPasswordLink => 'نسيت كلمة المرور؟';

  @override
  String get authForgotTitle => 'استعادة كلمة المرور';

  @override
  String get authGuestNote =>
      'يمكنك تصفح الأخبار والسيارات والمحطات دون حساب. الحساب مطلوب فقط للمزامنة والميزات الشخصية.';

  @override
  String get authHaveAccount => 'لديك حساب بالفعل؟';

  @override
  String get authHaveResetCode => 'لدي رمز إعادة التعيين';

  @override
  String get authLoginButton => 'دخول';

  @override
  String get authLoginTitle => 'تسجيل الدخول';

  @override
  String get authNewPasswordLabel => 'كلمة المرور الجديدة';

  @override
  String get authNoAccount => 'ليس لديك حساب؟';

  @override
  String get authPasswordLabel => 'كلمة المرور';

  @override
  String authPasswordTooLong(int max) {
    return 'كلمة المرور أطول من المسموح ($max حرفًا).';
  }

  @override
  String authPasswordTooShort(int min) {
    return 'يجب ألا تقل كلمة المرور عن $min أحرف.';
  }

  @override
  String get authPasswordsDoNotMatch => 'كلمتا المرور غير متطابقتين.';

  @override
  String get authRegisterButton => 'إنشاء الحساب';

  @override
  String authRegisterSuccessMessage(String email) {
    return 'أرسلنا رابط تأكيد إلى $email. افتح الرابط من بريدك لتأكيد الحساب، ثم سجّل الدخول.';
  }

  @override
  String get authRegisterSuccessTitle => 'تم إنشاء الحساب';

  @override
  String get authRegisterTitle => 'إنشاء حساب';

  @override
  String get authRequired => 'هذا الحقل مطلوب.';

  @override
  String get authResendVerification => 'إعادة إرسال رابط التأكيد';

  @override
  String get authResendVerificationDone => 'إن كان الحساب موجودًا وغير مؤكد، فسيصلك رابط جديد.';

  @override
  String get authResetButton => 'حفظ كلمة المرور';

  @override
  String get authResetDone => 'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.';

  @override
  String get authResetTitle => 'تعيين كلمة مرور جديدة';

  @override
  String get authResetTokenLabel => 'رمز إعادة التعيين';

  @override
  String get authVerifyButton => 'تأكيد';

  @override
  String get authVerifyEmailAction => 'تأكيد بريدي الإلكتروني';

  @override
  String get authVerifyIntro => 'افتح رابط التأكيد المرسل إلى بريدك على هذا الجهاز، أو الصق رمز التأكيد هنا.';

  @override
  String get authVerifySuccess => 'تم تأكيد بريدك الإلكتروني.';

  @override
  String get authVerifyTitle => 'تأكيد البريد الإلكتروني';

  @override
  String get authVerifyTokenLabel => 'رمز التأكيد';

  @override
  String get calculatorsTitle => 'حاسبات الشحن والتشغيل';

  @override
  String get carsBrandTitle => 'الماركة';

  @override
  String get carsCatalogTitle => 'دليل السيارات';

  @override
  String get carsDetailTitle => 'تفاصيل السيارة';

  @override
  String get chargingLogsTitle => 'سجل الشحن';

  @override
  String get chargingStationTitle => 'تفاصيل المحطة';

  @override
  String get chargingTitle => 'محطات الشحن';

  @override
  String get commonAdLabel => 'إعلان';

  @override
  String get commonApply => 'تطبيق';

  @override
  String commonCachedDataNotice(String time) {
    return 'نسخة محفوظة من $time، وقد لا تكون أحدث البيانات.';
  }

  @override
  String get commonCancel => 'إلغاء';

  @override
  String get commonClearSearch => 'مسح البحث';

  @override
  String get commonClose => 'إغلاق';

  @override
  String get commonCompareAdd => 'أضف للمقارنة';

  @override
  String get commonCompareAddedSnack => 'أُضيفت إلى المقارنة';

  @override
  String get commonCompareClear => 'مسح';

  @override
  String commonCompareFull(int max) {
    return 'يمكن مقارنة $max سيارات كحد أقصى. أزل سيارة أولًا.';
  }

  @override
  String get commonCompareInTray => 'ضمن المقارنة';

  @override
  String get commonCompareNeedTwo => 'اختر سيارتين على الأقل للمقارنة.';

  @override
  String get commonCompareNow => 'قارن';

  @override
  String get commonCompareRemove => 'إزالة من المقارنة';

  @override
  String commonCompareTrayCount(int count, int max) {
    return '$count من $max سيارات محددة';
  }

  @override
  String get commonConfirm => 'تأكيد';

  @override
  String get commonCreateAccount => 'إنشاء حساب';

  @override
  String commonDaysAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'منذ $count يومًا',
      few: 'منذ $count أيام',
      two: 'منذ يومين',
      one: 'منذ يوم',
    );
    return '$_temp0';
  }

  @override
  String get commonDemoDescription => 'بيانات للاختبار فقط — ليست معلومات حقيقية.';

  @override
  String get commonDemoLabel => 'بيانات تجريبية';

  @override
  String get commonDone => 'تم';

  @override
  String get commonEmptyMessage => 'لا توجد عناصر لعرضها حاليًا.';

  @override
  String get commonEmptyTitle => 'لا يوجد محتوى بعد';

  @override
  String get commonErrorGeneric => 'تعذر إكمال الطلب. حاول مرة أخرى.';

  @override
  String get commonErrorTitle => 'حدث خطأ';

  @override
  String get commonExternalVideo => 'مشاهدة الفيديو من المصدر';

  @override
  String get commonFavoriteAdd => 'أضف إلى المفضلة';

  @override
  String get commonFavoriteAdded => 'أُضيفت إلى المفضلة';

  @override
  String get commonFavoriteFailed => 'تعذر تحديث المفضلة. حاول مرة أخرى.';

  @override
  String get commonFavoriteLocalOnly => 'محفوظة على هذا الجهاز. سجّل الدخول لمزامنتها بين أجهزتك.';

  @override
  String get commonFavoriteRemove => 'إزالة من المفضلة';

  @override
  String get commonFavoriteRemoved => 'أُزيلت من المفضلة';

  @override
  String get commonFilters => 'الفلاتر';

  @override
  String commonFiltersActive(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count فلترًا مفعّلًا',
      few: '$count فلاتر مفعّلة',
      two: 'فلتران مفعّلان',
      one: 'فلتر واحد مفعّل',
    );
    return '$_temp0';
  }

  @override
  String get commonForbiddenMessage => 'ليست لديك صلاحية لعرض هذا المحتوى.';

  @override
  String get commonHidePassword => 'إخفاء كلمة المرور';

  @override
  String commonHoursAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'منذ $count ساعة',
      few: 'منذ $count ساعات',
      two: 'منذ ساعتين',
      one: 'منذ ساعة',
    );
    return '$_temp0';
  }

  @override
  String commonImageCredit(String credit) {
    return 'الصورة: $credit';
  }

  @override
  String get commonImageUnavailable => 'الصورة غير متاحة';

  @override
  String get commonJustNow => 'الآن';

  @override
  String commonLastUpdated(String time) {
    return 'آخر تحديث $time';
  }

  @override
  String get commonLastUpdatedUnknown => 'آخر تحديث: غير متوفر';

  @override
  String get commonLinkOpenFailed => 'تعذر فتح الرابط.';

  @override
  String get commonLoading => 'جارٍ التحميل…';

  @override
  String get commonMayBeOutdated => 'قد لا تكون محدّثة';

  @override
  String commonMeasuredBy(String cycle) {
    return 'معيار القياس: $cycle';
  }

  @override
  String commonMinutesAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'منذ $count دقيقة',
      few: 'منذ $count دقائق',
      two: 'منذ دقيقتين',
      one: 'منذ دقيقة',
    );
    return '$_temp0';
  }

  @override
  String get commonMore => 'المزيد';

  @override
  String get commonMoreInfo => 'مزيد من المعلومات';

  @override
  String get commonNotAvailable => 'غير متوفر';

  @override
  String get commonNotConfiguredMessage => 'لم تُفعَّل هذه الخدمة بعد من لوحة الإدارة.';

  @override
  String get commonNotConfiguredTitle => 'الخدمة غير مهيأة';

  @override
  String get commonNotFoundMessage => 'المحتوى المطلوب غير موجود أو لم يعد متاحًا.';

  @override
  String get commonNotSupportedOnPlatformMessage => 'تعمل هذه الميزة في تطبيقي Android وiOS.';

  @override
  String get commonNotSupportedOnPlatformTitle => 'غير متاح في معاينة الويب';

  @override
  String get commonOfflineBanner => 'أنت غير متصل بالإنترنت';

  @override
  String get commonOfflineMessage => 'تحقق من اتصالك ثم أعد المحاولة. المحتوى الذي حفظته متاح دون إنترنت.';

  @override
  String get commonOfflineTitle => 'لا يوجد اتصال بالإنترنت';

  @override
  String get commonOpenSettings => 'فتح إعدادات الجهاز';

  @override
  String get commonPermissionDeniedMessage => 'تحتاج هذه الميزة إلى إذن لم يُمنح بعد. يمكنك منحه من إعدادات الجهاز.';

  @override
  String get commonPermissionDeniedTitle => 'الإذن غير ممنوح';

  @override
  String get commonPermissionLocationMessage =>
      'نستخدم موقعك أثناء فتح التطبيق فقط لعرض المحطات القريبة. يمكنك السماح به من إعدادات الجهاز أو اختيار مكان يدويًا.';

  @override
  String get commonPermissionLocationTitle => 'إذن الموقع غير ممنوح';

  @override
  String get commonPermissionMotionMessage => 'التحكم بالحركة اختياري. يمكنك دائمًا التجوّل بالسحب.';

  @override
  String get commonPermissionMotionTitle => 'مستشعرات الحركة غير مسموح بها';

  @override
  String get commonPermissionNotificationsMessage =>
      'تحتاج التذكيرات إلى إذن الإشعارات. يمكنك السماح به من إعدادات الجهاز.';

  @override
  String get commonPermissionNotificationsTitle => 'الإشعارات غير مسموح بها';

  @override
  String get commonPowertrainBev => 'كهربائية بالكامل';

  @override
  String get commonPowertrainErev => 'بموسّع مدى';

  @override
  String get commonPowertrainHev => 'هجينة';

  @override
  String get commonPowertrainPhev => 'هجينة قابلة للشحن';

  @override
  String commonPriceAsOf(String date) {
    return 'بتاريخ $date';
  }

  @override
  String get commonPriceConverted => 'تقديري بعد التحويل';

  @override
  String get commonPriceDealer => 'سعر الوكيل';

  @override
  String get commonPriceMarketEstimate => 'سعر تقديري للسوق';

  @override
  String get commonPriceNotAvailable => 'السعر غير متوفر';

  @override
  String get commonPriceOfficialMsrp => 'السعر الرسمي';

  @override
  String get commonRangeCycleOther => 'معيار آخر';

  @override
  String get commonRangeElectric => 'المدى الكهربائي';

  @override
  String get commonRangeTotal => 'المدى الإجمالي';

  @override
  String get commonRateLimitedMessage => 'طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.';

  @override
  String get commonReliabilityDisputed => 'محل خلاف';

  @override
  String get commonReliabilityEstimated => 'تقديري';

  @override
  String commonReliabilityLabel(String level) {
    return 'درجة الموثوقية: $level';
  }

  @override
  String get commonReliabilityManufacturerClaim => 'بيان الشركة المصنّعة';

  @override
  String get commonReliabilityUnverified => 'غير موثّق';

  @override
  String get commonReliabilityVerified => 'موثّق';

  @override
  String get commonReset => 'إعادة ضبط';

  @override
  String get commonRetry => 'إعادة المحاولة';

  @override
  String get commonSave => 'حفظ';

  @override
  String get commonSearchHint => 'بحث';

  @override
  String get commonSeeAll => 'عرض الكل';

  @override
  String commonSeeAllSection(String section) {
    return 'عرض الكل: $section';
  }

  @override
  String get commonSelected => 'محدد';

  @override
  String get commonServerErrorMessage => 'الخادم غير متاح حاليًا. حاول لاحقًا.';

  @override
  String get commonShare => 'مشاركة';

  @override
  String get commonShowPassword => 'إظهار كلمة المرور';

  @override
  String get commonSignIn => 'تسجيل الدخول';

  @override
  String get commonSignInRequiredMessage =>
      'تحفظ هذه الميزة بياناتك الشخصية، لذا تحتاج إلى حساب. يمكنك متابعة تصفح بقية التطبيق دون تسجيل.';

  @override
  String get commonSignInRequiredTitle => 'سجّل الدخول للمتابعة';

  @override
  String get commonSortBy => 'الترتيب حسب';

  @override
  String commonSource(String source) {
    return 'المصدر: $source';
  }

  @override
  String get commonSourceUnknown => 'المصدر غير محدد';

  @override
  String commonSponsoredBy(String name) {
    return 'برعاية $name';
  }

  @override
  String get commonSponsoredDescription => 'محتوى مدفوع. لا يغيّر نتائج المقارنة أو الترتيب أبدًا.';

  @override
  String get commonSponsoredLabel => 'رعاية';

  @override
  String get commonTimeoutMessage => 'استغرق الخادم وقتًا طويلًا في الرد. حاول مرة أخرى.';

  @override
  String get commonTour360 => 'جولة 360°';

  @override
  String get commonTour360Available => 'تتوفر جولة داخلية 360°';

  @override
  String get commonUnderConstructionMessage => 'هذه الشاشة لم تُنفَّذ بعد، ولا تعرض أي بيانات حتى يكتمل ربطها بالخادم.';

  @override
  String commonUnderConstructionRequested(String path) {
    return 'المسار المطلوب: $path';
  }

  @override
  String get commonUnderConstructionTitle => 'قيد التنفيذ';

  @override
  String get commonUnknown => 'غير معروف';

  @override
  String commonVerifiedOn(String date) {
    return 'تاريخ التحقق: $date';
  }

  @override
  String get commonWebPreviewBanner => 'معاينة ويب';

  @override
  String get compareRecommendationsTitle => 'ترشيح سيارة مناسبة';

  @override
  String get compareSharedTitle => 'مقارنة مشتركة';

  @override
  String get compareTitle => 'المقارنات';

  @override
  String get encyclopediaEntryTitle => 'مقال الموسوعة';

  @override
  String get encyclopediaTitle => 'موسوعة السيارات الكهربائية';

  @override
  String get favoritesSavedOfflineTitle => 'المحفوظ للقراءة دون إنترنت';

  @override
  String get favoritesTitle => 'المفضلة';

  @override
  String get garageTitle => 'جراجي';

  @override
  String get homeTitle => 'الرئيسية';

  @override
  String get newsArticleTitle => 'الخبر';

  @override
  String get newsListTitle => 'الأخبار';

  @override
  String get notificationsTitle => 'الإشعارات';

  @override
  String get remindersTitle => 'التذكيرات';

  @override
  String get searchTitle => 'بحث';

  @override
  String get servicesDirectoryTitle => 'دليل الخدمات';

  @override
  String get settingsAboutSection => 'حول التطبيق';

  @override
  String get settingsClearCache => 'مسح البيانات المؤقتة';

  @override
  String get settingsClearCacheConfirm => 'هل تريد مسح البيانات المؤقتة؟';

  @override
  String get settingsClearCacheDone => 'تم مسح البيانات المؤقتة.';

  @override
  String get settingsClearCacheSubtitle => 'يحذف النسخ المؤقتة من المحتوى، ولا يحذف ما حفظته للقراءة دون إنترنت.';

  @override
  String settingsConfigCache(String time) {
    return 'تُستخدم إعدادات خادم محفوظة من $time';
  }

  @override
  String get settingsConfigFallback => 'تعذر الوصول إلى الخادم؛ تُستخدم الإعدادات الافتراضية المدمجة في التطبيق.';

  @override
  String settingsConfigNetwork(String time) {
    return 'إعدادات الخادم محدّثة ($time)';
  }

  @override
  String get settingsConfigRefresh => 'تحديث إعدادات الخادم';

  @override
  String get settingsDataSection => 'البيانات';

  @override
  String get settingsDigitsSubtitle => 'تُستخدم عندما تكون لغة التطبيق العربية فقط.';

  @override
  String get settingsDigitsTitle => 'أرقام عربية (٠١٢٣)';

  @override
  String settingsFontPreviewNumbers(String number, String date) {
    return 'مثال على الأرقام والتاريخ: $number — $date';
  }

  @override
  String get settingsFontPreviewSample => 'نص لمعاينة الخط: الأخبار، دليل السيارات، المقارنات، ومحطات الشحن.';

  @override
  String get settingsFontPreviewTitle => 'معاينة';

  @override
  String get settingsLanguageArabic => 'العربية';

  @override
  String get settingsLanguageEnglish => 'English (الإنجليزية)';

  @override
  String get settingsLanguageHint => 'لغة التطبيق مستقلة عن الدولة؛ يمكنك قراءة محتوى أي دولة بأي لغة.';

  @override
  String get settingsLanguageSection => 'اللغة';

  @override
  String get settingsLanguageSystem => 'لغة الجهاز';

  @override
  String get settingsLicenses => 'تراخيص البرمجيات والخطوط';

  @override
  String settingsMarketCurrency(String currency) {
    return 'العملة: $currency';
  }

  @override
  String get settingsMarketHint =>
      'تحدد الدولة الأسعار والتوافر والعملة. اختيار دولة لا يعني توافر بيانات محطات الشحن فيها.';

  @override
  String get settingsMarketSection => 'الدولة (السوق)';

  @override
  String get settingsMarketsUnavailable => 'لا توجد دول مفعّلة في إعدادات الخادم.';

  @override
  String get settingsPrivacy => 'سياسة الخصوصية';

  @override
  String get settingsTerms => 'شروط الاستخدام';

  @override
  String get settingsTextSizeDecrease => 'تصغير الخط';

  @override
  String get settingsTextSizeHint => 'يُطبَّق فوق حجم الخط المختار في إعدادات الجهاز.';

  @override
  String get settingsTextSizeIncrease => 'تكبير الخط';

  @override
  String get settingsTextSizeSection => 'حجم الخط';

  @override
  String get settingsThemeDark => 'داكن';

  @override
  String get settingsThemeLight => 'فاتح';

  @override
  String get settingsThemeSection => 'المظهر';

  @override
  String get settingsThemeSystem => 'حسب الجهاز';

  @override
  String get settingsTitle => 'الإعدادات';

  @override
  String settingsVersion(String version) {
    return 'الإصدار $version';
  }

  @override
  String get settingsVersionUnknown => 'الإصدار غير معروف';

  @override
  String get shellGoHome => 'العودة إلى الرئيسية';

  @override
  String get shellNavAccount => 'حسابي';

  @override
  String get shellNavCars => 'السيارات';

  @override
  String get shellNavCharging => 'الشحن';

  @override
  String get shellNavCompare => 'المقارنات';

  @override
  String get shellNavHome => 'الرئيسية';

  @override
  String get shellNotificationsTooltip => 'الإشعارات';

  @override
  String get shellRouteNotFoundMessage => 'لا توجد في التطبيق شاشة بهذا العنوان.';

  @override
  String get shellRouteNotFoundTitle => 'الصفحة غير موجودة';

  @override
  String get shellSearchTooltip => 'بحث';

  @override
  String get shellSessionExpired => 'انتهت جلستك. سجّل الدخول مرة أخرى.';

  @override
  String get toursViewerTitle => 'جولة داخلية 360°';

  @override
  String get tripsTitle => 'مخطط الرحلات';
}
