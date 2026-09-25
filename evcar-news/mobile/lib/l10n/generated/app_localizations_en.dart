// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get accountDeleteAccount => 'Delete account';

  @override
  String get accountDeleteAcknowledge => 'I understand this is permanent and cannot be undone.';

  @override
  String get accountDeleteButton => 'Delete account permanently';

  @override
  String get accountDeletePasswordLabel => 'Enter your password to confirm';

  @override
  String get accountDeleteTitle => 'Delete account';

  @override
  String get accountDeleteWarning =>
      'Your account and personal data will be permanently deleted, such as your garage, favorites, charging log, reminders and synced settings. Public contributions such as reviews and comments will be anonymized. This cannot be undone.';

  @override
  String get accountDeleted => 'Your account has been deleted.';

  @override
  String get accountEmailNotVerified => 'Your email is not verified yet.';

  @override
  String get accountEmailVerified => 'Email verified';

  @override
  String get accountExploreSection => 'Explore';

  @override
  String get accountGuestMessage =>
      'All public content is available without signing in. Create an account to save your cars and favorites and sync them across devices.';

  @override
  String get accountGuestTitle => 'You\'re browsing as a guest';

  @override
  String get accountLoggedOut => 'Signed out.';

  @override
  String get accountLogout => 'Sign out';

  @override
  String get accountLogoutConfirm => 'Sign out of this device?';

  @override
  String get accountMyToolsSection => 'My tools';

  @override
  String get accountOfflineUser => 'Showing saved account details because you\'re offline.';

  @override
  String get accountPreferredLanguageLabel => 'Language for emails and notifications';

  @override
  String get accountProfile => 'Profile';

  @override
  String get accountProfileSaved => 'Changes saved.';

  @override
  String get accountProfileTitle => 'Profile';

  @override
  String get accountRestoring => 'Restoring your session…';

  @override
  String accountSessionCreated(String time) {
    return 'Started: $time';
  }

  @override
  String accountSessionIp(String ip) {
    return 'IP address: $ip';
  }

  @override
  String accountSessionLastUsed(String time) {
    return 'Last used: $time';
  }

  @override
  String get accountSessionRevoke => 'End session';

  @override
  String get accountSessionRevokeConfirm => 'End this session? That device will need to sign in again.';

  @override
  String get accountSessionRevoked => 'Session ended.';

  @override
  String get accountSessionThisDevice => 'This device';

  @override
  String get accountSessionUnknownDevice => 'Unknown device';

  @override
  String get accountSessions => 'Devices & sessions';

  @override
  String get accountSessionsEmpty => 'No active sessions.';

  @override
  String get accountSessionsTitle => 'Devices & sessions';

  @override
  String get accountSettingsSection => 'Settings & privacy';

  @override
  String get accountTitle => 'My account';

  @override
  String get accountVerifyNow => 'Verify now';

  @override
  String get authBackToLogin => 'Back to sign in';

  @override
  String get authConfirmPasswordLabel => 'Confirm password';

  @override
  String get authContinueAsGuest => 'Continue as guest';

  @override
  String get authDisplayNameLabel => 'Display name';

  @override
  String authDisplayNameTooLong(int max) {
    return 'Name is too long (max $max characters).';
  }

  @override
  String get authEmailInvalid => 'Enter a valid email address.';

  @override
  String get authEmailLabel => 'Email';

  @override
  String get authForgotButton => 'Send link';

  @override
  String get authForgotDone => 'If an account exists for this email, you\'ll receive reset instructions.';

  @override
  String get authForgotIntro => 'Enter your email and we\'ll send you a link to reset your password.';

  @override
  String get authForgotPasswordLink => 'Forgot password?';

  @override
  String get authForgotTitle => 'Reset your password';

  @override
  String get authGuestNote =>
      'You can browse news, cars and stations without an account. An account is only needed for sync and personal features.';

  @override
  String get authHaveAccount => 'Already have an account?';

  @override
  String get authHaveResetCode => 'I have a reset code';

  @override
  String get authLoginButton => 'Sign in';

  @override
  String get authLoginTitle => 'Sign in';

  @override
  String get authNewPasswordLabel => 'New password';

  @override
  String get authNoAccount => 'No account yet?';

  @override
  String get authPasswordLabel => 'Password';

  @override
  String authPasswordTooLong(int max) {
    return 'Password is too long (max $max characters).';
  }

  @override
  String authPasswordTooShort(int min) {
    return 'Password must be at least $min characters.';
  }

  @override
  String get authPasswordsDoNotMatch => 'Passwords do not match.';

  @override
  String get authRegisterButton => 'Create account';

  @override
  String authRegisterSuccessMessage(String email) {
    return 'We sent a confirmation link to $email. Open it from your inbox to verify your account, then sign in.';
  }

  @override
  String get authRegisterSuccessTitle => 'Account created';

  @override
  String get authRegisterTitle => 'Create account';

  @override
  String get authRequired => 'This field is required.';

  @override
  String get authResendVerification => 'Resend verification link';

  @override
  String get authResendVerificationDone => 'If the account exists and is not verified yet, a new link is on its way.';

  @override
  String get authResetButton => 'Save password';

  @override
  String get authResetDone => 'Your password has been changed. Sign in with your new password.';

  @override
  String get authResetTitle => 'Set a new password';

  @override
  String get authResetTokenLabel => 'Reset code';

  @override
  String get authVerifyButton => 'Verify';

  @override
  String get authVerifyEmailAction => 'Verify my email';

  @override
  String get authVerifyIntro =>
      'Open the verification link we emailed you on this device, or paste the verification code here.';

  @override
  String get authVerifySuccess => 'Your email has been verified.';

  @override
  String get authVerifyTitle => 'Verify email';

  @override
  String get authVerifyTokenLabel => 'Verification code';

  @override
  String get calculatorsCalculatorTitle => 'Calculator';

  @override
  String get calculatorsTitle => 'Charging & running-cost calculators';

  @override
  String get carsBrandTitle => 'Brand';

  @override
  String get carsBrandsTitle => 'Brands';

  @override
  String get carsCatalogTitle => 'Car catalog';

  @override
  String get carsDetailTitle => 'Car details';

  @override
  String get carsGalleryTitle => 'Photos';

  @override
  String get carsVariantTitle => 'Trim details';

  @override
  String get chargingCheckInTitle => 'Check in';

  @override
  String get chargingFiltersTitle => 'Station filters';

  @override
  String get chargingLocationTitle => 'Choose a place';

  @override
  String get chargingLogsEditTitle => 'Edit charging session';

  @override
  String get chargingLogsNewTitle => 'New charging session';

  @override
  String get chargingLogsReportsTitle => 'Spending & consumption';

  @override
  String get chargingLogsTitle => 'Charging log';

  @override
  String get chargingReportTitle => 'Report a problem';

  @override
  String get chargingStationTitle => 'Station details';

  @override
  String get chargingSuggestTitle => 'Suggest a station';

  @override
  String get chargingTitle => 'Charging stations';

  @override
  String get commonAdLabel => 'Ad';

  @override
  String get commonApply => 'Apply';

  @override
  String commonCachedDataNotice(String time) {
    return 'Saved copy from $time; it may not be up to date.';
  }

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonClearSearch => 'Clear search';

  @override
  String get commonClose => 'Close';

  @override
  String get commonCompareAdd => 'Add to compare';

  @override
  String get commonCompareAddedSnack => 'Added to comparison';

  @override
  String get commonCompareClear => 'Clear';

  @override
  String commonCompareFull(int max) {
    return 'You can compare up to $max cars. Remove one first.';
  }

  @override
  String get commonCompareInTray => 'In comparison';

  @override
  String get commonCompareNeedTwo => 'Choose at least two cars to compare.';

  @override
  String get commonCompareNow => 'Compare';

  @override
  String get commonCompareRemove => 'Remove from comparison';

  @override
  String commonCompareTrayCount(int count, int max) {
    return '$count of $max selected';
  }

  @override
  String get commonConfirm => 'Confirm';

  @override
  String get commonCreateAccount => 'Create account';

  @override
  String commonDaysAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count days ago', one: '1 day ago');
    return '$_temp0';
  }

  @override
  String get commonDemoDescription => 'Sample data for testing — not real information.';

  @override
  String get commonDemoLabel => 'Demo data';

  @override
  String get commonDone => 'Done';

  @override
  String get commonEmptyMessage => 'There are no items to show right now.';

  @override
  String get commonEmptyTitle => 'Nothing here yet';

  @override
  String get commonErrorGeneric => 'The request could not be completed. Please try again.';

  @override
  String get commonErrorTitle => 'Something went wrong';

  @override
  String get commonExternalVideo => 'Watch the video at its source';

  @override
  String get commonFavoriteAdd => 'Add to favorites';

  @override
  String get commonFavoriteAdded => 'Added to favorites';

  @override
  String get commonFavoriteFailed => 'Couldn\'t update favorites. Please try again.';

  @override
  String get commonFavoriteLocalOnly => 'Saved on this device. Sign in to sync across devices.';

  @override
  String get commonFavoriteRemove => 'Remove from favorites';

  @override
  String get commonFavoriteRemoved => 'Removed from favorites';

  @override
  String get commonFilters => 'Filters';

  @override
  String commonFiltersActive(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count filters on', one: '1 filter on');
    return '$_temp0';
  }

  @override
  String get commonForbiddenMessage => 'You don\'t have access to this content.';

  @override
  String get commonHidePassword => 'Hide password';

  @override
  String commonHoursAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count hours ago', one: '1 hour ago');
    return '$_temp0';
  }

  @override
  String commonImageCredit(String credit) {
    return 'Image: $credit';
  }

  @override
  String get commonImageUnavailable => 'Image not available';

  @override
  String get commonJustNow => 'just now';

  @override
  String commonLastUpdated(String time) {
    return 'Last updated $time';
  }

  @override
  String get commonLastUpdatedUnknown => 'Last update: not available';

  @override
  String get commonLinkOpenFailed => 'Couldn\'t open the link.';

  @override
  String get commonLoading => 'Loading…';

  @override
  String get commonMayBeOutdated => 'May be out of date';

  @override
  String commonMeasuredBy(String cycle) {
    return 'Measured: $cycle';
  }

  @override
  String commonMinutesAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count minutes ago', one: '1 minute ago');
    return '$_temp0';
  }

  @override
  String get commonMore => 'More';

  @override
  String get commonMoreInfo => 'More information';

  @override
  String get commonNotAvailable => 'Not available';

  @override
  String get commonNotConfiguredMessage => 'This service has not been set up by the administrators yet.';

  @override
  String get commonNotConfiguredTitle => 'Service not configured';

  @override
  String get commonNotFoundMessage => 'The requested content does not exist or is no longer available.';

  @override
  String get commonNotSupportedOnPlatformMessage => 'This feature works in the Android and iOS apps.';

  @override
  String get commonNotSupportedOnPlatformTitle => 'Not available in the web preview';

  @override
  String get commonOfflineBanner => 'You are offline';

  @override
  String get commonOfflineMessage =>
      'Check your connection and try again. Content you saved is still available offline.';

  @override
  String get commonOfflineTitle => 'You\'re offline';

  @override
  String get commonOpenSettings => 'Open device settings';

  @override
  String get commonPermissionDeniedMessage =>
      'This feature needs a permission that has not been granted. You can allow it in the device settings.';

  @override
  String get commonPermissionDeniedTitle => 'Permission not granted';

  @override
  String get commonPermissionLocationMessage =>
      'Your location is used only while the app is open, to show nearby stations. Allow it in the device settings or choose a place manually.';

  @override
  String get commonPermissionLocationTitle => 'Location not allowed';

  @override
  String get commonPermissionMotionMessage => 'Motion control is optional. You can still look around by dragging.';

  @override
  String get commonPermissionMotionTitle => 'Motion sensors not allowed';

  @override
  String get commonPermissionNotificationsMessage =>
      'Reminders need notification permission. You can allow it in the device settings.';

  @override
  String get commonPermissionNotificationsTitle => 'Notifications not allowed';

  @override
  String get commonPowertrainBev => 'Electric';

  @override
  String get commonPowertrainErev => 'Range extender';

  @override
  String get commonPowertrainHev => 'Hybrid';

  @override
  String get commonPowertrainPhev => 'Plug-in hybrid';

  @override
  String commonPriceAsOf(String date) {
    return 'as of $date';
  }

  @override
  String get commonPriceConverted => 'Estimate after conversion';

  @override
  String get commonPriceDealer => 'Dealer price';

  @override
  String get commonPriceMarketEstimate => 'Market estimate';

  @override
  String get commonPriceNotAvailable => 'Price not available';

  @override
  String get commonPriceOfficialMsrp => 'Official price';

  @override
  String get commonRangeCycleOther => 'Other cycle';

  @override
  String get commonRangeElectric => 'Electric range';

  @override
  String get commonRangeTotal => 'Total range';

  @override
  String get commonRateLimitedMessage => 'Too many requests. Please wait a moment and try again.';

  @override
  String get commonReliabilityDisputed => 'Disputed';

  @override
  String get commonReliabilityEstimated => 'Estimated';

  @override
  String commonReliabilityLabel(String level) {
    return 'Reliability: $level';
  }

  @override
  String get commonReliabilityManufacturerClaim => 'Manufacturer claim';

  @override
  String get commonReliabilityUnverified => 'Unverified';

  @override
  String get commonReliabilityVerified => 'Verified';

  @override
  String get commonReset => 'Reset';

  @override
  String get commonRetry => 'Try again';

  @override
  String get commonSave => 'Save';

  @override
  String get commonSearchHint => 'Search';

  @override
  String get commonSeeAll => 'See all';

  @override
  String commonSeeAllSection(String section) {
    return 'See all: $section';
  }

  @override
  String get commonSelected => 'Selected';

  @override
  String get commonServerErrorMessage => 'The server is currently unavailable. Please try again later.';

  @override
  String get commonShare => 'Share';

  @override
  String get commonShowPassword => 'Show password';

  @override
  String get commonSignIn => 'Sign in';

  @override
  String get commonSignInRequiredMessage =>
      'This feature stores your personal data, so it needs an account. You can keep browsing the rest of the app without one.';

  @override
  String get commonSignInRequiredTitle => 'Sign in to continue';

  @override
  String get commonSortBy => 'Sort by';

  @override
  String commonSource(String source) {
    return 'Source: $source';
  }

  @override
  String get commonSourceUnknown => 'Source not specified';

  @override
  String commonSponsoredBy(String name) {
    return 'Sponsored by $name';
  }

  @override
  String get commonSponsoredDescription => 'Paid placement. It never changes comparison results or rankings.';

  @override
  String get commonSponsoredLabel => 'Sponsored';

  @override
  String get commonTimeoutMessage => 'The server took too long to respond. Please try again.';

  @override
  String get commonTour360 => '360° tour';

  @override
  String get commonTour360Available => 'Interior 360° tour available';

  @override
  String get commonUnderConstructionMessage =>
      'This screen is not built yet and shows no data until it is connected to the server.';

  @override
  String commonUnderConstructionRequested(String path) {
    return 'Requested route: $path';
  }

  @override
  String get commonUnderConstructionTitle => 'Under construction';

  @override
  String get commonUnknown => 'Unknown';

  @override
  String commonVerifiedOn(String date) {
    return 'Verified on $date';
  }

  @override
  String get commonWebPreviewBanner => 'Web preview';

  @override
  String get communityAskTitle => 'Ask a question';

  @override
  String get communityCarReviewsTitle => 'Owner reviews';

  @override
  String get communityCommentsTitle => 'Comments';

  @override
  String get communityQuestionTitle => 'Question';

  @override
  String get communityQuestionsTitle => 'Questions & answers';

  @override
  String get communityWriteReviewTitle => 'Write a review';

  @override
  String get comparePickerTitle => 'Choose a car';

  @override
  String get compareRecommendationsTitle => 'Find the right car';

  @override
  String get compareSharedTitle => 'Shared comparison';

  @override
  String get compareTitle => 'Comparisons';

  @override
  String get encyclopediaEntryTitle => 'Encyclopedia entry';

  @override
  String get encyclopediaTitle => 'EV encyclopedia';

  @override
  String get favoritesSavedOfflineTitle => 'Saved for offline reading';

  @override
  String get favoritesTitle => 'Favorites';

  @override
  String get garageAddTitle => 'Add a car';

  @override
  String get garageEditTitle => 'Edit car';

  @override
  String get garageTitle => 'My garage';

  @override
  String get garageVehicleTitle => 'My car';

  @override
  String get homeTitle => 'Home';

  @override
  String get newsArticleTitle => 'Article';

  @override
  String get newsCategoryTitle => 'Category';

  @override
  String get newsListTitle => 'News';

  @override
  String get newsTagTitle => 'Topic';

  @override
  String get notificationsPreferencesTitle => 'Notification preferences';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get remindersEditTitle => 'Edit reminder';

  @override
  String get remindersNewTitle => 'New reminder';

  @override
  String get remindersTitle => 'Reminders';

  @override
  String get searchTitle => 'Search';

  @override
  String get servicesDirectoryProviderTitle => 'Service provider';

  @override
  String get servicesDirectoryTitle => 'Services directory';

  @override
  String get settingsAboutSection => 'About';

  @override
  String get settingsClearCache => 'Clear cached data';

  @override
  String get settingsClearCacheConfirm => 'Clear cached data?';

  @override
  String get settingsClearCacheDone => 'Cached data cleared.';

  @override
  String get settingsClearCacheSubtitle =>
      'Removes temporary copies of content. Items you saved for offline reading are kept.';

  @override
  String settingsConfigCache(String time) {
    return 'Using saved server settings from $time';
  }

  @override
  String get settingsConfigFallback => 'The server could not be reached; the built-in default settings are in use.';

  @override
  String settingsConfigNetwork(String time) {
    return 'Server settings up to date ($time)';
  }

  @override
  String get settingsConfigRefresh => 'Refresh server settings';

  @override
  String get settingsDataSection => 'Data';

  @override
  String get settingsDigitsSubtitle => 'Used only when the app language is Arabic.';

  @override
  String get settingsDigitsTitle => 'Arabic-Indic digits (٠١٢٣)';

  @override
  String settingsFontPreviewNumbers(String number, String date) {
    return 'Numbers and date example: $number — $date';
  }

  @override
  String get settingsFontPreviewSample => 'Sample text: news, car catalog, comparisons and charging stations.';

  @override
  String get settingsFontPreviewTitle => 'Preview';

  @override
  String get settingsLanguageArabic => 'العربية (Arabic)';

  @override
  String get settingsLanguageEnglish => 'English';

  @override
  String get settingsLanguageHint =>
      'The app language is independent of the market; you can read any market in either language.';

  @override
  String get settingsLanguageSection => 'Language';

  @override
  String get settingsLanguageSystem => 'Device language';

  @override
  String get settingsLicenses => 'Software and font licences';

  @override
  String settingsMarketCurrency(String currency) {
    return 'Currency: $currency';
  }

  @override
  String get settingsMarketHint =>
      'The market sets prices, availability and currency. Choosing a market does not mean charging station data is available there.';

  @override
  String get settingsMarketSection => 'Market (country)';

  @override
  String get settingsMarketsUnavailable => 'No markets are enabled in the server settings.';

  @override
  String get settingsPrivacy => 'Privacy policy';

  @override
  String get settingsTerms => 'Terms of use';

  @override
  String get settingsTextSizeDecrease => 'Smaller text';

  @override
  String get settingsTextSizeHint => 'Applied on top of the text size chosen in your device settings.';

  @override
  String get settingsTextSizeIncrease => 'Larger text';

  @override
  String get settingsTextSizeSection => 'Text size';

  @override
  String get settingsThemeDark => 'Dark';

  @override
  String get settingsThemeLight => 'Light';

  @override
  String get settingsThemeSection => 'Appearance';

  @override
  String get settingsThemeSystem => 'Follow device';

  @override
  String get settingsTitle => 'Settings';

  @override
  String settingsVersion(String version) {
    return 'Version $version';
  }

  @override
  String get settingsVersionUnknown => 'Version unknown';

  @override
  String get shellGoHome => 'Back to home';

  @override
  String get shellNavAccount => 'Account';

  @override
  String get shellNavCars => 'Cars';

  @override
  String get shellNavCharging => 'Charging';

  @override
  String get shellNavCompare => 'Compare';

  @override
  String get shellNavHome => 'Home';

  @override
  String get shellNotificationsTooltip => 'Notifications';

  @override
  String get shellRouteNotFoundMessage => 'There is no screen at this address in the app.';

  @override
  String get shellRouteNotFoundTitle => 'Page not found';

  @override
  String get shellSearchTooltip => 'Search';

  @override
  String get shellSessionExpired => 'Your session has ended. Please sign in again.';

  @override
  String get toursListTitle => '360° interior tours';

  @override
  String get toursViewerTitle => '360° interior tour';

  @override
  String get tripsTitle => 'Trip planner';
}
