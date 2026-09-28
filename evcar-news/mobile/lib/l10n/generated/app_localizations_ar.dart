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
  String get calculatorsCalculatorTitle => 'الحاسبة';

  @override
  String get calculatorsTitle => 'حاسبات الشحن والتشغيل';

  @override
  String carsAbout(String name) {
    return 'عن $name';
  }

  @override
  String get carsAllReviews => 'كل المراجعات';

  @override
  String get carsArticleBuyingGuide => 'دليل شراء';

  @override
  String get carsArticleExplainer => 'شرح';

  @override
  String get carsArticleNews => 'خبر';

  @override
  String get carsArticleOpinion => 'رأي';

  @override
  String get carsArticleReview => 'مراجعة';

  @override
  String get carsArticleTestDrive => 'تجربة قيادة';

  @override
  String get carsAvailabilityAvailable => 'متوفرة';

  @override
  String get carsAvailabilityComingSoon => 'قريبًا';

  @override
  String get carsAvailabilityDiscontinued => 'متوقفة';

  @override
  String get carsAvailabilityNotListed => 'غير مطروحة في هذا السوق';

  @override
  String get carsAvailabilityUnknown => 'التوفر غير معروف';

  @override
  String carsAveragePower(String power) {
    return 'المتوسط $power';
  }

  @override
  String carsBatteryTemp(String temp) {
    return 'البطارية عند $temp °م';
  }

  @override
  String get carsBodyConvertible => 'مكشوفة';

  @override
  String get carsBodyCoupe => 'كوبيه';

  @override
  String get carsBodyCrossover => 'كروس أوفر';

  @override
  String get carsBodyHatchback => 'هاتشباك';

  @override
  String get carsBodyMpv => 'عائلية (MPV)';

  @override
  String get carsBodyOther => 'هيكل آخر';

  @override
  String get carsBodyPickup => 'بيك أب';

  @override
  String get carsBodySedan => 'سيدان';

  @override
  String get carsBodySuv => 'دفع رباعي (SUV)';

  @override
  String get carsBodyVan => 'فان';

  @override
  String get carsBodyWagon => 'ستيشن';

  @override
  String carsBrandCountry(String country) {
    return 'المنشأ: $country';
  }

  @override
  String carsBrandModelsIn(String market) {
    return 'الطرازات في $market';
  }

  @override
  String get carsBrandNoCarsInMarket => 'لا طرازات في هذا السوق';

  @override
  String get carsBrandNoCarsMessage => 'لا توجد طرازات معروضة لهذه العلامة في السوق المختار. جرّب سوقًا آخر.';

  @override
  String carsBrandNoCarsTitle(String market) {
    return 'لا طرازات مدرجة في $market';
  }

  @override
  String get carsBrandNotInMarketHint => 'معروضة للاطلاع فقط؛ الأسعار والتوفر تخص أسواقًا أخرى.';

  @override
  String carsBrandNotInMarketTitle(String market) {
    return 'غير مطروحة في $market';
  }

  @override
  String get carsBrandTitle => 'العلامة التجارية';

  @override
  String get carsBrandWebsite => 'الموقع الرسمي';

  @override
  String get carsBrandsEmptyMessage => 'تظهر العلامات هنا بعد إضافتها إلى الدليل.';

  @override
  String get carsBrandsEmptyTitle => 'لا توجد علامات بعد';

  @override
  String get carsBrandsNoMatchMessage => 'تحقق من الكتابة أو جرّب اسمًا آخر.';

  @override
  String get carsBrandsNoMatchTitle => 'لم يتم العثور على علامة';

  @override
  String get carsBrandsNotInMarket => 'غير مطروحة في سوقك';

  @override
  String get carsBrandsNotInMarketHint => 'ليس لهذه العلامات طرازات مدرجة في السوق المختار.';

  @override
  String get carsBrandsSearchHint => 'ابحث في العلامات';

  @override
  String get carsBrandsTitle => 'العلامات التجارية';

  @override
  String get carsCatalogTitle => 'دليل السيارات';

  @override
  String get carsChangeMarket => 'تغيير السوق';

  @override
  String get carsChargingCurve => 'منحنى الشحن';

  @override
  String get carsChargingInlets => 'منافذ الشحن';

  @override
  String get carsChargingNotPlugIn => 'هذه سيارة هجينة ذاتية الشحن بلا منفذ شحن، لذلك لا توجد لها بيانات شحن.';

  @override
  String carsChargingTimeLabel(String current, String window) {
    return 'شحن $current ($window)';
  }

  @override
  String get carsChargingTimes => 'أزمنة الشحن';

  @override
  String get carsChargingTitle => 'الشحن';

  @override
  String get carsChooseVersion => 'اختر النسخة بدقة';

  @override
  String get carsChooseVersionHint => 'المواصفات والأسعار والجولات أدناه تخص هذا السوق وسنة الطراز والفئة فقط.';

  @override
  String carsCompareNeedsMarket(String market) {
    return 'غير مطروحة في $market — لا يمكن مقارنتها هناك';
  }

  @override
  String get carsConsumptionElectric => 'استهلاك الكهرباء';

  @override
  String get carsConsumptionFuel => 'استهلاك الوقود';

  @override
  String get carsCurrentAc => 'تيار متردد AC';

  @override
  String get carsCurrentDc => 'تيار مستمر DC';

  @override
  String get carsCurveHideTable => 'إخفاء الجدول';

  @override
  String get carsCurvePower => 'القدرة';

  @override
  String get carsCurveShowTable => 'عرض كجدول';

  @override
  String get carsCurveSoc => 'نسبة الشحن';

  @override
  String carsCurveSummary(String current, String peak, String from, String to) {
    return 'منحنى شحن $current: الذروة $peak، مقاس من $from إلى $to من نسبة الشحن.';
  }

  @override
  String get carsDerivedValue => 'محسوبة من قيمة منشورة أخرى';

  @override
  String get carsDetailTitle => 'تفاصيل السيارة';

  @override
  String carsDoors(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count باب',
      many: '$count بابًا',
      few: '$count أبواب',
      two: 'بابان',
      one: 'باب واحد',
      zero: 'لا أبواب',
    );
    return '$_temp0';
  }

  @override
  String get carsDriveAwd => 'دفع رباعي';

  @override
  String get carsDriveFwd => 'دفع أمامي';

  @override
  String get carsDriveRwd => 'دفع خلفي';

  @override
  String carsEmptyMessage(String market) {
    return 'لم تُدرج سيارات في سوق $market بعد. يمكنك اختيار سوق آخر.';
  }

  @override
  String get carsEmptyTitle => 'لا توجد سيارات مدرجة بعد';

  @override
  String get carsEndOfList => 'وصلت إلى نهاية القائمة';

  @override
  String get carsFilterAny => 'أي';

  @override
  String carsFilterAtLeast(String value) {
    return '$value على الأقل';
  }

  @override
  String get carsFilterBody => 'نوع الهيكل';

  @override
  String get carsFilterClear => 'مسح الفلاتر';

  @override
  String get carsFilterCycle => 'دورة الاختبار';

  @override
  String get carsFilterMinRange => 'الحد الأدنى للمدى الكهربائي';

  @override
  String get carsFilterMinRangeHint => 'لا يُقارن المدى إلا ضمن دورة الاختبار نفسها.';

  @override
  String get carsFilterPowertrain => 'نوع المحرك';

  @override
  String get carsFilterPrice => 'السعر المحلي';

  @override
  String carsFilterPriceHint(String currency, String market) {
    return 'بعملة $currency لسوق $market. تُقارن الأسعار المحلية فقط؛ وتُخفى الفئات التي لا سعر محلي لها أثناء تفعيل هذا الفلتر.';
  }

  @override
  String carsFilterPriceHintNoCurrency(String market) {
    return 'بالعملة المحلية لسوق $market.';
  }

  @override
  String get carsFilterPriceInvalid => 'الحد الأدنى للسعر أعلى من الحد الأقصى.';

  @override
  String get carsFilterPriceMax => 'الحد الأقصى';

  @override
  String get carsFilterPriceMin => 'الحد الأدنى';

  @override
  String get carsFilterRemove => 'إزالة الفلتر';

  @override
  String get carsFilterSeats => 'المقاعد';

  @override
  String carsFilterSeatsAtLeast(int count) {
    return '$count+ مقاعد';
  }

  @override
  String get carsGalleryEmptyMessage => 'ننشر الصور المرخّصة فقط، ولا تتوفر صور لهذه السيارة بعد.';

  @override
  String get carsGalleryEmptyTitle => 'لا توجد صور بعد';

  @override
  String carsGalleryOf(String car) {
    return 'صور: $car';
  }

  @override
  String carsGalleryPhoto(int index, int total) {
    return 'الصورة $index من $total';
  }

  @override
  String get carsGalleryTitle => 'الصور';

  @override
  String carsInletsNeedMarket(String market) {
    return 'تختلف المنافذ حسب السوق، وهذه الفئة غير مدرجة في $market.';
  }

  @override
  String carsLocalName(String name) {
    return 'الاسم المحلي: $name';
  }

  @override
  String get carsMarket => 'السوق';

  @override
  String carsMarketLine(String market, String currency) {
    return 'الأسعار والتوفر لسوق $market ($currency)';
  }

  @override
  String carsMarketLineNoCurrency(String market) {
    return 'الأسعار والتوفر لسوق $market';
  }

  @override
  String carsMarketSpecific(String market) {
    return 'خاص بسوق $market';
  }

  @override
  String carsMaxPower(String power) {
    return 'حتى $power';
  }

  @override
  String carsMeasuredCycle(String cycle) {
    return 'دورة $cycle';
  }

  @override
  String get carsModeCity => 'المدينة';

  @override
  String get carsModeCombined => 'مختلط';

  @override
  String get carsModeHighway => 'الطريق السريع';

  @override
  String carsModelCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count طراز',
      many: '$count طرازًا',
      few: '$count طرازات',
      two: 'طرازان',
      one: 'طراز واحد',
      zero: 'لا طرازات',
    );
    return '$_temp0';
  }

  @override
  String get carsModelYear => 'سنة الطراز';

  @override
  String get carsNo => 'لا';

  @override
  String get carsNoArticlesMessage => 'ستظهر هنا الأخبار والمراجعات والأدلة الخاصة بهذه السيارة.';

  @override
  String get carsNoArticlesTitle => 'لا توجد مقالات مرتبطة بعد';

  @override
  String get carsNoCompetitorsMessage => 'لم يربط المحررون بعد منافسين مطروحين في هذا السوق.';

  @override
  String get carsNoCompetitorsTitle => 'لا منافسين مدرجين';

  @override
  String carsNoLocalPrice(String market) {
    return 'لم يُنشر سعر محلي لسوق $market بعد.';
  }

  @override
  String get carsNoMatchMessage => 'جرّب إزالة أحد الفلاتر أو توسيع نطاق السعر أو المدى.';

  @override
  String get carsNoMatchTitle => 'لا توجد سيارات تطابق هذه الفلاتر';

  @override
  String carsNotOfferedInMarket(String market) {
    return 'هذه الفئة غير مطروحة في $market، لذلك لا يوجد سعر محلي.';
  }

  @override
  String get carsNotPreconditioned => 'البطارية غير مهيأة مسبقًا';

  @override
  String get carsNotSoldAnywhere => 'غير مدرجة في أي سوق';

  @override
  String get carsNotSoldAnywhereMessage => 'هذه السيارة غير مدرجة في أي سوق بعد.';

  @override
  String carsNotSoldInMarketMessage(String markets) {
    return 'هذه السيارة مدرجة في: $markets. اختر أحدها لعرض الفئات والأسعار.';
  }

  @override
  String get carsNotSoldInMarketTitle => 'غير مطروحة في هذا السوق';

  @override
  String get carsNotSoldShort => 'غير مطروحة';

  @override
  String carsOnCharger(String power) {
    return 'على شاحن $power';
  }

  @override
  String carsOnboardLimit(String power) {
    return 'حد الشاحن الداخلي $power';
  }

  @override
  String get carsOpenFullSheet => 'فتح صفحة المواصفات الكاملة';

  @override
  String carsOpenModelPage(String model) {
    return 'كل نسخ $model';
  }

  @override
  String get carsOwnerReviewsEmptyMessage => 'هل تملك هذه السيارة؟ شارك تجربتك الحقيقية لتساعد غيرك.';

  @override
  String get carsOwnerReviewsEmptyTitle => 'لا توجد آراء ملاك لهذه الفئة بعد';

  @override
  String get carsOwnerReviewsUnavailableMessage => 'سيُفتح هذا القسم عند تفعيل مراجعات المجتمع.';

  @override
  String get carsOwnerReviewsUnavailableTitle => 'آراء الملاك غير متاحة بعد';

  @override
  String carsPeakPower(String power) {
    return 'الذروة $power';
  }

  @override
  String get carsPreconditioned => 'البطارية مهيأة مسبقًا';

  @override
  String get carsPriceCurrent => 'الحالي';

  @override
  String carsPriceFrom(String price) {
    return 'ابتداءً من $price';
  }

  @override
  String carsPriceHistory(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'سجل الأسعار ($count سعر)',
      many: 'سجل الأسعار ($count سعرًا)',
      few: 'سجل الأسعار ($count أسعار)',
      two: 'سجل الأسعار (سعران)',
      one: 'سجل الأسعار (سعر واحد)',
      zero: 'سجل الأسعار',
    );
    return '$_temp0';
  }

  @override
  String carsPriceIn(String market) {
    return 'السعر في $market';
  }

  @override
  String carsPricePeriod(String from, String to) {
    return '$from – $to';
  }

  @override
  String carsPriceSince(String date) {
    return 'منذ $date';
  }

  @override
  String get carsRangeAndConsumption => 'المدى والاستهلاك';

  @override
  String get carsRangeCycleExplainer =>
      'يُعرض كل رقم مع دورة اختباره (WLTP وEPA وCLTC…). لا تُحوَّل الدورات إلى بعضها، والمدى الفعلي غالبًا أقل.';

  @override
  String carsRatingOutOfFive(String rating) {
    return '$rating من 5';
  }

  @override
  String carsResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count سيارة',
      many: '$count سيارة',
      few: '$count سيارات',
      two: 'سيارتان',
      one: 'سيارة واحدة',
      zero: 'لا سيارات',
    );
    return '$_temp0';
  }

  @override
  String carsReviewCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مراجعة',
      many: '$count مراجعة',
      few: '$count مراجعات',
      two: 'مراجعتان',
      one: 'مراجعة واحدة',
      zero: 'لا مراجعات',
    );
    return '$_temp0';
  }

  @override
  String get carsSearchHint => 'ابحث عن علامة أو طراز أو فئة';

  @override
  String get carsSeatDriver => 'مقعد السائق';

  @override
  String get carsSeatPassenger => 'مقعد الراكب الأمامي';

  @override
  String get carsSeatRear => 'المقاعد الخلفية';

  @override
  String get carsSeatThirdRow => 'الصف الثالث';

  @override
  String get carsSeatTrunk => 'صندوق الأمتعة';

  @override
  String carsSeats(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مقعد',
      many: '$count مقعدًا',
      few: '$count مقاعد',
      two: 'مقعدان',
      one: 'مقعد واحد',
      zero: 'لا مقاعد',
    );
    return '$_temp0';
  }

  @override
  String get carsShareFailed => 'تعذّر فتح المشاركة.';

  @override
  String carsSoldIn(String markets) {
    return 'متوفرة في: $markets';
  }

  @override
  String get carsSortName => 'الاسم';

  @override
  String get carsSortNewest => 'الأحدث';

  @override
  String get carsSortPriceAsc => 'السعر: من الأقل';

  @override
  String get carsSortPriceDesc => 'السعر: من الأعلى';

  @override
  String get carsSortRange => 'الأطول مدى';

  @override
  String get carsSourceAccessedAt => 'تاريخ الاطلاع';

  @override
  String get carsSourceDocumentDate => 'تاريخ المستند';

  @override
  String get carsSourceOpen => 'فتح المصدر';

  @override
  String get carsSourcePublisher => 'الناشر';

  @override
  String get carsSourceTitle => 'مصدر البيانات';

  @override
  String get carsSourceVerifiedAt => 'تاريخ التحقق';

  @override
  String get carsSourcesTitle => 'المصادر';

  @override
  String get carsSpecsOnlyAvailable => 'إخفاء القيم غير المتوفرة';

  @override
  String get carsSpecsOnlyAvailableHint => 'تظهر القيم الناقصة بعبارة «غير متوفر» وليس صفرًا.';

  @override
  String get carsSpecsRemoveOffline => 'حذف النسخة المحفوظة';

  @override
  String get carsSpecsRemovedOffline => 'حُذفت النسخة المحفوظة';

  @override
  String get carsSpecsSaveOffline => 'حفظ المواصفات للقراءة دون اتصال';

  @override
  String get carsSpecsSavedOffline => 'حُفظت المواصفات للقراءة دون اتصال';

  @override
  String carsSpecsSavedOn(String time) {
    return 'حُفظت في $time';
  }

  @override
  String carsStarsCount(int stars, int count) {
    return '$stars نجوم: $count';
  }

  @override
  String get carsStatAcMax => 'شحن AC';

  @override
  String get carsStatAccel => '0–100 كم/س';

  @override
  String get carsStatBattery => 'البطارية';

  @override
  String get carsStatDcPeak => 'أقصى شحن DC';

  @override
  String get carsStatElectricRange => 'المدى الكهربائي';

  @override
  String get carsStatPower => 'القوة';

  @override
  String get carsStatRange => 'المدى';

  @override
  String get carsStatUsableBattery => 'البطارية الصافية';

  @override
  String get carsTabCompetitors => 'المنافسون';

  @override
  String get carsTabNews => 'الأخبار والمراجعات';

  @override
  String get carsTabOverview => 'نظرة عامة';

  @override
  String get carsTabOwners => 'آراء الملاك';

  @override
  String get carsTabSpecs => 'المواصفات';

  @override
  String get carsTabTours => 'جولة 360°';

  @override
  String get carsTableReliability => 'الموثوقية';

  @override
  String get carsTableSource => 'المصدر';

  @override
  String get carsTableSpec => 'المواصفة';

  @override
  String get carsTableValue => 'القيمة';

  @override
  String carsTourInterior(String color) {
    return 'المقصورة: $color';
  }

  @override
  String get carsTourOpen => 'ابدأ الجولة';

  @override
  String carsTourReference(String trim) {
    return 'مصوّرة في فئة مشابهة: $trim';
  }

  @override
  String carsTourSeats(String seats) {
    return 'الزوايا: $seats';
  }

  @override
  String get carsTourTitle => 'جولة داخلية 360°';

  @override
  String get carsTourUnavailable => 'الجولة غير متاحة لهذه الفئة';

  @override
  String get carsTourUnavailableHint =>
      'ننشر فقط جولات مصوّرة داخل سيارات حقيقية. يمكنك تصفح الصور المرخّصة بدلًا منها.';

  @override
  String get carsToursDisabled => 'الجولات الداخلية غير متاحة حاليًا';

  @override
  String get carsTrim => 'الفئة';

  @override
  String carsTrimCode(String code) {
    return 'الرمز $code';
  }

  @override
  String carsTrimCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count فئة',
      many: '$count فئة',
      few: '$count فئات',
      two: 'فئتان',
      one: 'فئة واحدة',
      zero: 'لا فئات',
    );
    return '$_temp0';
  }

  @override
  String get carsUnitInch => 'بوصة';

  @override
  String get carsUnitLitersPer100 => 'لتر/100 كم';

  @override
  String get carsVariantTitle => 'تفاصيل الفئة';

  @override
  String get carsVerifiedOwner => 'مالك موثّق';

  @override
  String carsVerifiedOwners(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مالك موثّق',
      many: '$count مالكًا موثّقًا',
      few: '$count ملاك موثّقين',
      two: 'مالكان موثّقان',
      one: 'مالك موثّق واحد',
      zero: 'لا ملاك موثّقين',
    );
    return '$_temp0';
  }

  @override
  String carsViewingTrim(String trim, String market) {
    return 'المعروض: $trim في $market';
  }

  @override
  String carsWheelSize(String size) {
    return 'عجلات $size';
  }

  @override
  String get carsWriteReview => 'اكتب مراجعة';

  @override
  String carsYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count سنة',
      many: '$count سنة',
      few: '$count سنوات',
      two: 'سنتان',
      one: 'سنة واحدة',
      zero: '0 سنة',
    );
    return '$_temp0';
  }

  @override
  String get carsYes => 'نعم';

  @override
  String get chargingAccessRestrictions => 'القيود';

  @override
  String get chargingAccessSection => 'الدخول';

  @override
  String get chargingAccessType => 'نوع الدخول';

  @override
  String get chargingAddressUnknown => 'العنوان غير متوفر';

  @override
  String get chargingAmenities => 'خدمات قريبة';

  @override
  String chargingAreaAround(String place, String radius) {
    return 'حول $place · $radius';
  }

  @override
  String get chargingAreaVisibleMap => 'منطقة الخريطة الظاهرة';

  @override
  String get chargingAttribution => 'الإسناد';

  @override
  String get chargingAvailAvailable => 'منفذ متاح الآن';

  @override
  String chargingAvailCounts(String available, String occupied, String outOfOrder, String unknown) {
    return 'متاح: $available · مشغول: $occupied · معطّل: $outOfOrder · غير معروف: $unknown';
  }

  @override
  String get chargingAvailExpiredExplain => 'انتهت صلاحية آخر قراءة لحظية، لذا لا تُعرض كمتاحة.';

  @override
  String chargingAvailLastReading(String time) {
    return 'آخر قراءة $time — انتهت صلاحيتها، لذا الحالة الحالية غير مؤكدة.';
  }

  @override
  String get chargingAvailNotLiveOffline => 'لا حالة لحظية (بيانات محفوظة)';

  @override
  String chargingAvailObserved(String time) {
    return 'قراءة بتاريخ $time';
  }

  @override
  String get chargingAvailOccupied => 'كل المنافذ مشغولة';

  @override
  String get chargingAvailOutOfOrder => 'معطّلة';

  @override
  String chargingAvailSource(String source) {
    return 'المصدر: $source';
  }

  @override
  String get chargingAvailUncertain => 'غير مؤكدة (انتهت صلاحية القراءة)';

  @override
  String get chargingAvailUnknown => 'التوافر غير معروف';

  @override
  String chargingAvailValidUntil(String time) {
    return 'صالحة حتى $time';
  }

  @override
  String get chargingCheckInCar => 'سيارتك';

  @override
  String get chargingCheckInComment => 'تعليق';

  @override
  String get chargingCheckInConnector => 'المنفذ المستخدم';

  @override
  String get chargingCheckInHowWasIt => 'كيف سارت الأمور؟';

  @override
  String get chargingCheckInIntro => 'شارك كيف سار الشحن. تظهر مشاركتك بتاريخها كبيانات مجتمعية وليست حالة لحظية.';

  @override
  String get chargingCheckInNoCar => 'بدون سيارة';

  @override
  String get chargingCheckInPending => 'شكرًا! سيظهر تعليقك بعد المراجعة.';

  @override
  String get chargingCheckInPower => 'القدرة التي لاحظتها';

  @override
  String get chargingCheckInPublicNote => 'تظهر زيارتك دون اسمك. التعليقات التي تحتوي على روابط تُراجع أولًا.';

  @override
  String get chargingCheckInSentMessage => 'شكرًا! تظهر الآن في صفحة المحطة بتاريخ اليوم.';

  @override
  String get chargingCheckInSentTitle => 'تم حفظ الزيارة';

  @override
  String get chargingCheckInShort => 'تسجيل زيارة';

  @override
  String get chargingCheckInSignIn => 'سجّل الدخول لتسجيل زيارة حتى يثق الآخرون ببيانات المجتمع.';

  @override
  String get chargingCheckInTitle => 'تسجيل زيارة';

  @override
  String get chargingCheckInWait => 'مدة الانتظار';

  @override
  String get chargingCheckins30d => 'زيارات (30 يومًا)';

  @override
  String get chargingChoosePlace => 'اختر مكانًا';

  @override
  String get chargingCityListNote => 'تحدد المدن مركز البحث فقط. أما المحطات الموجودة فتأتي من قاعدة بيانات المحطات.';

  @override
  String get chargingCitySearchHint => 'ابحث عن مدينة';

  @override
  String get chargingClearFilters => 'مسح الفلاتر';

  @override
  String get chargingClosedNow => 'مغلقة الآن';

  @override
  String chargingClosesAt(String time) {
    return 'تغلق الساعة $time (بتوقيت المحطة)';
  }

  @override
  String chargingClusterSemantics(int count) {
    return '$count محطة هنا، انقر للتقريب';
  }

  @override
  String get chargingCommunityDisclaimer => 'تسجيلات الزيارة والبلاغات بيانات مجتمعية مؤرخة، وليست حالة لحظية رسمية.';

  @override
  String get chargingCommunityEmpty => 'لا توجد زيارات أو بلاغات بعد. أخبر الآخرين كيف كانت زيارتك.';

  @override
  String get chargingCommunitySection => 'بلاغات وتسجيلات المجتمع';

  @override
  String chargingCompatBestPower(String power) {
    return 'حتى $power مع سيارتك';
  }

  @override
  String chargingCompatIgnored(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'لم يُستخدم $count سجلًا غير موثّق.',
      few: 'لم تُستخدم $count سجلات غير موثّقة.',
      two: 'لم يُستخدم سجلان غير موثّقين.',
      one: 'لم يُستخدم سجل مدخل واحد غير موثّق.',
    );
    return '$_temp0';
  }

  @override
  String get chargingCompatNoAdapters => 'بناءً على تطابق نوع القابس والتيار فقط. لا يُنصح بأي محوّل.';

  @override
  String get chargingCompatNoGuess => 'تُعرض المحطة دون تخمين للتوافق.';

  @override
  String chargingCompatNone(String car) {
    return 'لا يطابق أي منفذ هنا مداخل الشحن الموثّقة لـ $car.';
  }

  @override
  String chargingCompatNotice(String car) {
    return 'تُعرض المنافذ المتوافقة مع $car بناءً على بيانات المداخل الموثّقة فقط.';
  }

  @override
  String get chargingCompatSection => 'التوافق مع سيارتك';

  @override
  String chargingCompatSome(String car, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count منفذًا يطابق $car.',
      few: '$count منافذ تطابق $car.',
      two: 'منفذان يطابقان $car.',
      one: 'منفذ واحد يطابق $car.',
    );
    return '$_temp0';
  }

  @override
  String get chargingCompatUnknownShort => 'لا توجد بيانات شحن موثقة لهذه السيارة';

  @override
  String get chargingCompatUnknownTitle => 'تعذر التحقق من التوافق';

  @override
  String chargingCompatibleConnectors(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count منفذًا متوافقًا',
      few: '$count منافذ متوافقة',
      two: 'منفذان متوافقان',
      one: 'منفذ متوافق واحد',
    );
    return '$_temp0';
  }

  @override
  String get chargingConnectorCompatible => 'متوافق';

  @override
  String chargingConnectorCompatibleUpTo(String power) {
    return 'متوافق حتى $power';
  }

  @override
  String get chargingConnectorNotCompatible => 'غير متوافق';

  @override
  String get chargingConnectorType => 'نوع المنفذ';

  @override
  String get chargingConnectorsSection => 'الشواحن والمنافذ';

  @override
  String get chargingContactSection => 'التواصل';

  @override
  String get chargingCurrentAc => 'AC (متردد)';

  @override
  String get chargingCurrentDc => 'DC (مستمر)';

  @override
  String get chargingCurrentTypes => 'التيار';

  @override
  String get chargingDataSource => 'المصدر';

  @override
  String get chargingDayClosed => 'مغلقة';

  @override
  String get chargingDayFri => 'الجمعة';

  @override
  String get chargingDayMon => 'الاثنين';

  @override
  String get chargingDaySat => 'السبت';

  @override
  String get chargingDaySun => 'الأحد';

  @override
  String get chargingDayThu => 'الخميس';

  @override
  String get chargingDayTue => 'الثلاثاء';

  @override
  String get chargingDayUnknown => 'غير معروف';

  @override
  String get chargingDayWed => 'الأربعاء';

  @override
  String get chargingDefaultPlaceHint => 'يُعرض المدينة الافتراضية لبلدك. استخدم موقعك أو اختر مكانًا آخر.';

  @override
  String get chargingDemoNoDirections => 'هذه محطة تجريبية وليست مكانًا حقيقيًا.';

  @override
  String get chargingDemoNotRealPlace => 'محطة تجريبية للاختبار — ليست مكانًا حقيقيًا. لا تتوجه إليها.';

  @override
  String get chargingDirections => 'الاتجاهات';

  @override
  String get chargingDirectionsNote => 'يفتح تطبيق ملاحة بإحداثيات المحطة. تحقق من الدخول ومواعيد العمل قبل التوجه.';

  @override
  String get chargingDistance => 'المسافة';

  @override
  String chargingDistanceAway(String distance) {
    return 'على بعد $distance';
  }

  @override
  String chargingDistanceMeters(String meters) {
    return '$meters م';
  }

  @override
  String get chargingEmail => 'البريد الإلكتروني';

  @override
  String get chargingEmptyFilteredMessage =>
      'لا توجد محطة تطابق هذه الفلاتر هنا. جرّب إزالة بعض الفلاتر أو البحث في منطقة أوسع.';

  @override
  String get chargingEmptyMessage =>
      'لم تُعثر على محطات منشورة في هذه المنطقة. التغطية غير مكتملة في أي بلد — يمكنك اقتراح محطة تعرفها.';

  @override
  String get chargingEmptyTitle => 'لا توجد محطات هنا';

  @override
  String chargingEndOfResults(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count محطة إجمالًا',
      few: '$count محطات إجمالًا',
      two: 'محطتان إجمالًا',
      one: 'محطة واحدة إجمالًا',
      zero: 'لا محطات',
    );
    return '$_temp0';
  }

  @override
  String get chargingEntrance => 'المدخل';

  @override
  String chargingFetchedAt(String time) {
    return 'حُمّلت $time';
  }

  @override
  String get chargingFilterAmenities => 'خدمات قريبة';

  @override
  String get chargingFilterAmenitiesHelp => 'يجب أن تتوفر كل الخدمات المختارة.';

  @override
  String get chargingFilterAny => 'الكل';

  @override
  String get chargingFilterAvailability => 'المواعيد والدخول';

  @override
  String get chargingFilterConnectors => 'أنواع المنافذ';

  @override
  String get chargingFilterConnectorsHelp => 'يجب أن يطابق منفذ واحد النوع والتيار والقدرة معًا.';

  @override
  String get chargingFilterCurrent => 'نوع التيار';

  @override
  String get chargingFilterMetaUnavailable => 'قائمة المنافذ غير متاحة حاليًا.';

  @override
  String get chargingFilterMinPower => 'أدنى قدرة';

  @override
  String get chargingFilterMinPowerHelp => 'لا تُحتسب المنافذ مجهولة القدرة.';

  @override
  String get chargingFilterOpenNow => 'مفتوحة الآن';

  @override
  String get chargingFilterOpenNowHelp => 'حسب مواعيد العمل المنشورة. تُخفى المحطات مجهولة المواعيد.';

  @override
  String get chargingFilterOperator => 'المشغّل';

  @override
  String get chargingFilterOperatorHelp => 'من المحطات المحمّلة في هذه المنطقة.';

  @override
  String chargingFilterPowerAtLeast(String power) {
    return '$power+';
  }

  @override
  String get chargingFilterPublicOnly => 'الدخول العام فقط';

  @override
  String get chargingFilterVehicle => 'متوافقة مع سيارتي';

  @override
  String get chargingFilterVehicleAddCar => 'أضف سيارة إلى جراجي';

  @override
  String get chargingFilterVehicleHelp =>
      'يستخدم بيانات مداخل الشحن الموثّقة لسيارتك في سوقها. لا يُعدّ تطابق شكل القابس وحده توافقًا، ولا تُفترض محوّلات.';

  @override
  String get chargingFilterVehicleNone => 'أي سيارة';

  @override
  String get chargingFilterVehicleNotInMarket => 'غير مدرجة في سوق هذه السيارة — قد يكون التوافق غير معروف';

  @override
  String get chargingFilterVehicleSignIn => 'سجّل الدخول لاستخدام سيارة من جراجك';

  @override
  String get chargingFiltersTitle => 'فلاتر المحطات';

  @override
  String chargingFloor(String floor) {
    return 'الطابق $floor';
  }

  @override
  String get chargingFormatCable => 'كابل مثبت';

  @override
  String get chargingFormatSocket => 'مقبس (أحضر الكابل)';

  @override
  String chargingGraceMinutes(String minutes) {
    return 'بعد مهلة $minutes دقيقة';
  }

  @override
  String chargingHoursAsPublished(String text) {
    return 'كما نشرها المصدر: $text';
  }

  @override
  String get chargingHoursNotPublished => 'مواعيد العمل غير منشورة.';

  @override
  String get chargingHoursSection => 'مواعيد العمل';

  @override
  String get chargingHoursTextOnly => 'المواعيد منشورة كنص فقط — انظر أدناه.';

  @override
  String chargingHoursTimezoneNote(String zone) {
    return 'الأوقات بتوقيت المحطة ($zone).';
  }

  @override
  String get chargingHoursUnknown => 'المواعيد غير معروفة';

  @override
  String get chargingInvalidPower => 'أدخل قدرة بين 0 و1000 كيلوواط.';

  @override
  String get chargingInvalidWait => 'أدخل دقائق بين 0 و1440.';

  @override
  String get chargingLastSynced => 'آخر مزامنة';

  @override
  String get chargingLastVerified => 'آخر تحقق';

  @override
  String get chargingLatitude => 'خط العرض';

  @override
  String get chargingLicense => 'الترخيص';

  @override
  String get chargingLocationDenied => 'لم يُمنح إذن الموقع. يمكنك اختيار مكان بدلًا من ذلك.';

  @override
  String get chargingLocationDeniedForever =>
      'الوصول إلى الموقع متوقف لهذا التطبيق. فعّله من الإعدادات، أو اختر مدينة أو نقطة بدلًا من ذلك.';

  @override
  String get chargingLocationPrivacy => 'يُطلب الآن فقط، ويُستخدم أثناء استخدام التطبيق، ولا يُحفظ أبدًا.';

  @override
  String get chargingLocationServiceOff =>
      'خدمات الموقع متوقفة على هذا الجهاز. فعّلها، أو اختر مدينة أو نقطة بدلًا من ذلك.';

  @override
  String get chargingLocationTitle => 'اختر مكانًا';

  @override
  String get chargingLocationUnavailable => 'تعذر تحديد موقعك. اختر مكانًا بدلًا من ذلك.';

  @override
  String get chargingLogsEditTitle => 'تعديل جلسة الشحن';

  @override
  String get chargingLogsNewTitle => 'جلسة شحن جديدة';

  @override
  String get chargingLogsReportsTitle => 'الإنفاق والاستهلاك';

  @override
  String get chargingLogsTitle => 'سجل الشحن';

  @override
  String get chargingLongitude => 'خط الطول';

  @override
  String get chargingMapNotConfigured => 'لم تُهيأ الخريطة بعد، لذا تُعرض المحطات كقائمة.';

  @override
  String chargingMapSemantics(int count) {
    return 'خريطة محطات الشحن، $count محطة';
  }

  @override
  String get chargingMaxPower => 'أقصى قدرة';

  @override
  String get chargingMergedMessage => 'كانت مكررة لمحطة أخرى وأصبحت تفاصيلها هناك.';

  @override
  String get chargingMergedTitle => 'تم دمج هذه المحطة';

  @override
  String get chargingMinutesUnit => 'دقيقة';

  @override
  String get chargingNavApple => 'خرائط Apple';

  @override
  String get chargingNavFailed => 'لم يتمكن أي تطبيق من فتح الاتجاهات.';

  @override
  String get chargingNavGoogle => 'خرائط Google';

  @override
  String get chargingNavSystem => 'اختر تطبيق ملاحة';

  @override
  String get chargingNavWaze => 'Waze';

  @override
  String get chargingNavWeb => 'افتح في خريطة الويب';

  @override
  String get chargingNearMe => 'بالقرب مني';

  @override
  String get chargingNoCityMatch => 'لا توجد مدينة مطابقة';

  @override
  String get chargingNoConnectorData => 'لا تتوفر بيانات عن المنافذ.';

  @override
  String get chargingNoLiveProvider =>
      'يُعرض التوافر اللحظي فقط من مصدر لحظي مرتبط. لا يوجد مصدر مرتبط حاليًا، لذا يظهر غير معروف.';

  @override
  String get chargingNoLiveSourceForStation =>
      'لا يوجد مصدر بيانات لحظية مرتبط بهذه المحطة، لذا التوافر غير معروف. تسجيلات الزيارة أدناه ليست لحظية.';

  @override
  String get chargingNoStationsHere => 'لم يُعثر على محطات في هذه المنطقة';

  @override
  String get chargingNoneStated => 'لم يذكر المصدر أي قيود';

  @override
  String get chargingNotCompatible => 'لا يوجد منفذ متوافق';

  @override
  String get chargingNotSure => 'لست متأكدًا';

  @override
  String chargingObservedPower(String power) {
    return '$power مُلاحظة';
  }

  @override
  String get chargingOfflineNoLive => 'هذه بيانات محفوظة، ولا تُعرض الحالة اللحظية من بيانات محفوظة أبدًا.';

  @override
  String get chargingOpOperational => 'تعمل';

  @override
  String get chargingOpPermanentlyClosed => 'مغلقة نهائيًا';

  @override
  String get chargingOpPlanned => 'مخطط لها';

  @override
  String get chargingOpTemporarilyUnavailable => 'متوقفة مؤقتًا';

  @override
  String get chargingOpUnknown => 'حالة التشغيل غير معروفة';

  @override
  String get chargingOpen24h => 'مفتوحة 24 ساعة';

  @override
  String get chargingOpenMerged => 'افتح المحطة';

  @override
  String get chargingOpenNow => 'مفتوحة الآن';

  @override
  String get chargingOpenNowFromSaved => 'محسوبة على هذا الجهاز من مواعيد العمل المحفوظة.';

  @override
  String get chargingOpenReports => 'بلاغات مفتوحة';

  @override
  String get chargingOpenSource => 'افتح المصدر';

  @override
  String chargingOpensAt(String time) {
    return 'تفتح $time (بتوقيت المحطة)';
  }

  @override
  String get chargingOptional => 'اختياري';

  @override
  String get chargingParking => 'الوقوف';

  @override
  String get chargingPaymentMethods => 'الدفع';

  @override
  String chargingPhases(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count أطوار', one: 'أحادي الطور');
    return '$_temp0';
  }

  @override
  String get chargingPhone => 'الهاتف';

  @override
  String get chargingPhoto => 'صورة المحطة';

  @override
  String chargingPickPointHint(String lat, String lng) {
    return 'الدبوس عند $lat، $lng. حرّك الخريطة للتعديل.';
  }

  @override
  String get chargingPickPointSubtitle => 'حرّك الخريطة لوضع الدبوس ثم ابحث حوله.';

  @override
  String get chargingPickPointTitle => 'اختر نقطة على الخريطة';

  @override
  String chargingPlaceDefaultCity(String city) {
    return '$city (افتراضي)';
  }

  @override
  String get chargingPlaceMapPoint => 'النقطة المختارة';

  @override
  String get chargingPlaceMarker => 'نقطة البحث المختارة';

  @override
  String get chargingPlaceNearYou => 'بالقرب منك';

  @override
  String chargingPlugCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count منفذًا',
      few: '$count منافذ',
      two: 'منفذان',
      one: 'منفذ واحد',
    );
    return '$_temp0';
  }

  @override
  String get chargingPlugsNotCars => 'عدد المنافذ لا يساوي عدد السيارات التي يمكن شحنها في الوقت نفسه.';

  @override
  String chargingPointCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count شاحنًا',
      few: '$count شواحن',
      two: 'شاحنان',
      one: 'شاحن واحد',
    );
    return '$_temp0';
  }

  @override
  String get chargingPointCountUnknown => 'عدد الشواحن غير متوفر';

  @override
  String get chargingPointUnnamed => 'شاحن';

  @override
  String chargingPowerRange(String min, String max) {
    return '$min–$max';
  }

  @override
  String get chargingPowerUnknown => 'القدرة غير متوفرة';

  @override
  String get chargingPriceNotAvailable => 'الأسعار غير متوفرة لهذه المحطة.';

  @override
  String get chargingPricesSection => 'الأسعار';

  @override
  String chargingQuantity(int count) {
    return '×$count';
  }

  @override
  String get chargingQuickDc => 'شحن سريع DC';

  @override
  String get chargingQuickMyCar => 'يناسب سيارتي';

  @override
  String chargingQuickMyCarNamed(String name) {
    return 'يناسب $name';
  }

  @override
  String get chargingRecentCheckins => 'أحدث تسجيلات الزيارة';

  @override
  String get chargingRecentReports => 'البلاغات (آخر 90 يومًا)';

  @override
  String get chargingRemove => 'إزالة';

  @override
  String get chargingRemoveCarFilter => 'إزالة فلتر السيارة';

  @override
  String get chargingReportDetails => 'التفاصيل';

  @override
  String get chargingReportDetailsHint => 'ماذا رأيت؟ ومتى؟';

  @override
  String get chargingReportDetailsRequired => 'يُرجى وصف المشكلة.';

  @override
  String get chargingReportIntro => 'أخبرنا بما هو خطأ. يراجع المشرفون كل بلاغ، ولا يغيّر المحطة بمفرده.';

  @override
  String get chargingReportModeration => 'تظهر البلاغات في صفحة المحطة دون اسمك (النوع والحالة والتاريخ فقط).';

  @override
  String get chargingReportNewPrice => 'السعر الذي رأيته';

  @override
  String get chargingReportNewPriceHint => 'مثال: سعر الكيلوواط ساعة كما يظهر على الشاحن';

  @override
  String get chargingReportSeenConnector => 'المنفذ الموجود في الموقع';

  @override
  String get chargingReportSentMessage => 'سيراجعه المشرفون. يمكنك متابعته ضمن بلاغاتك.';

  @override
  String get chargingReportSentTitle => 'شكرًا على بلاغك';

  @override
  String get chargingReportShort => 'إبلاغ';

  @override
  String get chargingReportSignIn => 'سجّل الدخول للإبلاغ عن مشكلة حتى يراجعها المشرفون ونمنع الإساءة.';

  @override
  String get chargingReportStatusInReview => 'قيد المراجعة';

  @override
  String get chargingReportStatusOpen => 'مفتوح';

  @override
  String get chargingReportStatusRejected => 'مرفوض';

  @override
  String get chargingReportStatusResolved => 'تم الحل';

  @override
  String get chargingReportTitle => 'الإبلاغ عن مشكلة';

  @override
  String get chargingReportWhat => 'ما المشكلة؟';

  @override
  String get chargingReportWhichConnector => 'أي منفذ؟';

  @override
  String chargingResultsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count محطة',
      few: '$count محطات',
      two: 'محطتان',
      one: 'محطة واحدة',
      zero: 'لا محطات',
    );
    return '$_temp0';
  }

  @override
  String chargingResultsTruncated(int count) {
    return 'تُعرض $count محطة — قرّب الخريطة لرؤية الكل';
  }

  @override
  String get chargingSavedCopy => 'محفوظة';

  @override
  String get chargingSearchHereAction => 'ابحث هنا';

  @override
  String get chargingSearchHereMessage => 'ستُعرض المحطات حول النقطة التي اخترتها مع المسافات منها.';

  @override
  String get chargingSearchHereTitle => 'البحث حول هذه النقطة؟';

  @override
  String get chargingSearchHint => 'ابحث عن محطة أو مشغل أو مدينة';

  @override
  String get chargingSearchThisArea => 'ابحث في هذه المنطقة';

  @override
  String get chargingSearching => 'جارٍ البحث عن المحطات…';

  @override
  String get chargingSend => 'إرسال';

  @override
  String get chargingServicesSection => 'الدفع والخدمات';

  @override
  String get chargingSignInAgain => 'انتهت جلستك. سجّل الدخول مجددًا للإرسال.';

  @override
  String get chargingSourceCsv => 'ملف مستورد';

  @override
  String get chargingSourceManual => 'أضافها فريق التحرير';

  @override
  String get chargingSourceOcm => 'Open Charge Map';

  @override
  String get chargingSourcePartner => 'بيانات شريك';

  @override
  String get chargingSourceSection => 'مصدر البيانات والترخيص';

  @override
  String get chargingSourceUpdated => 'التحديث لدى المصدر';

  @override
  String get chargingSourceUserSuggestion => 'اقتراح مستخدم بعد المراجعة';

  @override
  String get chargingStartMethods => 'طريقة بدء الشحن';

  @override
  String chargingStationTimezone(String zone) {
    return 'المنطقة الزمنية للمحطة: $zone';
  }

  @override
  String get chargingStationTitle => 'تفاصيل المحطة';

  @override
  String get chargingStatusLive => 'التوافر اللحظي';

  @override
  String get chargingStatusOpenNow => 'مواعيد العمل الآن';

  @override
  String get chargingStatusOperational => 'التشغيل';

  @override
  String get chargingStatusSection => 'الحالة الآن';

  @override
  String chargingStepSize(String step) {
    return 'تُحتسب بخطوات $step';
  }

  @override
  String get chargingSuccessRate => 'نجاح الشحن';

  @override
  String get chargingSuccessRateNeedsMore => 'تظهر نسبة النجاح بعد 3 تسجيلات زيارة على الأقل.';

  @override
  String get chargingSuggestAddConnector => 'أضف منفذًا';

  @override
  String get chargingSuggestAddress => 'العنوان أو معلم قريب';

  @override
  String get chargingSuggestCity => 'المدينة';

  @override
  String chargingSuggestConnectorN(int number) {
    return 'المنفذ $number';
  }

  @override
  String get chargingSuggestConnectorTypeRequired => 'اختر نوعًا أو احذف هذا المنفذ.';

  @override
  String get chargingSuggestConnectors => 'المنافذ';

  @override
  String get chargingSuggestCoordInvalid => 'خارج النطاق';

  @override
  String get chargingSuggestCoordRequired => 'مطلوب';

  @override
  String get chargingSuggestCountry => 'الدولة';

  @override
  String get chargingSuggestHours => 'مواعيد العمل';

  @override
  String get chargingSuggestHoursHint => 'مثال: يوميًا 08:00–22:00';

  @override
  String get chargingSuggestIntro => 'تعرف محطة غير موجودة؟ أضف ما تعرفه — يتحقق منها مشرف قبل ظهورها على الخريطة.';

  @override
  String get chargingSuggestLocation => 'موقع المحطة';

  @override
  String get chargingSuggestLocationHelp =>
      'استخدم موقعك أثناء وجودك في المحطة، أو اخترها على الخريطة، أو اكتب الإحداثيات.';

  @override
  String get chargingSuggestMayExist => 'قد تكون هذه المحطات القريبة هي نفسها:';

  @override
  String get chargingSuggestName => 'اسم المحطة';

  @override
  String get chargingSuggestNameRequired => 'أدخل اسم المحطة.';

  @override
  String get chargingSuggestNotes => 'ملاحظات للمراجع';

  @override
  String get chargingSuggestOperator => 'المشغّل';

  @override
  String get chargingSuggestPickTitle => 'اختر على الخريطة';

  @override
  String get chargingSuggestQuantity => 'العدد';

  @override
  String get chargingSuggestReviewNote => 'لا يُنشر شيء قبل مراجعة المشرف.';

  @override
  String get chargingSuggestSentMessage => 'شكرًا! سيراجعه مشرف قبل ظهوره على الخريطة.';

  @override
  String get chargingSuggestSentTitle => 'تم إرسال الاقتراح';

  @override
  String get chargingSuggestSignIn => 'سجّل الدخول لاقتراح محطة. تُراجع الاقتراحات قبل ظهورها.';

  @override
  String get chargingSuggestTitle => 'اقترح محطة';

  @override
  String get chargingSuggestUseMyLocation => 'أنا في المحطة';

  @override
  String get chargingSuggestUsePoint => 'استخدم هذه النقطة';

  @override
  String chargingTariffAppliesTo(String connector) {
    return 'تنطبق على: $connector';
  }

  @override
  String get chargingTariffNotCurrent => 'غير سارية';

  @override
  String get chargingTariffUnnamed => 'التعرفة';

  @override
  String get chargingTaxExcluded => 'غير شاملة الضرائب';

  @override
  String chargingTaxExcludedPct(String percent) {
    return 'غير شاملة الضرائب ($percent٪)';
  }

  @override
  String get chargingTaxIncluded => 'شاملة الضرائب';

  @override
  String chargingTaxIncludedPct(String percent) {
    return 'شاملة الضرائب ($percent٪)';
  }

  @override
  String get chargingTaxUnknown => 'الضرائب: غير مذكورة';

  @override
  String get chargingTitle => 'محطات الشحن';

  @override
  String get chargingToday => 'اليوم';

  @override
  String get chargingTruncatedHint => 'محطات كثيرة تطابق هنا. قرّب الخريطة أو أضف فلاتر لرؤيتها كلها.';

  @override
  String get chargingUnassignedConnectors => 'المنافذ';

  @override
  String get chargingUnassignedConnectorsHelp => 'لا يحدد المصدر الشاحن الذي ينتمي إليه كل منفذ.';

  @override
  String get chargingUsageCostNote => 'معروض كما نُشر؛ غير موثّق ولا محوّل.';

  @override
  String get chargingUsageCostTitle => 'السعر كما نشره المصدر';

  @override
  String get chargingUseMyLocation => 'استخدم موقعي';

  @override
  String chargingValidFrom(String date) {
    return 'من $date';
  }

  @override
  String chargingValidTo(String date) {
    return 'حتى $date';
  }

  @override
  String get chargingViewList => 'القائمة';

  @override
  String get chargingViewMap => 'الخريطة';

  @override
  String chargingWaited(String time) {
    return 'انتظار $time';
  }

  @override
  String get chargingWebsite => 'الموقع الإلكتروني';

  @override
  String get chargingWholeStation => 'المحطة كلها';

  @override
  String get chargingWidenSearch => 'ابحث ضمن 100 كم';

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
    return 'تم اختيار $count من $max';
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
  String get communityAskTitle => 'اطرح سؤالًا';

  @override
  String get communityCarReviewsTitle => 'تقييمات الملاك';

  @override
  String get communityCommentsTitle => 'التعليقات';

  @override
  String get communityQuestionTitle => 'سؤال';

  @override
  String get communityQuestionsTitle => 'أسئلة وأجوبة';

  @override
  String get communityWriteReviewTitle => 'اكتب تقييمًا';

  @override
  String compareAboutRow(String label) {
    return 'عن «$label»';
  }

  @override
  String compareAddCarCount(int count, int max) {
    return 'أضف سيارة ($count من $max)';
  }

  @override
  String get compareAddCarHint => 'العلامة والطراز والسنة والفئة والسوق';

  @override
  String compareAddCarSlot(int number) {
    return 'أضف السيارة $number';
  }

  @override
  String get compareAlreadySaved => 'هذه المقارنة محفوظة في حسابك بالفعل';

  @override
  String compareAlternativesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '+ $count قيمة أخرى',
      many: '+ $count قيمة أخرى',
      few: '+ $count قيم أخرى',
      two: '+ قيمتان أخريان',
      one: '+ قيمة أخرى',
    );
    return '$_temp0';
  }

  @override
  String get compareAlternativesExplainer =>
      'تُعرض القيم على دورات أو نطاقات شحن أو مقاسات جنوط أخرى للاطلاع فقط ولا تُخلط بالمقارنة.';

  @override
  String get compareAvailabilityAvailable => 'متاحة';

  @override
  String get compareAvailabilityComingSoon => 'قريبًا';

  @override
  String get compareAvailabilityDiscontinued => 'متوقفة';

  @override
  String get compareAvailabilityUnknown => 'التوفر غير متوفر';

  @override
  String get compareBest => 'الأفضل';

  @override
  String get compareBestInRow => 'الأفضل في هذا الصف';

  @override
  String get compareBodyCoupe => 'كوبيه';

  @override
  String get compareBodyCrossover => 'كروس أوفر';

  @override
  String get compareBodyHatchback => 'هاتشباك';

  @override
  String get compareBodyMpv => 'عائلية MPV';

  @override
  String get compareBodyPickup => 'بيك أب';

  @override
  String get compareBodySedan => 'سيدان';

  @override
  String get compareBodySuv => 'SUV رياضية متعددة الاستخدامات';

  @override
  String get compareBodyVan => 'فان';

  @override
  String get compareBodyWagon => 'ستيشن واجن';

  @override
  String compareCarActions(String car) {
    return 'خيارات $car';
  }

  @override
  String compareCarNumbered(int number, String car) {
    return 'السيارة $number: $car';
  }

  @override
  String get compareChangeCar => 'تغيير الفئة أو السنة أو السوق';

  @override
  String compareChargerPower(String power) {
    return 'شاحن $power';
  }

  @override
  String compareComparedOn(String basis) {
    return 'المقارنة على أساس: $basis';
  }

  @override
  String get compareConvertedEstimate => 'تقديري بعد التحويل';

  @override
  String compareCopiedToTray(String count) {
    return 'نُسخت $count سيارات إلى المقارنات';
  }

  @override
  String get compareCurrentAc => 'تيار متردد AC';

  @override
  String get compareCurrentDc => 'تيار مستمر DC';

  @override
  String compareDecidedRows(String decided, String total) {
    return 'صفوف لها أفضل: $decided من $total';
  }

  @override
  String get compareDeleteSaved => 'حذف';

  @override
  String compareDeleteSavedMessage(String title) {
    return 'ستُحذف «$title» من حسابك وستتوقف الروابط التي شاركتها.';
  }

  @override
  String get compareDeleteSavedTitle => 'حذف هذه المقارنة؟';

  @override
  String get compareDeleted => 'حُذفت المقارنة';

  @override
  String get compareDerived => 'محسوبة من قيمة منشورة أخرى';

  @override
  String get compareDetailsAlternatives => 'قيم منشورة أخرى';

  @override
  String get compareDetailsBasis => 'أساس القياس';

  @override
  String get compareDetailsCar => 'السيارة';

  @override
  String get compareDetailsConditions => 'ظروف الاختبار';

  @override
  String get compareDetailsDerivation => 'طريقة الحصول عليها';

  @override
  String get compareDetailsDocumentDate => 'تاريخ الوثيقة';

  @override
  String get compareDetailsNote => 'ملاحظة';

  @override
  String get compareDetailsPublished => 'القيمة المنشورة';

  @override
  String get compareDetailsValue => 'القيمة';

  @override
  String get compareDifferencesOnly => 'الاختلافات فقط';

  @override
  String get compareDifferencesOnlyHint => 'إخفاء الصفوف التي تتساوى فيها كل السيارات';

  @override
  String get compareDirectionHigher => 'الأعلى أفضل';

  @override
  String get compareDirectionLower => 'الأقل أفضل';

  @override
  String get compareDirectionNone => 'لا توجد قيمة «أفضل» — حسب احتياجك';

  @override
  String get compareDisclosureFallback =>
      'تُحسب النتائج من بيانات الدليل فقط، ولا تغيّرها الإعلانات أو الرعايات أبدًا.';

  @override
  String compareEditCars(int count) {
    return 'السيارات ($count)';
  }

  @override
  String get compareEditCarsTitle => 'السيارات في هذه المقارنة';

  @override
  String get compareEditInCompare => 'تعديل في المقارنات';

  @override
  String get compareFactorAc => 'الشحن المتردد AC';

  @override
  String get compareFactorDc => 'الشحن السريع DC';

  @override
  String get compareFactorEfficiency => 'كفاءة الطاقة';

  @override
  String get compareFactorPerformance => 'التسارع';

  @override
  String get compareFactorPrice => 'السعر';

  @override
  String get compareFactorRange => 'المدى الكهربائي';

  @override
  String get compareFactorSpace => 'مساحة الصندوق';

  @override
  String compareFavoriteSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count سيارة',
      many: '$count سيارة',
      few: '$count سيارات',
      two: 'سيارتان',
      one: 'سيارة واحدة',
    );
    return '$_temp0';
  }

  @override
  String get compareFeaturedTitle => 'مقارنات مختارة';

  @override
  String compareGeneratedAt(String time) {
    return 'حُسبت في $time';
  }

  @override
  String get compareGoToCompare => 'ابدأ مقارنة جديدة';

  @override
  String get compareHeaderSpec => 'المواصفة';

  @override
  String get compareIntroMessage =>
      'اختر كل سيارة بسنة الطراز والفئة والسوق. لا تُقارن الأرقام إلا إذا قيست بالطريقة نفسها.';

  @override
  String get compareIntroRuleCycles =>
      'يُقارن المدى على دورة الاختبار نفسها فقط (WLTP أو EPA أو CLTC أو NEDC) دون أي تحويل.';

  @override
  String get compareIntroRuleMandatory => 'السنة والفئة والسوق إلزامية لكل سيارة.';

  @override
  String get compareIntroRuleMissing => 'تظهر القيمة الناقصة «غير متوفر»، ولا تُحسب صفرًا أو فوزًا أبدًا.';

  @override
  String get compareIntroTitle => 'قارن من سيارتين إلى أربع سيارات جنبًا إلى جنب';

  @override
  String get compareKindCurated => 'مختارة من المحررين';

  @override
  String get compareKindMine => 'محفوظة في حسابك';

  @override
  String get compareKindSaved => 'مقارنة محفوظة';

  @override
  String get compareKindShared => 'رابط مشترك';

  @override
  String get compareLegendBest => 'تظهر فقط عندما تتوفر كل القيم وتُقاس بالطريقة نفسها.';

  @override
  String get compareLegendButton => 'ماذا تعني العلامات؟';

  @override
  String get compareLegendTitle => 'كيف تتم المقارنة';

  @override
  String get compareLoading => 'جارٍ تحميل المقارنة…';

  @override
  String compareMissingRows(String count) {
    return 'بيانات ناقصة: $count';
  }

  @override
  String get compareModeChargeDepleting => 'استنزاف الشحن';

  @override
  String get compareModeChargeSustaining => 'الحفاظ على الشحن';

  @override
  String get compareModeCity => 'داخل المدينة';

  @override
  String get compareModeCombined => 'مختلط';

  @override
  String get compareModeHighway => 'طريق سريع';

  @override
  String get compareModeWeighted => 'مرجّح';

  @override
  String get compareMoveDown => 'تحريك لأسفل';

  @override
  String get compareMoveUp => 'تحريك لأعلى';

  @override
  String get compareNo => 'لا';

  @override
  String get compareNoDifferencesMessage => 'تتساوى هذه السيارات في هذا العرض. أوقف «الاختلافات فقط» لرؤية كل الصفوف.';

  @override
  String get compareNoRowsMessage => 'لا توجد بيانات لهذا العرض بعد.';

  @override
  String get compareNoRowsTitle => 'لا توجد صفوف لعرضها';

  @override
  String get compareNotApplicable => 'لا ينطبق';

  @override
  String compareNotComparableRows(String count) {
    return 'غير قابلة للمقارنة: $count';
  }

  @override
  String get compareOpenCar => 'فتح صفحة السيارة';

  @override
  String get compareOpenSource => 'فتح المصدر';

  @override
  String compareOriginalValue(String value) {
    return 'منشورة بقيمة $value';
  }

  @override
  String get compareOutcomeTie => 'متساوية — لا فائز';

  @override
  String comparePickerAdded(String car) {
    return 'أُضيفت $car إلى المقارنة';
  }

  @override
  String get comparePickerAllMarkets => 'تضمين فئات من أسواق أخرى';

  @override
  String get comparePickerAllMarketsHint => 'مفيد لمقارنة السيارة نفسها بين الدول. تبقى الأسعار بعملة كل سوق.';

  @override
  String get comparePickerAlreadyIn => 'هذه الفئة وهذا السوق موجودان في المقارنة بالفعل';

  @override
  String get comparePickerBack => 'رجوع';

  @override
  String get comparePickerBrowseMarket => 'تصفح السيارات المباعة في';

  @override
  String get comparePickerChooseBrand => 'اختر العلامة التجارية';

  @override
  String get comparePickerChooseMarket => 'اختر السوق';

  @override
  String get comparePickerChooseModel => 'اختر الطراز';

  @override
  String get comparePickerChooseTrim => 'اختر الفئة';

  @override
  String get comparePickerChooseYear => 'اختر سنة الطراز';

  @override
  String comparePickerCurrency(String currency) {
    return 'الأسعار بـ$currency';
  }

  @override
  String get comparePickerEmptyMessage =>
      'لا توجد سيارات منشورة مطابقة في هذا السوق بعد. جرّب تضمين أسواق أخرى أو ارجع.';

  @override
  String get comparePickerEmptyMessageAll => 'لا توجد سيارات منشورة مطابقة بعد. ارجع واختر من جديد.';

  @override
  String get comparePickerEmptyTitle => 'لا توجد خيارات هنا';

  @override
  String get comparePickerMarketHint => 'يؤخذ السعر والتوفر ومنافذ الشحن من هذا السوق.';

  @override
  String get comparePickerNoMatch => 'لا نتائج مطابقة لبحثك';

  @override
  String comparePickerProgress(int step, int total) {
    return 'الخطوة $step من $total';
  }

  @override
  String get comparePickerReplaceTitle => 'تغيير السيارة';

  @override
  String comparePickerReplaced(String car) {
    return 'استُبدلت بـ$car';
  }

  @override
  String get comparePickerSearchBrand => 'ابحث في العلامات';

  @override
  String get comparePickerSearchModel => 'ابحث في الطرازات';

  @override
  String get comparePickerShowAllMarkets => 'تضمين أسواق أخرى';

  @override
  String comparePickerSoldIn(String markets) {
    return 'مدرجة في: $markets';
  }

  @override
  String get comparePickerStepBrand => 'العلامة';

  @override
  String get comparePickerStepCurrent => 'الخطوة الحالية';

  @override
  String get comparePickerStepDone => 'مختار';

  @override
  String get comparePickerStepEditHint => 'تغيير هذا الاختيار';

  @override
  String get comparePickerStepMarket => 'السوق';

  @override
  String get comparePickerStepModel => 'الطراز';

  @override
  String get comparePickerStepTodo => 'لم يُختر بعد';

  @override
  String get comparePickerStepTrim => 'الفئة';

  @override
  String get comparePickerStepYear => 'السنة';

  @override
  String get comparePickerTitle => 'اختر سيارة';

  @override
  String comparePickerTrimCount(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$formatted فئة',
      many: '$formatted فئة',
      few: '$formatted فئات',
      two: 'فئتان',
      one: 'فئة واحدة',
    );
    return '$_temp0';
  }

  @override
  String get compareRecBack => 'السابق';

  @override
  String compareRecBasis(String cycle, String currency) {
    return 'المدى والاستهلاك مقارنان على $cycle؛ الأسعار بـ$currency.';
  }

  @override
  String get compareRecBasisPeak => 'القدرة القصوى';

  @override
  String get compareRecBodyTypes => 'أنواع الهيكل';

  @override
  String get compareRecBodyTypesAny => 'أي نوع هيكل';

  @override
  String compareRecBodyTypesSome(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count نوع مختار',
      many: '$count نوعًا مختارًا',
      few: '$count أنواع مختارة',
      two: 'نوعا هيكل مختاران',
      one: 'نوع هيكل واحد مختار',
    );
    return '$_temp0';
  }

  @override
  String get compareRecBreakdown => 'كيف حُسبت الدرجة';

  @override
  String get compareRecBudgetError => 'أدخل ميزانية أكبر من صفر';

  @override
  String compareRecBudgetHelper(String market, String currency) {
    return 'الأسعار في $market ($currency). لا تُحوَّل الأسعار بعملات أخرى أبدًا.';
  }

  @override
  String compareRecBudgetLabel(String currency) {
    return 'أقصى سعر ($currency)';
  }

  @override
  String get compareRecBudgetMessage => 'نأخذ في الحسبان فقط السيارات التي يقع سعرها المحلي الحالي ضمن ميزانيتك.';

  @override
  String get compareRecBudgetTitle => 'ما ميزانيتك؟';

  @override
  String get compareRecCycleMismatch => 'مقيس على دورة اختبار مختلفة';

  @override
  String get compareRecDailyKm => 'المسافة اليومية';

  @override
  String compareRecDecrease(String label) {
    return 'إنقاص $label';
  }

  @override
  String get compareRecEditAnswers => 'تعديل الإجابات';

  @override
  String compareRecExcludedBody(String count) {
    return 'نوع هيكل آخر: $count';
  }

  @override
  String compareRecExcludedBudget(String count) {
    return 'فوق الميزانية: $count';
  }

  @override
  String compareRecExcludedPowertrain(String count) {
    return 'نوع دفع آخر: $count';
  }

  @override
  String compareRecExcludedSeats(String count) {
    return 'مقاعد أقل من المطلوب: $count';
  }

  @override
  String compareRecExcludedTitle(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$formatted سيارة غير مناسبة',
      many: '$formatted سيارة غير مناسبة',
      few: '$formatted سيارات غير مناسبة',
      two: 'سيارتان غير مناسبتين',
      one: 'سيارة واحدة غير مناسبة',
    );
    return '$_temp0';
  }

  @override
  String get compareRecHomeCharging => 'هل يمكنك الشحن في المنزل أو العمل؟';

  @override
  String get compareRecHomeChargingNo => 'الشحن العام فقط';

  @override
  String get compareRecHomeChargingRequired => 'اختر هل يمكنك الشحن في المنزل';

  @override
  String get compareRecHomeChargingYes => 'يمكنني الشحن في المنزل';

  @override
  String compareRecIgnoreFactor(String factor) {
    return 'رتّب دون «$factor»';
  }

  @override
  String compareRecIncrease(String label) {
    return 'زيادة $label';
  }

  @override
  String get compareRecInvalidTitle => 'بعض الإجابات تحتاج إلى تعديل';

  @override
  String get compareRecLongTrips => 'الرحلات الطويلة شهريًا';

  @override
  String get compareRecLongTripsHint => 'رحلات أطول من شحنة كاملة';

  @override
  String get compareRecMissingTitle => 'البيانات الناقصة';

  @override
  String get compareRecNeedsMessage => 'تُستبعد السيارات غير المناسبة، ونعرض عددها.';

  @override
  String get compareRecNeedsTitle => 'ما الذي تحتاجه؟';

  @override
  String get compareRecNext => 'التالي';

  @override
  String get compareRecNoDecision => 'لا يمكن الحسم';

  @override
  String get compareRecNotRankedComparable => 'بيانات غير قابلة للمقارنة';

  @override
  String get compareRecNotRankedMissing => 'بيانات ناقصة';

  @override
  String get compareRecNotRankedPrice => 'السعر غير متوفر';

  @override
  String get compareRecNotRankedSeats => 'عدد المقاعد غير متوفر';

  @override
  String get compareRecNotRankedSubtitle => 'القيم الناقصة لا تُحسب صفرًا أبدًا';

  @override
  String get compareRecNotRankedTitle => 'تعذّر ترتيبها';

  @override
  String get compareRecNotesTitle => 'معلومات مفيدة';

  @override
  String compareRecPoints(String points) {
    return '$points نقطة';
  }

  @override
  String get compareRecPowertrainRequired => 'اختر نوع دفع واحدًا على الأقل';

  @override
  String get compareRecPowertrains => 'أنواع الدفع';

  @override
  String get compareRecPowertrainsHint => 'اختر نوعًا واحدًا على الأقل';

  @override
  String get compareRecPrioritiesMessage => 'تحدد الأوزان مقدار أهمية كل عامل، وتظهر مع النتائج.';

  @override
  String get compareRecPrioritiesTitle => 'ما الأهم لك؟';

  @override
  String compareRecRank(int rank) {
    return 'الترتيب $rank';
  }

  @override
  String get compareRecRankedTitle => 'السيارات المرتبة';

  @override
  String get compareRecReasonFewer => 'سيارة واحدة فقط لديها بيانات كاملة وقابلة للمقارنة، فلا يوجد ما تُرتَّب أمامه.';

  @override
  String get compareRecReasonNoCandidates =>
      'لا توجد سيارة تطابق ميزانيتك واحتياجاتك. جرّب ميزانية أعلى أو شروطًا أقل.';

  @override
  String get compareRecReasonNoComparable =>
      'السيارات المطابقة تنقصها بيانات أو بياناتها غير قابلة للمقارنة، لذا لن نخمّن.';

  @override
  String get compareRecReasonTooClose => 'نتائج السيارات الأولى متقاربة جدًا بحيث لا يمكن اعتبار إحداها الأفضل.';

  @override
  String get compareRecResultsTitle => 'ترشيحاتك';

  @override
  String compareRecScore(String score) {
    return 'درجة التطابق: $score من 100';
  }

  @override
  String get compareRecScoreUnknown => 'درجة التطابق: غير متوفرة';

  @override
  String get compareRecSeats => 'عدد المقاعد المطلوبة';

  @override
  String get compareRecSentimentNegative => 'انتبه';

  @override
  String get compareRecSentimentNeutral => 'ملاحظة';

  @override
  String get compareRecSentimentPositive => 'ميزة';

  @override
  String get compareRecShowResults => 'عرض الترشيحات';

  @override
  String get compareRecStepBudget => 'الميزانية';

  @override
  String get compareRecStepNeeds => 'الاحتياجات';

  @override
  String compareRecStepOf(int step, int total, String title) {
    return 'الخطوة $step من $total: $title';
  }

  @override
  String get compareRecStepPriorities => 'الأولويات';

  @override
  String get compareRecStepUsage => 'القيادة';

  @override
  String get compareRecSuggestedWeights => 'استخدام أوزان مقترحة حسب قيادتي';

  @override
  String get compareRecSuggestedWeightsHint => 'أوقفه لتحديد كل وزن بنفسك (0 = تجاهل)';

  @override
  String compareRecSummaryBudget(String budget) {
    return 'حتى $budget';
  }

  @override
  String compareRecSummaryDaily(String distance) {
    return '$distance يوميًا';
  }

  @override
  String compareRecSummarySeats(String seats) {
    return '$seats مقاعد';
  }

  @override
  String compareRecSummaryTrips(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$formatted رحلة طويلة شهريًا',
      many: '$formatted رحلة طويلة شهريًا',
      few: '$formatted رحلات طويلة شهريًا',
      two: 'رحلتان طويلتان شهريًا',
      one: 'رحلة طويلة شهريًا',
      zero: 'بلا رحلات طويلة',
    );
    return '$_temp0';
  }

  @override
  String get compareRecTopPick => 'الترشيح الأول لك';

  @override
  String get compareRecUsageMessage => 'المسافة اليومية والرحلات الطويلة تحدد أهمية المدى والشحن السريع.';

  @override
  String get compareRecUsageTitle => 'كيف تقود؟';

  @override
  String get compareRecWeightDefault => 'وزن افتراضي';

  @override
  String get compareRecWeightIgnored => 'متجاهَل';

  @override
  String compareRecWeightShare(String percent) {
    return 'الوزن $percent';
  }

  @override
  String get compareRecWeightUsage => 'معدّل حسب قيادتك';

  @override
  String get compareRecWeightUser => 'اختيارك';

  @override
  String get compareRecWeightsAllZero => 'يجب أن تكون أولوية واحدة على الأقل أكبر من 0';

  @override
  String get compareRecWeightsTitle => 'الأوزان المستخدمة';

  @override
  String get compareRecommendCtaMessage => 'أجب عن أسئلة قليلة عن ميزانيتك وقيادتك لتحصل على ترشيح مشروح.';

  @override
  String get compareRecommendCtaTitle => 'لست متأكدًا أي سيارة تناسبك؟';

  @override
  String get compareRecommendationsTitle => 'اعثر على السيارة المناسبة';

  @override
  String get compareRemoveCar => 'إزالة من المقارنة';

  @override
  String compareRemoved(String car) {
    return 'أُزيلت $car من المقارنة';
  }

  @override
  String get compareReplaceTrayConfirm => 'استبدال';

  @override
  String compareReplaceTrayMessage(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ستُستبدل السيارات الـ$count التي تقارنها الآن بسيارات هذه المقارنة.',
      two: 'ستُستبدل السيارتان اللتان تقارنهما الآن بسيارات هذه المقارنة.',
      one: 'ستُستبدل السيارة التي تقارنها الآن بسيارات هذه المقارنة.',
    );
    return '$_temp0';
  }

  @override
  String get compareReplaceTrayTitle => 'استبدال السيارات الحالية؟';

  @override
  String compareRowsWon(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'متفوقة في $formatted صف',
      many: 'متفوقة في $formatted صفًا',
      few: 'متفوقة في $formatted صفوف',
      two: 'متفوقة في صفين',
      one: 'متفوقة في صف واحد',
      zero: 'غير متفوقة في أي صف',
    );
    return '$_temp0';
  }

  @override
  String get compareRowsWonUnknown => 'غير متوفر';

  @override
  String get compareRulesText =>
      'توحَّد الوحدات قبل المقارنة مع الاحتفاظ بالقيم المنشورة. لا يُقارن المدى إلا على دورة الاختبار نفسها ولا يُحوَّل، والمدى الكهربائي منفصل عن المدى الإجمالي. القدرة القصوى ومتوسط قدرة الشحن السريع صفّان منفصلان. لا تُقارن أزمنة الشحن إلا لنطاق الشحن نفسه (10–80% ليست 30–80%). لا تُقارن الأسعار إلا بالعملة نفسها. البطارية الأكبر ليست أفضل تلقائيًا. القيمة الناقصة لا تُعامل صفرًا أبدًا.';

  @override
  String get compareSave => 'حفظ';

  @override
  String get compareSaveGuestMessage =>
      'الحفظ في الحساب يتطلب تسجيل الدخول. يمكنك دون حساب إنشاء رابط مشاركة والاحتفاظ به.';

  @override
  String get compareSaveGuestTitle => 'احفظ هذه المقارنة';

  @override
  String get compareSaveLimitReached => 'وصلت إلى الحد الأقصى للمقارنات المحفوظة. احذف مقارنة قديمة لحفظ المزيد.';

  @override
  String get compareSaved => 'حُفظت المقارنة في حسابك';

  @override
  String get compareSavedEmptyMessage => 'قارن السيارات ثم اضغط «حفظ» لتظهر المقارنة هنا.';

  @override
  String get compareSavedEmptyTitle => 'لا توجد مقارنات محفوظة بعد';

  @override
  String get compareSavedGuestHint => 'سجّل الدخول لحفظ المقارنات في حسابك وفتحها من أي جهاز.';

  @override
  String get compareSavedTitle => 'المقارنات المحفوظة';

  @override
  String get compareShare => 'مشاركة الرابط';

  @override
  String get compareShareLinkInstead => 'إنشاء رابط مشاركة بدلًا من ذلك';

  @override
  String get compareSharedNoResultMessage => 'بقيت أقل من سيارتين منها متاحة في الدليل.';

  @override
  String get compareSharedNoResultTitle => 'لم يعد من الممكن عرض هذه المقارنة';

  @override
  String get compareSharedNotFoundMessage => 'الرابط غير صالح، أو حُذفت المقارنة أو أُلغي نشرها.';

  @override
  String get compareSharedNotFoundTitle => 'المقارنة غير موجودة';

  @override
  String get compareSharedTitle => 'مقارنة مشتركة';

  @override
  String get compareShowAllRows => 'عرض كل الصفوف';

  @override
  String compareSlotFacts(String year, String market) {
    return '$year · $market';
  }

  @override
  String compareSocWindow(String window) {
    return 'شحن $window';
  }

  @override
  String get compareSomeUnavailable => 'بعض السيارات لم تعد متاحة';

  @override
  String get compareSponsoredWarning => 'لم يتأكد خلو هذه النتيجة من الرعاية. تعامل معها بحذر.';

  @override
  String compareStars(String stars) {
    return '$stars نجوم';
  }

  @override
  String get compareStatusComparable => 'قابلة للمقارنة';

  @override
  String get compareStatusConditions => 'ظروف اختبار مختلفة — لا فائز';

  @override
  String get compareStatusCurrency => 'عملات مختلفة — لا فائز';

  @override
  String get compareStatusCycles => 'دورات اختبار مختلفة — لا فائز';

  @override
  String get compareStatusMissing => 'بيانات ناقصة — لا فائز';

  @override
  String get compareStatusNotApplicable => 'لا ينطبق على كل السيارات';

  @override
  String get compareStatusSocWindow => 'نطاقات شحن مختلفة — لا فائز';

  @override
  String get compareStatusUnknown => 'غير محسوم';

  @override
  String get compareSummaryTitle => 'نظرة سريعة';

  @override
  String get compareTitle => 'المقارنات';

  @override
  String compareTrayFull(int max) {
    return 'المقارنة ممتلئة ($max سيارات). احذف سيارة لإضافة أخرى.';
  }

  @override
  String compareUnavailableTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count سيارة لم تعد متاحة',
      many: '$count سيارة لم تعد متاحة',
      few: '$count سيارات لم تعد متاحة',
      two: 'سيارتان لم تعودا متاحتين',
      one: 'سيارة واحدة لم تعد متاحة',
    );
    return '$_temp0';
  }

  @override
  String get compareUnitInch => 'بوصة';

  @override
  String get compareUnitLitersPer100 => 'لتر/100 كم';

  @override
  String get compareValueDetailsHint => 'يعرض المصدر وظروف القياس';

  @override
  String get compareViewDetailed => 'تفصيلية';

  @override
  String get compareViewLabel => 'طريقة عرض المقارنة';

  @override
  String get compareViewSummary => 'مختصرة';

  @override
  String compareWheelSize(String size) {
    return 'جنوط $size بوصة';
  }

  @override
  String compareYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count سنة',
      many: '$count سنة',
      few: '$count سنوات',
      two: 'سنتان',
      one: 'سنة واحدة',
    );
    return '$_temp0';
  }

  @override
  String get compareYes => 'نعم';

  @override
  String get encyclopediaAllCategories => 'الكل';

  @override
  String get encyclopediaClearFilters => 'مسح عوامل التصفية';

  @override
  String get encyclopediaEmptyMessage => 'تظهر الأدلة هنا بعد أن يراجعها مختص تقني.';

  @override
  String get encyclopediaEmptyTitle => 'لا أدلة بعد';

  @override
  String get encyclopediaEntryTitle => 'موضوع في الموسوعة';

  @override
  String get encyclopediaIntro =>
      'أدلة للمبتدئين عن أنواع السيارات والمنافذ والبطاريات ومعايير المدى والشحن المنزلي والسريع والضمان وفحص السيارة المستعملة.';

  @override
  String get encyclopediaLanguageAr => 'العربية';

  @override
  String get encyclopediaLanguageEn => 'الإنجليزية';

  @override
  String get encyclopediaNoMatchesMessage => 'جرّب كلمة أو تصنيفًا آخر.';

  @override
  String get encyclopediaNoMatchesTitle => 'لا أدلة مطابقة';

  @override
  String get encyclopediaNotReviewedExplain => 'لا تتوفر معلومات مراجعة تقنية لهذا الدليل.';

  @override
  String encyclopediaReadingMinutes(int minutes, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other: 'قراءة في $formatted دقيقة',
      few: 'قراءة في $formatted دقائق',
      two: 'قراءة في دقيقتين',
      one: 'قراءة في دقيقة',
    );
    return '$_temp0';
  }

  @override
  String get encyclopediaRelated => 'أدلة ذات صلة';

  @override
  String get encyclopediaReviewPolicy =>
      'لا تُنشر إلا الأدلة التي اجتازت المراجعة التقنية. لأي عمل كهربائي استعن بكهربائي مؤهل.';

  @override
  String get encyclopediaReviewed => 'مراجَع تقنيًا';

  @override
  String get encyclopediaReviewedExplain =>
      'راجع مختص تقني هذا الدليل وفق قائمة تحقق للسلامة قبل نشره. إنه معلومات عامة ولا يغني عن كهربائي مؤهل أو عن الشركة المصنعة.';

  @override
  String encyclopediaReviewedOn(String label, String date) {
    return '$label · $date';
  }

  @override
  String get encyclopediaSafetyTitle => 'السلامة الكهربائية';

  @override
  String get encyclopediaSearchHint => 'ابحث في الموسوعة';

  @override
  String encyclopediaShownInLanguage(String language) {
    return 'معروض بـ$language';
  }

  @override
  String get encyclopediaTitle => 'موسوعة السيارات الكهربائية';

  @override
  String get favoritesBrowseCars => 'تصفّح السيارات';

  @override
  String get favoritesBrowseComparisons => 'قارن السيارات';

  @override
  String get favoritesBrowseNews => 'تصفّح الأخبار';

  @override
  String get favoritesBrowseStations => 'ابحث عن محطات';

  @override
  String get favoritesDeleteOffline => 'حذف النسخة المحفوظة';

  @override
  String get favoritesDeviceOnly => 'المفضلة محفوظة على هذا الجهاز فقط.';

  @override
  String get favoritesEmptyArticlesMessage => 'اضغط على القلب في أي مقال لتجده هنا لاحقًا.';

  @override
  String get favoritesEmptyArticlesTitle => 'لا مقالات مفضلة بعد';

  @override
  String get favoritesEmptyCarsMessage => 'احفظ الموديلات والفئات والجولات 360° بزر القلب.';

  @override
  String get favoritesEmptyCarsTitle => 'لا سيارات مفضلة بعد';

  @override
  String get favoritesEmptyComparisonsMessage => 'احفظ مقارنة لتعود إليها بسرعة.';

  @override
  String get favoritesEmptyComparisonsTitle => 'لا مقارنات مفضلة بعد';

  @override
  String get favoritesEmptyStationsMessage => 'احفظ المحطات التي تستخدمها كثيرًا.';

  @override
  String get favoritesEmptyStationsTitle => 'لا محطات مفضلة بعد';

  @override
  String get favoritesGuestHint => 'محفوظة على هذا الجهاز. سجّل الدخول لتحتفظ بها في حسابك على كل أجهزتك.';

  @override
  String get favoritesLocalOnly => 'على هذا الجهاز فقط';

  @override
  String favoritesRemoved(String title) {
    return 'أُزيل «$title»';
  }

  @override
  String get favoritesSavedArticlesTitle => 'المقالات';

  @override
  String favoritesSavedAt(String time) {
    return 'حُفظ $time';
  }

  @override
  String get favoritesSavedOfflineIntro =>
      'المحتوى الذي حفظته لقراءته دون اتصال، مع تاريخ الحفظ. ربما تغيّر منذ ذلك الحين.';

  @override
  String get favoritesSavedOfflineTitle => 'محفوظ للقراءة دون اتصال';

  @override
  String get favoritesSavedSpecsTitle => 'جداول المواصفات';

  @override
  String get favoritesSyncFailed => 'تعذّرت المزامنة مع حسابك.';

  @override
  String get favoritesSyncing => 'جارٍ المزامنة مع حسابك…';

  @override
  String get favoritesTabArticles => 'المقالات';

  @override
  String get favoritesTabCars => 'السيارات';

  @override
  String get favoritesTabComparisons => 'المقارنات';

  @override
  String get favoritesTabStations => 'المحطات';

  @override
  String get favoritesTitle => 'المفضلة';

  @override
  String get favoritesUnavailable => 'لم يعد متاحًا';

  @override
  String get favoritesUndo => 'تراجع';

  @override
  String get garageAddTitle => 'إضافة سيارة';

  @override
  String get garageEditTitle => 'تعديل السيارة';

  @override
  String get garageTitle => 'جراجي';

  @override
  String get garageVehicleTitle => 'سيارتي';

  @override
  String get homeAllTours => 'كل الجولات 360°';

  @override
  String get homeChangePlace => 'تغيير';

  @override
  String get homeChargingGuides => 'أدلة الشحن والصيانة';

  @override
  String get homeChooseCity => 'اختر مدينة';

  @override
  String get homeEmptyMessage => 'لم يُنشر محتوى لبلدك ولغتك بعد. اسحب للتحديث لاحقًا.';

  @override
  String get homeEmptyTitle => 'المحتوى في الطريق';

  @override
  String get homeExploreBrands => 'الماركات';

  @override
  String get homeExploreCalculators => 'الحاسبات';

  @override
  String get homeExploreEncyclopedia => 'موسوعة السيارات الكهربائية';

  @override
  String get homeExploreNews => 'كل الأخبار';

  @override
  String get homeExploreServices => 'دليل الخدمات';

  @override
  String get homeExploreTitle => 'استكشف';

  @override
  String get homeExploreTours => 'جولات 360°';

  @override
  String get homeFeaturedComparisons => 'مقارنات مختارة';

  @override
  String get homeForYou => 'مختارات لك';

  @override
  String get homeInteriorTours => 'جولات داخلية 360°';

  @override
  String get homeLatestNews => 'آخر الأخبار';

  @override
  String homeNearbyAround(String place) {
    return 'حول: $place';
  }

  @override
  String get homeNearbyEmpty => 'لا توجد محطات منشورة في نطاق 25 كم من هذا المكان بعد.';

  @override
  String get homeNearbyPromptMessage =>
      'اسمح بالوصول إلى الموقع أو اختر مدينة. يُستخدم موقعك لهذا البحث فقط ولا يُحفظ.';

  @override
  String get homeNearbyPromptTitle => 'اعرض محطات الشحن القريبة منك';

  @override
  String get homeNearbyStations => 'محطات شحن قريبة';

  @override
  String get homeNewCars => 'سيارات أضيفت حديثًا';

  @override
  String get homeRefreshFailed => 'تعذّر التحديث. يُعرض آخر محتوى تم تحميله.';

  @override
  String get homeReviews => 'المراجعات';

  @override
  String get homeSearchHint => 'ابحث في الأخبار والسيارات والمحطات…';

  @override
  String get homeSectionUnavailable => 'تعذّر تحميل هذا القسم الآن.';

  @override
  String get homeTitle => 'الرئيسية';

  @override
  String get homeTopStory => 'الخبر الرئيسي';

  @override
  String get homeToursIntro => 'ادخل المقصورة وتجوّل فيها مقعدًا مقعدًا.';

  @override
  String get homeUseMyLocation => 'استخدم موقعي';

  @override
  String get newsAllMarkets => 'أخبار كل الأسواق';

  @override
  String newsAllMarketsHint(String market) {
    return 'عند الإيقاف: أخبار $market والأخبار العامة لكل الأسواق فقط.';
  }

  @override
  String get newsArticleTitle => 'الخبر';

  @override
  String newsArticlesInCategory(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مقال',
      many: '$count مقالًا',
      few: '$count مقالات',
      two: 'مقالان',
      one: 'مقال واحد',
      zero: 'لا مقالات',
    );
    return '$_temp0';
  }

  @override
  String get newsBackToTop => 'العودة إلى الأعلى';

  @override
  String get newsBrowseAll => 'تصفح كل الأخبار';

  @override
  String newsByAuthor(String name) {
    return 'بقلم $name';
  }

  @override
  String get newsCategoriesLabel => 'تصنيفات الأخبار';

  @override
  String get newsCategoryTitle => 'التصنيف';

  @override
  String get newsClearFilters => 'مسح الفلاتر';

  @override
  String get newsComments => 'التعليقات';

  @override
  String get newsCorrectionKindClarification => 'توضيح';

  @override
  String get newsCorrectionKindCorrection => 'تصحيح';

  @override
  String get newsCorrectionKindUpdate => 'تحديث';

  @override
  String get newsCorrectionsTitle => 'التصحيحات والتحديثات';

  @override
  String get newsCoverCaption => 'صورة الغلاف';

  @override
  String get newsEmptyFilteredMessage => 'لا توجد مقالات تطابق هذه الفلاتر.';

  @override
  String get newsEmptyMessage => 'لم يُنشر شيء هنا بعد. عد لاحقًا.';

  @override
  String get newsEmptyTitle => 'لا توجد مقالات بعد';

  @override
  String get newsEndOfFeed => 'وصلت إلى آخر المقالات';

  @override
  String newsEventDate(String date) {
    return 'تاريخ الحدث: $date';
  }

  @override
  String get newsExternalLinkInsecure => 'هذا الرابط غير مشفّر (http).';

  @override
  String newsExternalLinkMessage(String host) {
    return 'ستغادر EV Car News لفتح $host.';
  }

  @override
  String get newsExternalLinkTitle => 'فتح رابط خارجي؟';

  @override
  String newsFallbackNotice(String requested, String served) {
    return 'غير متاح بـ$requested بعد، لذا يُعرض بـ$served.';
  }

  @override
  String get newsFilterAll => 'الكل';

  @override
  String get newsFilterSaved => 'المحفوظة';

  @override
  String get newsFiltersTitle => 'تصفية الأخبار';

  @override
  String get newsFontLarger => 'نص أكبر';

  @override
  String newsFontScaleValue(String percent) {
    return 'حجم النص $percent';
  }

  @override
  String get newsFontSize => 'حجم النص';

  @override
  String get newsFontSmaller => 'نص أصغر';

  @override
  String get newsImageLicense => 'الترخيص';

  @override
  String get newsImageOpen => 'فتح الصورة';

  @override
  String get newsImageSource => 'مصدر الصورة';

  @override
  String get newsImageViewerHint => 'قرّب بإصبعين أو بالنقر المزدوج.';

  @override
  String get newsLanguageAr => 'العربية';

  @override
  String get newsLanguageEn => 'الإنجليزية';

  @override
  String get newsLineSpacing => 'تباعد الأسطر';

  @override
  String get newsLineSpacingComfortable => 'مريح';

  @override
  String get newsLineSpacingCompact => 'متقارب';

  @override
  String get newsLineSpacingRelaxed => 'واسع';

  @override
  String get newsListTitle => 'الأخبار';

  @override
  String get newsLoadMoreFailed => 'تعذّر تحميل المزيد من المقالات.';

  @override
  String get newsLoadingMore => 'جارٍ تحميل المزيد من المقالات';

  @override
  String get newsMachineTranslated => 'ترجمة آلية راجعها محرر.';

  @override
  String newsMarketMismatch(String market) {
    return 'هذا المقال موجّه لأسواق أخرى؛ قد لا تنطبق تفاصيله على $market.';
  }

  @override
  String get newsNotFoundMessage => 'ربما حُذف أو لم يُنشر بعد.';

  @override
  String get newsNotFoundTitle => 'المقال غير متاح';

  @override
  String get newsOfflineNoCopyMessage => 'هذا المقال غير محفوظ على جهازك. اتصل بالإنترنت لقراءته.';

  @override
  String get newsOnlyMyLanguage => 'المقالات المتاحة بلغتي فقط';

  @override
  String get newsOnlyMyLanguageHint => 'عند الإيقاف: تظهر المقالات غير المترجمة بلغتها الأصلية مع توضيح ذلك.';

  @override
  String get newsOpenLink => 'فتح';

  @override
  String get newsOpenSaved => 'افتح المقالات المحفوظة';

  @override
  String newsPublishedOn(String date) {
    return 'نُشر $date';
  }

  @override
  String get newsReaderPreview => 'هكذا سيظهر نص المقال أثناء القراءة.';

  @override
  String get newsReaderSettings => 'إعدادات القراءة';

  @override
  String get newsReaderTheme => 'مظهر القراءة';

  @override
  String get newsReaderThemeApp => 'مثل التطبيق';

  @override
  String get newsReaderThemeDark => 'داكن';

  @override
  String get newsReaderThemeLight => 'فاتح';

  @override
  String newsReadingTime(int minutes) {
    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other: 'قراءة في $minutes دقيقة',
      many: 'قراءة في $minutes دقيقة',
      few: 'قراءة في $minutes دقائق',
      two: 'قراءة في دقيقتين',
      one: 'قراءة في دقيقة',
    );
    return '$_temp0';
  }

  @override
  String get newsRelatedArticlesTitle => 'مقالات ذات صلة';

  @override
  String get newsRelatedCarsTitle => 'السيارات في هذا المقال';

  @override
  String get newsRemoveSaved => 'إزالة من المحفوظات';

  @override
  String get newsRemoveSavedConfirmMessage => 'لن يعود متاحًا دون إنترنت.';

  @override
  String get newsRemoveSavedConfirmTitle => 'إزالة هذا المقال؟';

  @override
  String get newsRemovedSnack => 'أُزيل من المقالات المحفوظة.';

  @override
  String get newsSaveFailed => 'تعذّر حفظ المقال. حاول مرة أخرى.';

  @override
  String get newsSaveOffline => 'احفظ للقراءة دون إنترنت';

  @override
  String newsSavedCopyNotice(String time) {
    return 'نسخة محفوظة $time. ربما تغيّر المقال منذ ذلك الحين.';
  }

  @override
  String newsSavedCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مقال على هذا الجهاز',
      many: '$count مقالًا على هذا الجهاز',
      few: '$count مقالات على هذا الجهاز',
      two: 'مقالان على هذا الجهاز',
      one: 'مقال واحد على هذا الجهاز',
      zero: 'لا مقالات على هذا الجهاز',
    );
    return '$_temp0';
  }

  @override
  String get newsSavedEmptyMessage => 'افتح أي مقال واضغط زر التنزيل لتقرأه لاحقًا دون إنترنت.';

  @override
  String get newsSavedEmptyTitle => 'لا توجد مقالات محفوظة';

  @override
  String get newsSavedImagesPartial => 'لم تُحفظ بعض الصور';

  @override
  String get newsSavedOfflineState => 'محفوظ للقراءة دون إنترنت';

  @override
  String newsSavedOn(String date) {
    return 'حُفظ $date';
  }

  @override
  String get newsSavedSnack => 'تم الحفظ. يمكنك قراءته دون إنترنت.';

  @override
  String newsSavedSnackPartial(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'تم الحفظ، لكن تعذّر تنزيل $count صورة.',
      many: 'تم الحفظ، لكن تعذّر تنزيل $count صورة.',
      few: 'تم الحفظ، لكن تعذّر تنزيل $count صور.',
      two: 'تم الحفظ، لكن تعذّر تنزيل صورتين.',
      one: 'تم الحفظ، لكن تعذّر تنزيل صورة واحدة.',
    );
    return '$_temp0';
  }

  @override
  String get newsSavingOffline => 'جارٍ الحفظ للقراءة دون إنترنت…';

  @override
  String get newsSearch => 'البحث في الأخبار';

  @override
  String newsShownInLanguage(String language) {
    return 'بـ$language';
  }

  @override
  String get newsSortLatest => 'الأحدث';

  @override
  String get newsSortOldest => 'الأقدم';

  @override
  String get newsSortPopular => 'الأكثر قراءة';

  @override
  String get newsSourceOpen => 'فتح المصدر الأصلي';

  @override
  String get newsSourceTitle => 'المصدر';

  @override
  String newsTagHeader(String name) {
    return '#$name';
  }

  @override
  String get newsTagTitle => 'الموضوع';

  @override
  String get newsTagsTitle => 'المواضيع';

  @override
  String get newsTypeAny => 'كل الأنواع';

  @override
  String get newsTypeBuyingGuide => 'أدلة شراء';

  @override
  String get newsTypeExplainer => 'شروحات';

  @override
  String get newsTypeLabel => 'نوع المحتوى';

  @override
  String get newsTypeNews => 'أخبار';

  @override
  String get newsTypeOpinion => 'رأي';

  @override
  String get newsTypeReview => 'مراجعات';

  @override
  String get newsTypeTestDrive => 'تجارب قيادة';

  @override
  String newsUpdatedOn(String date) {
    return 'حُدّث $date';
  }

  @override
  String get newsVehicleBrand => 'علامة تجارية';

  @override
  String get newsVehicleModel => 'طراز';

  @override
  String newsVehicleModelYear(String year) {
    return 'موديل $year';
  }

  @override
  String get newsVideoGeneric => 'موقع الفيديو';

  @override
  String newsVideoOpensIn(String provider) {
    return 'يُفتح في $provider';
  }

  @override
  String newsVideoPrivacy(String provider) {
    return 'لا يُحمَّل أي شيء من $provider قبل أن تضغط.';
  }

  @override
  String get newsWatchVideo => 'شاهد الفيديو';

  @override
  String get notificationsPreferencesTitle => 'تفضيلات الإشعارات';

  @override
  String get notificationsTitle => 'الإشعارات';

  @override
  String get remindersEditTitle => 'تعديل التذكير';

  @override
  String get remindersNewTitle => 'تذكير جديد';

  @override
  String get remindersTitle => 'التذكيرات';

  @override
  String get searchAllGroups => 'كل النتائج';

  @override
  String searchAlsoMatched(String terms) {
    return 'شمل البحث أيضًا: $terms';
  }

  @override
  String get searchBrowseBrands => 'الماركات';

  @override
  String get searchBrowseEncyclopedia => 'الموسوعة';

  @override
  String get searchBrowseServices => 'الخدمات';

  @override
  String get searchClearRecent => 'مسح الكل';

  @override
  String get searchClearRecentMessage => 'هي محفوظة على هذا الجهاز فقط.';

  @override
  String get searchClearRecentTitle => 'مسح عمليات البحث الأخيرة؟';

  @override
  String get searchContactVerified => 'بيانات التواصل موثّقة';

  @override
  String searchFor(String query) {
    return 'ابحث عن «$query»';
  }

  @override
  String get searchGroupArticles => 'الأخبار والمقالات';

  @override
  String get searchGroupBrands => 'الماركات';

  @override
  String get searchGroupEncyclopedia => 'الموسوعة';

  @override
  String get searchGroupModels => 'الموديلات';

  @override
  String get searchGroupServices => 'الخدمات';

  @override
  String get searchGroupStations => 'محطات الشحن';

  @override
  String get searchGroupVariants => 'الفئات';

  @override
  String get searchHint => 'ابحث بالعربية أو الإنجليزية';

  @override
  String get searchInvalidQuery => 'اكتب حرفًا أو رقمًا واحدًا على الأقل.';

  @override
  String get searchLoadMoreFailed => 'تعذّر تحميل المزيد.';

  @override
  String get searchMatchedSpelling => 'طابق تهجئة أخرى';

  @override
  String searchNoResultsMessage(String query) {
    return 'لا شيء يطابق «$query». تحقّق من الإملاء أو جرّب كلمة أقصر.';
  }

  @override
  String get searchNoResultsTitle => 'لا توجد نتائج';

  @override
  String get searchRecentPrivacy => 'تبقى عمليات البحث الأخيرة على هذا الجهاز ولا تُرسل إلى حسابك.';

  @override
  String get searchRecentTitle => 'عمليات البحث الأخيرة';

  @override
  String searchRemoveRecent(String query) {
    return 'إزالة «$query»';
  }

  @override
  String searchResultCount(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$formatted نتيجة',
      few: '$formatted نتائج',
      two: 'نتيجتان',
      one: 'نتيجة واحدة',
      zero: 'لا نتائج',
    );
    return '$_temp0';
  }

  @override
  String get searchReviewed => 'مراجَع تقنيًا';

  @override
  String searchSeeAllCount(String count) {
    return 'عرض الكل ($count)';
  }

  @override
  String get searchShownInArabic => 'معروض بالعربية';

  @override
  String get searchShownInEnglish => 'معروض بالإنجليزية';

  @override
  String get searchStartMessage =>
      'الأخبار والماركات والموديلات والفئات ومحطات الشحن والموسوعة والخدمات. التهجئات البديلة مثل «تسلا» و«Tesla» تعمل كلها.';

  @override
  String get searchStartTitle => 'ابحث في كل شيء';

  @override
  String get searchTitle => 'البحث';

  @override
  String get searchTypeArticle => 'مقال';

  @override
  String get searchTypeBrand => 'ماركة';

  @override
  String get searchTypeEncyclopedia => 'الموسوعة';

  @override
  String get searchTypeModel => 'موديل';

  @override
  String get searchTypeQuery => 'اقتراح بحث';

  @override
  String get searchTypeService => 'خدمة';

  @override
  String get searchTypeStation => 'محطة';

  @override
  String get searchTypeVariant => 'فئة';

  @override
  String get servicesDirectoryAddress => 'العنوان';

  @override
  String get servicesDirectoryAllTypes => 'الكل';

  @override
  String get servicesDirectoryAlwaysOpen => 'مفتوح على مدار الساعة';

  @override
  String get servicesDirectoryAnyCity => 'أي مدينة';

  @override
  String get servicesDirectoryBrandsTitle => 'الماركات المخدومة';

  @override
  String get servicesDirectoryCall => 'اتصال';

  @override
  String get servicesDirectoryCheckBeforeVisit => 'اتصل للتأكد قبل الزيارة.';

  @override
  String get servicesDirectoryChooseCity => 'اختر مدينة';

  @override
  String get servicesDirectoryCity => 'المدينة';

  @override
  String get servicesDirectoryCityField => 'اسم المدينة';

  @override
  String get servicesDirectoryClosedDay => 'مغلق';

  @override
  String get servicesDirectoryClosedNow => 'مغلق الآن';

  @override
  String get servicesDirectoryContactTitle => 'التواصل';

  @override
  String get servicesDirectoryDayFri => 'الجمعة';

  @override
  String get servicesDirectoryDayMon => 'الاثنين';

  @override
  String get servicesDirectoryDaySat => 'السبت';

  @override
  String get servicesDirectoryDaySun => 'الأحد';

  @override
  String get servicesDirectoryDayThu => 'الخميس';

  @override
  String get servicesDirectoryDayTue => 'الثلاثاء';

  @override
  String get servicesDirectoryDayWed => 'الأربعاء';

  @override
  String get servicesDirectoryDemoNoContact => 'قائمة تجريبية: أزرار التواصل معطّلة.';

  @override
  String get servicesDirectoryDirections => 'الاتجاهات';

  @override
  String get servicesDirectoryDistance => 'المسافة';

  @override
  String servicesDirectoryDistanceAway(String distance) {
    return 'على بعد $distance';
  }

  @override
  String get servicesDirectoryEmail => 'البريد الإلكتروني';

  @override
  String get servicesDirectoryEmptyMessage => 'لم يُنشر شيء لبلدك بعد.';

  @override
  String get servicesDirectoryEmptyTitle => 'لا مقدّمي خدمة بعد';

  @override
  String get servicesDirectoryHoursNotAvailable => 'مواعيد العمل غير متوفرة.';

  @override
  String get servicesDirectoryHoursTitle => 'مواعيد العمل';

  @override
  String get servicesDirectoryHoursUnknown => 'المواعيد غير متوفرة';

  @override
  String get servicesDirectoryHoursUnknownDay => 'غير متوفر';

  @override
  String get servicesDirectoryIntro =>
      'مراكز الخدمة والوكلاء وتركيب الشواحن وخدمات الطوارئ. تظهر بيانات التواصل مع تاريخ آخر تحقق منها.';

  @override
  String get servicesDirectoryLocationDenied => 'لم يُسمح بالوصول إلى الموقع. يمكنك اختيار مدينة بدلًا من ذلك.';

  @override
  String get servicesDirectoryLocationDeniedForever =>
      'الوصول إلى الموقع متوقف لهذا التطبيق. فعّله من الإعدادات أو اختر مدينة.';

  @override
  String get servicesDirectoryLocationServiceOff => 'خدمات الموقع متوقفة على هذا الجهاز. فعّلها أو اختر مدينة.';

  @override
  String get servicesDirectoryLocationTitle => 'الموقع';

  @override
  String get servicesDirectoryLocationUnavailable => 'تعذّر تحديد موقعك. يمكنك اختيار مدينة بدلًا من ذلك.';

  @override
  String get servicesDirectoryNearMe => 'بالقرب مني';

  @override
  String get servicesDirectoryNoContact => 'لا توجد بيانات تواصل منشورة.';

  @override
  String get servicesDirectoryNoMatchesMessage => 'جرّب نوعًا أو مدينة أخرى، أو أوقف «مفتوح الآن».';

  @override
  String get servicesDirectoryNoMatchesTitle => 'لا نتائج مطابقة';

  @override
  String get servicesDirectoryNotVerified => 'لم يتم التحقق من بيانات التواصل';

  @override
  String get servicesDirectoryOpenNow => 'مفتوح الآن';

  @override
  String get servicesDirectoryOrderDistance => 'الأقرب أولًا. الرعاية لا تغيّر هذا الترتيب.';

  @override
  String get servicesDirectoryOrderVerified =>
      'الترتيب: بيانات التواصل الموثّقة أولًا ثم الاسم. الرعاية لا تغيّر هذا الترتيب.';

  @override
  String get servicesDirectoryPhone => 'الهاتف';

  @override
  String get servicesDirectoryProviderTitle => 'مقدّم خدمة';

  @override
  String get servicesDirectoryResults => 'الدليل';

  @override
  String get servicesDirectorySearchHint => 'ابحث بالاسم';

  @override
  String get servicesDirectoryServicesTitle => 'الخدمات';

  @override
  String get servicesDirectorySponsoredDetailNote =>
      'هذه القائمة مموّلة. الرعاية لا تعني أن مقدّم الخدمة موصى به أو موثّق.';

  @override
  String get servicesDirectorySponsoredSlotNote => 'مواضع مدفوعة تُعرض منفصلة، وتحتفظ بمكانها المعتاد في الدليل أدناه.';

  @override
  String get servicesDirectorySponsoredSlotTitle => 'قوائم مموّلة';

  @override
  String servicesDirectoryTimezone(String zone) {
    return 'المواعيد بتوقيت $zone';
  }

  @override
  String get servicesDirectoryTitle => 'دليل الخدمات';

  @override
  String get servicesDirectoryTruncated => 'النتائج كثيرة: ضيّق البحث لتظهر الأنسب.';

  @override
  String get servicesDirectoryTypeBattery => 'خدمات البطاريات';

  @override
  String get servicesDirectoryTypeChargerInstaller => 'تركيب الشواحن';

  @override
  String get servicesDirectoryTypeDealer => 'الوكلاء';

  @override
  String get servicesDirectoryTypeEmergency => 'الطوارئ';

  @override
  String get servicesDirectoryTypeOther => 'أخرى';

  @override
  String get servicesDirectoryTypeServiceCenter => 'مراكز الخدمة';

  @override
  String get servicesDirectoryVerified => 'بيانات التواصل موثّقة';

  @override
  String get servicesDirectoryVerifiedLongAgo => 'تم التحقق منذ أكثر من سنة';

  @override
  String servicesDirectoryVerifiedOn(String date) {
    return 'تم التحقق في $date';
  }

  @override
  String servicesDirectoryVerifiedStale(String date) {
    return 'آخر تحقق $date (منذ أكثر من سنة)';
  }

  @override
  String get servicesDirectoryWebsite => 'الموقع الإلكتروني';

  @override
  String get servicesDirectoryWhatsApp => 'واتساب';

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
  String get toursAbout => 'نبذة';

  @override
  String get toursAttributionTitle => 'حقوق الصور والترخيص';

  @override
  String get toursBrowseCars => 'تصفّح السيارات';

  @override
  String get toursCar => 'السيارة';

  @override
  String toursCredit(String credit) {
    return '© $credit';
  }

  @override
  String get toursDemoFallback => 'تجريبي — ليست مقصورة سيارة حقيقية';

  @override
  String get toursDetails => 'تفاصيل الجولة';

  @override
  String get toursDragHint => 'اسحب لتنظر حولك · قرّب بإصبعين للتكبير';

  @override
  String get toursDriveLhd => 'مقود على اليسار';

  @override
  String get toursDriveRhd => 'مقود على اليمين';

  @override
  String get toursDriveUnknown => 'اتجاه القيادة: غير متوفر';

  @override
  String get toursFullscreenEnter => 'ملء الشاشة';

  @override
  String get toursFullscreenExit => 'الخروج من ملء الشاشة';

  @override
  String get toursGoBack => 'رجوع';

  @override
  String get toursHdFailed => 'تعذّر تحميل الجودة العالية. تُعرض المعاينة.';

  @override
  String get toursHotspotImage => 'صورة تفصيلية';

  @override
  String get toursHotspotInfo => 'معلومة';

  @override
  String get toursHotspotScene => 'الانتقال إلى مقعد آخر';

  @override
  String get toursHotspotSpec => 'مواصفة';

  @override
  String get toursHotspotVideo => 'فيديو';

  @override
  String get toursImageZoomHint => 'اضغط على الصورة للتكبير';

  @override
  String get toursImageZoomTitle => 'صورة تفصيلية';

  @override
  String get toursInfo => 'عن هذه الجولة';

  @override
  String toursInterior(String color) {
    return 'المقصورة: $color';
  }

  @override
  String toursLicense(String license) {
    return 'الترخيص: $license';
  }

  @override
  String get toursLicenseCc0 => 'CC0 (ملكية عامة)';

  @override
  String get toursLicenseCcBy => 'CC BY';

  @override
  String get toursLicenseCcBySa => 'CC BY-SA';

  @override
  String get toursLicenseCommissioned => 'بتكليف';

  @override
  String get toursLicenseLicensed => 'مرخّصة';

  @override
  String get toursLicenseOther => 'ترخيص آخر';

  @override
  String get toursLicenseOwned => 'مملوكة';

  @override
  String get toursLicensePermission => 'بإذن من صاحب الحقوق';

  @override
  String get toursLicensePressKit => 'مواد صحفية';

  @override
  String get toursLicenseTerms => 'شروط الترخيص';

  @override
  String get toursListEmptyMessage =>
      'ننشر الجولات فقط من صور مرخّصة للفئة نفسها. ستظهر الجولات الجديدة هنا فور جاهزيتها.';

  @override
  String get toursListEmptyTitle => 'لا توجد جولات 360° بعد';

  @override
  String get toursListIntro =>
      'اجلس داخل السيارة وانظر حولك مقعدًا بمقعد. كل جولة مصنوعة من صور داخلية مرخّصة للفئة المذكورة.';

  @override
  String get toursListTitle => 'الجولات الداخلية 360°';

  @override
  String get toursLoadFailedMessage => 'تحقق من الاتصال وحاول مرة أخرى. يمكنك أيضًا تصفّح الصور العادية.';

  @override
  String get toursLoadFailedTitle => 'تعذّر تحميل العرض 360°';

  @override
  String get toursLoadMoreFailed => 'تعذّر تحميل المزيد من الجولات.';

  @override
  String get toursLoading => 'جارٍ تحميل العرض 360°…';

  @override
  String toursLoadingHd(String percent) {
    return 'جارٍ تحميل الجودة العالية… $percent';
  }

  @override
  String get toursLoadingHdUnknown => 'جارٍ تحميل الجودة العالية…';

  @override
  String toursMarket(String market) {
    return 'السوق: $market';
  }

  @override
  String toursMarketMismatch(String market) {
    return 'صُنعت هذه الجولة لسوق $market، وليس للسوق الذي اخترته.';
  }

  @override
  String toursModelYear(String year) {
    return 'موديل $year';
  }

  @override
  String get toursMotionEnabled => 'التحكم بالحركة يعمل. حرّك هاتفك لتنظر حولك.';

  @override
  String get toursMotionOff => 'انظر حولك بتحريك الهاتف';

  @override
  String get toursMotionOn => 'إيقاف التحكم بحركة الهاتف';

  @override
  String get toursMotionUnavailable => 'التحكم بحركة الهاتف غير متاح على هذا الجهاز. اسحب لتنظر حولك.';

  @override
  String get toursNoImageMessage => 'صورها أكبر مما يستطيع هذا الجهاز عرضه.';

  @override
  String get toursNoImageTitle => 'لا يمكن عرض هذه الجولة على هذا الجهاز';

  @override
  String get toursOpen => 'افتح الجولة 360°';

  @override
  String get toursOpenGallery => 'افتح معرض الصور';

  @override
  String get toursPoints => 'نقاط الاهتمام';

  @override
  String get toursPointsEmpty => 'لا توجد نقاط اهتمام في هذا المشهد.';

  @override
  String toursPublished(String date) {
    return 'نُشرت $date';
  }

  @override
  String get toursQualityHd => 'عالية الدقة';

  @override
  String get toursQualityHdSemantics => 'يُعرض الآن بجودة عالية';

  @override
  String get toursQualityPreview => 'معاينة';

  @override
  String get toursQualityPreviewSemantics => 'يُعرض الآن نسخة معاينة منخفضة الدقة';

  @override
  String get toursReferenceBadge => 'فئة قريبة';

  @override
  String toursReferenceBody(String trim) {
    return 'تعرض هذه الصور الفئة $trim، وليست الفئة المختارة نفسها.';
  }

  @override
  String get toursReferenceTitle => 'مصوّرة في فئة قريبة';

  @override
  String get toursResetView => 'إعادة المنظور';

  @override
  String toursSceneCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مشهد',
      many: '$count مشهدًا',
      few: '$count مشاهد',
      two: 'مشهدان',
      one: 'مشهد واحد',
      zero: 'لا مشاهد',
    );
    return '$_temp0';
  }

  @override
  String get toursSeatCargo => 'صندوق الأمتعة';

  @override
  String get toursSeatDriver => 'مقعد السائق';

  @override
  String get toursSeatFrontPassenger => 'الراكب الأمامي';

  @override
  String get toursSeatOther => 'منظر آخر';

  @override
  String get toursSeatPicker => 'اختر المقعد';

  @override
  String get toursSeatRear => 'المقاعد الخلفية';

  @override
  String get toursSeatThirdRow => 'الصف الثالث';

  @override
  String get toursSourceLink => 'المصدر';

  @override
  String get toursSpecOpen => 'كل المواصفات';

  @override
  String get toursStillPreview => 'معاينة ثابتة (ليست الجولة 360°)';

  @override
  String toursTrim(String trim) {
    return 'الفئة: $trim';
  }

  @override
  String get toursUnavailableMessage => 'لا توجد مقصورة 360° مرخّصة لهذه الجولة. يمكنك تصفّح الصور العادية بدلًا منها.';

  @override
  String get toursUnavailableTitle => 'الجولة غير متاحة لهذه الفئة';

  @override
  String get toursVideoBlocked => 'رابط الفيديو هذا غير مسموح.';

  @override
  String get toursVideoOpen => 'شاهد الفيديو';

  @override
  String toursVideoProvider(String provider) {
    return 'يُفتح على $provider';
  }

  @override
  String get toursVideoSelf => 'EV Car News';

  @override
  String get toursViewCar => 'صفحة السيارة';

  @override
  String toursViewerSemantics(String car) {
    return 'عرض 360° لسيارة $car. اسحب لتنظر حولك أو استخدم الأزرار.';
  }

  @override
  String get toursViewerTitle => 'جولة داخلية 360°';

  @override
  String get toursWebPreviewMessage =>
      'يعمل عارض 360° في تطبيقي Android وiOS. الصورة أدناه معاينة ثابتة فقط وليست الجولة.';

  @override
  String get toursWebglMessage =>
      'رسوميات ثلاثية الأبعاد (WebGL) غير متاحة على هذا الجهاز. يمكنك تصفّح الصور العادية بدلًا منها.';

  @override
  String get toursWebglTitle => 'هذا الجهاز لا يدعم العرض 360°';

  @override
  String get toursZoomIn => 'تكبير';

  @override
  String get toursZoomOut => 'تصغير';

  @override
  String get tripsTitle => 'مخطط الرحلات';
}
