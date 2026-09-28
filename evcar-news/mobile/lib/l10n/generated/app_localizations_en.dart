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
  String carsAbout(String name) {
    return 'About $name';
  }

  @override
  String get carsAllReviews => 'All reviews';

  @override
  String get carsArticleBuyingGuide => 'Buying guide';

  @override
  String get carsArticleExplainer => 'Explainer';

  @override
  String get carsArticleNews => 'News';

  @override
  String get carsArticleOpinion => 'Opinion';

  @override
  String get carsArticleReview => 'Review';

  @override
  String get carsArticleTestDrive => 'Test drive';

  @override
  String get carsAvailabilityAvailable => 'Available';

  @override
  String get carsAvailabilityComingSoon => 'Coming soon';

  @override
  String get carsAvailabilityDiscontinued => 'Discontinued';

  @override
  String get carsAvailabilityNotListed => 'Not sold in this market';

  @override
  String get carsAvailabilityUnknown => 'Availability unknown';

  @override
  String carsAveragePower(String power) {
    return 'average $power';
  }

  @override
  String carsBatteryTemp(String temp) {
    return 'battery at $temp °C';
  }

  @override
  String get carsBodyConvertible => 'Convertible';

  @override
  String get carsBodyCoupe => 'Coupe';

  @override
  String get carsBodyCrossover => 'Crossover';

  @override
  String get carsBodyHatchback => 'Hatchback';

  @override
  String get carsBodyMpv => 'MPV';

  @override
  String get carsBodyOther => 'Other body';

  @override
  String get carsBodyPickup => 'Pickup';

  @override
  String get carsBodySedan => 'Sedan';

  @override
  String get carsBodySuv => 'SUV';

  @override
  String get carsBodyVan => 'Van';

  @override
  String get carsBodyWagon => 'Wagon';

  @override
  String carsBrandCountry(String country) {
    return 'Origin: $country';
  }

  @override
  String carsBrandModelsIn(String market) {
    return 'Models in $market';
  }

  @override
  String get carsBrandNoCarsInMarket => 'No models in this market';

  @override
  String get carsBrandNoCarsMessage => 'This brand has no models on sale in the selected market. Try another market.';

  @override
  String carsBrandNoCarsTitle(String market) {
    return 'No models listed in $market';
  }

  @override
  String get carsBrandNotInMarketHint => 'Shown for reference; prices and availability belong to other markets.';

  @override
  String carsBrandNotInMarketTitle(String market) {
    return 'Not sold in $market';
  }

  @override
  String get carsBrandTitle => 'Brand';

  @override
  String get carsBrandWebsite => 'Official website';

  @override
  String get carsBrandsEmptyMessage => 'Brands appear here once they are added to the catalog.';

  @override
  String get carsBrandsEmptyTitle => 'No brands yet';

  @override
  String get carsBrandsNoMatchMessage => 'Check the spelling or try another name.';

  @override
  String get carsBrandsNoMatchTitle => 'No brand found';

  @override
  String get carsBrandsNotInMarket => 'Not sold in your market';

  @override
  String get carsBrandsNotInMarketHint => 'These brands have no models listed in the selected market.';

  @override
  String get carsBrandsSearchHint => 'Search brands';

  @override
  String get carsBrandsTitle => 'Brands';

  @override
  String get carsCatalogTitle => 'Car catalog';

  @override
  String get carsChangeMarket => 'Change market';

  @override
  String get carsChargingCurve => 'Charging curve';

  @override
  String get carsChargingInlets => 'Charging ports';

  @override
  String get carsChargingNotPlugIn =>
      'This is a self-charging hybrid without a charging port, so it has no charging data.';

  @override
  String carsChargingTimeLabel(String current, String window) {
    return '$current charging ($window)';
  }

  @override
  String get carsChargingTimes => 'Charging times';

  @override
  String get carsChargingTitle => 'Charging';

  @override
  String get carsChooseVersion => 'Choose the exact version';

  @override
  String get carsChooseVersionHint => 'Specs, prices and tours below belong only to this market, year and trim.';

  @override
  String carsCompareNeedsMarket(String market) {
    return 'Not sold in $market — cannot be compared there';
  }

  @override
  String get carsConsumptionElectric => 'Electricity consumption';

  @override
  String get carsConsumptionFuel => 'Fuel consumption';

  @override
  String get carsCurrentAc => 'AC';

  @override
  String get carsCurrentDc => 'DC';

  @override
  String get carsCurveHideTable => 'Hide table';

  @override
  String get carsCurvePower => 'Power';

  @override
  String get carsCurveShowTable => 'Show as a table';

  @override
  String get carsCurveSoc => 'State of charge';

  @override
  String carsCurveSummary(String current, String peak, String from, String to) {
    return '$current charging curve: peak $peak, measured from $from to $to state of charge.';
  }

  @override
  String get carsDerivedValue => 'Calculated from another published value';

  @override
  String get carsDetailTitle => 'Car details';

  @override
  String carsDoors(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count doors', one: '1 door');
    return '$_temp0';
  }

  @override
  String get carsDriveAwd => 'All-wheel drive';

  @override
  String get carsDriveFwd => 'Front-wheel drive';

  @override
  String get carsDriveRwd => 'Rear-wheel drive';

  @override
  String carsEmptyMessage(String market) {
    return 'No cars are listed in $market yet. You can choose another market.';
  }

  @override
  String get carsEmptyTitle => 'No cars listed yet';

  @override
  String get carsEndOfList => 'You have reached the end of the list';

  @override
  String get carsFilterAny => 'Any';

  @override
  String carsFilterAtLeast(String value) {
    return 'At least $value';
  }

  @override
  String get carsFilterBody => 'Body type';

  @override
  String get carsFilterClear => 'Clear filters';

  @override
  String get carsFilterCycle => 'Test cycle';

  @override
  String get carsFilterMinRange => 'Minimum electric range';

  @override
  String get carsFilterMinRangeHint => 'Ranges are only compared within the same test cycle.';

  @override
  String get carsFilterPowertrain => 'Powertrain';

  @override
  String get carsFilterPrice => 'Local price';

  @override
  String carsFilterPriceHint(String currency, String market) {
    return 'In $currency for $market. Only local prices are compared; trims without a local price are hidden while this filter is on.';
  }

  @override
  String carsFilterPriceHintNoCurrency(String market) {
    return 'In the local currency of $market.';
  }

  @override
  String get carsFilterPriceInvalid => 'The minimum price is higher than the maximum.';

  @override
  String get carsFilterPriceMax => 'Maximum';

  @override
  String get carsFilterPriceMin => 'Minimum';

  @override
  String get carsFilterRemove => 'Remove filter';

  @override
  String get carsFilterSeats => 'Seats';

  @override
  String carsFilterSeatsAtLeast(int count) {
    return '$count+ seats';
  }

  @override
  String get carsGalleryEmptyMessage => 'Only licensed photos are published; none are available for this car yet.';

  @override
  String get carsGalleryEmptyTitle => 'No photos yet';

  @override
  String carsGalleryOf(String car) {
    return 'Photos: $car';
  }

  @override
  String carsGalleryPhoto(int index, int total) {
    return 'Photo $index of $total';
  }

  @override
  String get carsGalleryTitle => 'Photos';

  @override
  String carsInletsNeedMarket(String market) {
    return 'Ports depend on the market; this trim is not listed in $market.';
  }

  @override
  String carsLocalName(String name) {
    return 'Local name: $name';
  }

  @override
  String get carsMarket => 'Market';

  @override
  String carsMarketLine(String market, String currency) {
    return 'Prices and availability for $market ($currency)';
  }

  @override
  String carsMarketLineNoCurrency(String market) {
    return 'Prices and availability for $market';
  }

  @override
  String carsMarketSpecific(String market) {
    return 'Specific to $market';
  }

  @override
  String carsMaxPower(String power) {
    return 'up to $power';
  }

  @override
  String carsMeasuredCycle(String cycle) {
    return '$cycle cycle';
  }

  @override
  String get carsModeCity => 'City';

  @override
  String get carsModeCombined => 'Combined';

  @override
  String get carsModeHighway => 'Highway';

  @override
  String carsModelCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count models', one: '1 model');
    return '$_temp0';
  }

  @override
  String get carsModelYear => 'Model year';

  @override
  String get carsNo => 'No';

  @override
  String get carsNoArticlesMessage => 'News, reviews and guides about this car will appear here.';

  @override
  String get carsNoArticlesTitle => 'No related articles yet';

  @override
  String get carsNoCompetitorsMessage => 'Our editors have not linked competitors sold in this market yet.';

  @override
  String get carsNoCompetitorsTitle => 'No competitors listed';

  @override
  String carsNoLocalPrice(String market) {
    return 'No local price has been published for $market yet.';
  }

  @override
  String get carsNoMatchMessage => 'Try removing a filter or widening the price or range.';

  @override
  String get carsNoMatchTitle => 'No cars match these filters';

  @override
  String carsNotOfferedInMarket(String market) {
    return 'This trim is not sold in $market, so there is no local price.';
  }

  @override
  String get carsNotPreconditioned => 'battery not preconditioned';

  @override
  String get carsNotSoldAnywhere => 'Not listed in any market';

  @override
  String get carsNotSoldAnywhereMessage => 'This car is not listed in any market yet.';

  @override
  String carsNotSoldInMarketMessage(String markets) {
    return 'This car is listed in: $markets. Choose one of them to see its trims and prices.';
  }

  @override
  String get carsNotSoldInMarketTitle => 'Not sold in this market';

  @override
  String get carsNotSoldShort => 'not sold';

  @override
  String carsOnCharger(String power) {
    return 'on a $power charger';
  }

  @override
  String carsOnboardLimit(String power) {
    return 'on-board limit $power';
  }

  @override
  String get carsOpenFullSheet => 'Open the full spec sheet';

  @override
  String carsOpenModelPage(String model) {
    return 'All versions of $model';
  }

  @override
  String get carsOwnerReviewsEmptyMessage => 'Own this car? Share your real experience to help others.';

  @override
  String get carsOwnerReviewsEmptyTitle => 'No owner reviews for this trim yet';

  @override
  String get carsOwnerReviewsUnavailableMessage => 'This section opens once community reviews are enabled.';

  @override
  String get carsOwnerReviewsUnavailableTitle => 'Owner reviews are not available yet';

  @override
  String carsPeakPower(String power) {
    return 'peak $power';
  }

  @override
  String get carsPreconditioned => 'battery preconditioned';

  @override
  String get carsPriceCurrent => 'Current';

  @override
  String carsPriceFrom(String price) {
    return 'From $price';
  }

  @override
  String carsPriceHistory(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Price history ($count entries)',
      one: 'Price history (1 entry)',
    );
    return '$_temp0';
  }

  @override
  String carsPriceIn(String market) {
    return 'Price in $market';
  }

  @override
  String carsPricePeriod(String from, String to) {
    return '$from – $to';
  }

  @override
  String carsPriceSince(String date) {
    return 'Since $date';
  }

  @override
  String get carsRangeAndConsumption => 'Range & consumption';

  @override
  String get carsRangeCycleExplainer =>
      'Each figure is shown with its test cycle (WLTP, EPA, CLTC…). Cycles are never converted into one another; real-world range is usually lower.';

  @override
  String carsRatingOutOfFive(String rating) {
    return '$rating out of 5';
  }

  @override
  String carsResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count cars', one: '1 car');
    return '$_temp0';
  }

  @override
  String carsReviewCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count reviews', one: '1 review');
    return '$_temp0';
  }

  @override
  String get carsSearchHint => 'Search brand, model or trim';

  @override
  String get carsSeatDriver => 'Driver seat';

  @override
  String get carsSeatPassenger => 'Front passenger';

  @override
  String get carsSeatRear => 'Rear seats';

  @override
  String get carsSeatThirdRow => 'Third row';

  @override
  String get carsSeatTrunk => 'Trunk';

  @override
  String carsSeats(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count seats', one: '1 seat');
    return '$_temp0';
  }

  @override
  String get carsShareFailed => 'Could not open sharing.';

  @override
  String carsSoldIn(String markets) {
    return 'Sold in: $markets';
  }

  @override
  String get carsSortName => 'Name';

  @override
  String get carsSortNewest => 'Newest';

  @override
  String get carsSortPriceAsc => 'Price: low to high';

  @override
  String get carsSortPriceDesc => 'Price: high to low';

  @override
  String get carsSortRange => 'Longest range';

  @override
  String get carsSourceAccessedAt => 'Accessed on';

  @override
  String get carsSourceDocumentDate => 'Document date';

  @override
  String get carsSourceOpen => 'Open source';

  @override
  String get carsSourcePublisher => 'Publisher';

  @override
  String get carsSourceTitle => 'Data source';

  @override
  String get carsSourceVerifiedAt => 'Verified on';

  @override
  String get carsSourcesTitle => 'Sources';

  @override
  String get carsSpecsOnlyAvailable => 'Hide unavailable values';

  @override
  String get carsSpecsOnlyAvailableHint => 'Missing values are shown as “Not available”, never as 0.';

  @override
  String get carsSpecsRemoveOffline => 'Remove offline copy';

  @override
  String get carsSpecsRemovedOffline => 'Offline copy removed';

  @override
  String get carsSpecsSaveOffline => 'Save specs offline';

  @override
  String get carsSpecsSavedOffline => 'Specs saved for offline reading';

  @override
  String carsSpecsSavedOn(String time) {
    return 'Saved on $time';
  }

  @override
  String carsStarsCount(int stars, int count) {
    return '$stars stars: $count';
  }

  @override
  String get carsStatAcMax => 'AC charging';

  @override
  String get carsStatAccel => '0–100 km/h';

  @override
  String get carsStatBattery => 'Battery';

  @override
  String get carsStatDcPeak => 'DC peak';

  @override
  String get carsStatElectricRange => 'Electric range';

  @override
  String get carsStatPower => 'Power';

  @override
  String get carsStatRange => 'Range';

  @override
  String get carsStatUsableBattery => 'Usable battery';

  @override
  String get carsTabCompetitors => 'Competitors';

  @override
  String get carsTabNews => 'News & reviews';

  @override
  String get carsTabOverview => 'Overview';

  @override
  String get carsTabOwners => 'Owner reviews';

  @override
  String get carsTabSpecs => 'Specifications';

  @override
  String get carsTabTours => '360° tour';

  @override
  String get carsTableReliability => 'Reliability';

  @override
  String get carsTableSource => 'Source';

  @override
  String get carsTableSpec => 'Specification';

  @override
  String get carsTableValue => 'Value';

  @override
  String carsTourInterior(String color) {
    return 'Interior: $color';
  }

  @override
  String get carsTourOpen => 'Start the tour';

  @override
  String carsTourReference(String trim) {
    return 'Photographed in a similar trim: $trim';
  }

  @override
  String carsTourSeats(String seats) {
    return 'Views: $seats';
  }

  @override
  String get carsTourTitle => '360° interior tour';

  @override
  String get carsTourUnavailable => 'The interior tour is not available for this trim';

  @override
  String get carsTourUnavailableHint =>
      'We only publish tours photographed in real cars. You can browse the licensed photos instead.';

  @override
  String get carsToursDisabled => 'Interior tours are not available right now';

  @override
  String get carsTrim => 'Trim';

  @override
  String carsTrimCode(String code) {
    return 'Code $code';
  }

  @override
  String carsTrimCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count trims', one: '1 trim');
    return '$_temp0';
  }

  @override
  String get carsUnitInch => 'in';

  @override
  String get carsUnitLitersPer100 => 'L/100 km';

  @override
  String get carsVariantTitle => 'Trim details';

  @override
  String get carsVerifiedOwner => 'Verified owner';

  @override
  String carsVerifiedOwners(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count verified owners',
      one: '1 verified owner',
    );
    return '$_temp0';
  }

  @override
  String carsViewingTrim(String trim, String market) {
    return 'Showing $trim in $market';
  }

  @override
  String carsWheelSize(String size) {
    return '$size wheels';
  }

  @override
  String get carsWriteReview => 'Write a review';

  @override
  String carsYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count years', one: '1 year');
    return '$_temp0';
  }

  @override
  String get carsYes => 'Yes';

  @override
  String get chargingAccessRestrictions => 'Restrictions';

  @override
  String get chargingAccessSection => 'Access';

  @override
  String get chargingAccessType => 'Access';

  @override
  String get chargingAddressUnknown => 'Address not available';

  @override
  String get chargingAmenities => 'Nearby amenities';

  @override
  String chargingAreaAround(String place, String radius) {
    return 'Around $place · $radius';
  }

  @override
  String get chargingAreaVisibleMap => 'Visible map area';

  @override
  String get chargingAttribution => 'Attribution';

  @override
  String get chargingAvailAvailable => 'Connector free now';

  @override
  String chargingAvailCounts(String available, String occupied, String outOfOrder, String unknown) {
    return 'Free: $available · In use: $occupied · Out of order: $outOfOrder · Unknown: $unknown';
  }

  @override
  String get chargingAvailExpiredExplain => 'The last live reading has expired, so it is not shown as available.';

  @override
  String chargingAvailLastReading(String time) {
    return 'Last reading $time — expired, so the current state is uncertain.';
  }

  @override
  String get chargingAvailNotLiveOffline => 'No live status (saved data)';

  @override
  String chargingAvailObserved(String time) {
    return 'Reading from $time';
  }

  @override
  String get chargingAvailOccupied => 'All in use';

  @override
  String get chargingAvailOutOfOrder => 'Out of order';

  @override
  String chargingAvailSource(String source) {
    return 'Source: $source';
  }

  @override
  String get chargingAvailUncertain => 'Uncertain (reading expired)';

  @override
  String get chargingAvailUnknown => 'Availability unknown';

  @override
  String chargingAvailValidUntil(String time) {
    return 'valid until $time';
  }

  @override
  String get chargingCheckInCar => 'Your car';

  @override
  String get chargingCheckInComment => 'Comment';

  @override
  String get chargingCheckInConnector => 'Connector used';

  @override
  String get chargingCheckInHowWasIt => 'How did it go?';

  @override
  String get chargingCheckInIntro =>
      'Share how charging went. It appears with its date as community data, not as live status.';

  @override
  String get chargingCheckInNoCar => 'Don\'t add a car';

  @override
  String get chargingCheckInPending => 'Thanks! Your comment will appear after review.';

  @override
  String get chargingCheckInPower => 'Power you saw';

  @override
  String get chargingCheckInPublicNote =>
      'Your check-in is shown without your name. Comments with links are reviewed first.';

  @override
  String get chargingCheckInSentMessage => 'Thanks! It now appears on the station page with today\'s date.';

  @override
  String get chargingCheckInSentTitle => 'Check-in saved';

  @override
  String get chargingCheckInShort => 'Check in';

  @override
  String get chargingCheckInSignIn => 'Sign in to check in, so others can trust community data.';

  @override
  String get chargingCheckInTitle => 'Check in';

  @override
  String get chargingCheckInWait => 'Waiting time';

  @override
  String get chargingCheckins30d => 'Check-ins (30 days)';

  @override
  String get chargingChoosePlace => 'Choose a place';

  @override
  String get chargingCityListNote =>
      'Cities set only the centre of the search. Which stations exist comes from the station database.';

  @override
  String get chargingCitySearchHint => 'Search cities';

  @override
  String get chargingClearFilters => 'Clear filters';

  @override
  String get chargingClosedNow => 'Closed now';

  @override
  String chargingClosesAt(String time) {
    return 'Closes at $time (station time)';
  }

  @override
  String chargingClusterSemantics(int count) {
    return '$count stations here, tap to zoom in';
  }

  @override
  String get chargingCommunityDisclaimer =>
      'Check-ins and reports are dated community data, not an official live status.';

  @override
  String get chargingCommunityEmpty => 'No check-ins or reports yet. Tell others how your visit went.';

  @override
  String get chargingCommunitySection => 'Community reports and check-ins';

  @override
  String chargingCompatBestPower(String power) {
    return 'Up to $power with your car';
  }

  @override
  String chargingCompatIgnored(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count unverified inlet records were not used.',
      one: '1 unverified inlet record was not used.',
    );
    return '$_temp0';
  }

  @override
  String get chargingCompatNoAdapters => 'Based on the same plug type and current only. No adapter is recommended.';

  @override
  String get chargingCompatNoGuess => 'The station is shown without a compatibility guess.';

  @override
  String chargingCompatNone(String car) {
    return 'No connector here matches the verified charging inlets of $car.';
  }

  @override
  String chargingCompatNotice(String car) {
    return 'Showing connectors compatible with $car, based on verified inlet data only.';
  }

  @override
  String get chargingCompatSection => 'Compatibility with your car';

  @override
  String chargingCompatSome(String car, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count connectors match $car.',
      one: '1 connector matches $car.',
    );
    return '$_temp0';
  }

  @override
  String get chargingCompatUnknownShort => 'No verified charging data for this car';

  @override
  String get chargingCompatUnknownTitle => 'Compatibility can\'t be checked';

  @override
  String chargingCompatibleConnectors(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count compatible connectors',
      one: '1 compatible connector',
    );
    return '$_temp0';
  }

  @override
  String get chargingConnectorCompatible => 'Compatible';

  @override
  String chargingConnectorCompatibleUpTo(String power) {
    return 'Compatible up to $power';
  }

  @override
  String get chargingConnectorNotCompatible => 'Not compatible';

  @override
  String get chargingConnectorType => 'Connector type';

  @override
  String get chargingConnectorsSection => 'Chargers and connectors';

  @override
  String get chargingContactSection => 'Contact';

  @override
  String get chargingCurrentAc => 'AC';

  @override
  String get chargingCurrentDc => 'DC';

  @override
  String get chargingCurrentTypes => 'Current';

  @override
  String get chargingDataSource => 'Source';

  @override
  String get chargingDayClosed => 'Closed';

  @override
  String get chargingDayFri => 'Friday';

  @override
  String get chargingDayMon => 'Monday';

  @override
  String get chargingDaySat => 'Saturday';

  @override
  String get chargingDaySun => 'Sunday';

  @override
  String get chargingDayThu => 'Thursday';

  @override
  String get chargingDayTue => 'Tuesday';

  @override
  String get chargingDayUnknown => 'Unknown';

  @override
  String get chargingDayWed => 'Wednesday';

  @override
  String get chargingDefaultPlaceHint =>
      'Showing the default city of your country. Use your location or choose another place.';

  @override
  String get chargingDemoNoDirections => 'This is a demo station, not a real place.';

  @override
  String get chargingDemoNotRealPlace => 'Demo station for testing — not a real place. Do not drive here.';

  @override
  String get chargingDirections => 'Directions';

  @override
  String get chargingDirectionsNote =>
      'Opens a navigation app with the station\'s coordinates. Check access and opening hours before you go.';

  @override
  String get chargingDistance => 'Distance';

  @override
  String chargingDistanceAway(String distance) {
    return '$distance away';
  }

  @override
  String chargingDistanceMeters(String meters) {
    return '$meters m';
  }

  @override
  String get chargingEmail => 'Email';

  @override
  String get chargingEmptyFilteredMessage =>
      'No station matches these filters here. Try clearing some filters or searching a wider area.';

  @override
  String get chargingEmptyMessage =>
      'No published stations were found in this area. Coverage of any country is not complete — you can suggest a station you know.';

  @override
  String get chargingEmptyTitle => 'No stations here';

  @override
  String chargingEndOfResults(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count stations in total',
      one: '1 station in total',
    );
    return '$_temp0';
  }

  @override
  String get chargingEntrance => 'Entrance';

  @override
  String chargingFetchedAt(String time) {
    return 'Loaded $time';
  }

  @override
  String get chargingFilterAmenities => 'Nearby amenities';

  @override
  String get chargingFilterAmenitiesHelp => 'Stations must have all selected amenities.';

  @override
  String get chargingFilterAny => 'Any';

  @override
  String get chargingFilterAvailability => 'Hours and access';

  @override
  String get chargingFilterConnectors => 'Connector types';

  @override
  String get chargingFilterConnectorsHelp => 'One connector must match the type, current and power together.';

  @override
  String get chargingFilterCurrent => 'Current type';

  @override
  String get chargingFilterMetaUnavailable => 'Connector list is not available right now.';

  @override
  String get chargingFilterMinPower => 'Minimum power';

  @override
  String get chargingFilterMinPowerHelp => 'Connectors with unknown power are not included.';

  @override
  String get chargingFilterOpenNow => 'Open now';

  @override
  String get chargingFilterOpenNowHelp => 'By published opening hours. Stations with unknown hours are hidden.';

  @override
  String get chargingFilterOperator => 'Operator';

  @override
  String get chargingFilterOperatorHelp => 'From the stations loaded in this area.';

  @override
  String chargingFilterPowerAtLeast(String power) {
    return '$power+';
  }

  @override
  String get chargingFilterPublicOnly => 'Public access only';

  @override
  String get chargingFilterVehicle => 'Compatible with my car';

  @override
  String get chargingFilterVehicleAddCar => 'Add a car to my garage';

  @override
  String get chargingFilterVehicleHelp =>
      'Uses verified charging-inlet data of your car in its market. Plug shape alone is never treated as compatible, and adapters are never assumed.';

  @override
  String get chargingFilterVehicleNone => 'Any car';

  @override
  String get chargingFilterVehicleNotInMarket => 'Not listed in this car\'s market — compatibility may be unknown';

  @override
  String get chargingFilterVehicleSignIn => 'Sign in to use a car from your garage';

  @override
  String get chargingFiltersTitle => 'Station filters';

  @override
  String chargingFloor(String floor) {
    return 'Floor $floor';
  }

  @override
  String get chargingFormatCable => 'attached cable';

  @override
  String get chargingFormatSocket => 'socket (bring your cable)';

  @override
  String chargingGraceMinutes(String minutes) {
    return 'after $minutes min grace';
  }

  @override
  String chargingHoursAsPublished(String text) {
    return 'As published by the source: $text';
  }

  @override
  String get chargingHoursNotPublished => 'Opening hours are not published.';

  @override
  String get chargingHoursSection => 'Opening hours';

  @override
  String get chargingHoursTextOnly => 'Hours are published as text only — see below.';

  @override
  String chargingHoursTimezoneNote(String zone) {
    return 'Times are in the station\'s time zone ($zone).';
  }

  @override
  String get chargingHoursUnknown => 'Hours unknown';

  @override
  String get chargingInvalidPower => 'Enter a power between 0 and 1000 kW.';

  @override
  String get chargingInvalidWait => 'Enter minutes between 0 and 1440.';

  @override
  String get chargingLastSynced => 'Last synced';

  @override
  String get chargingLastVerified => 'Last verified';

  @override
  String get chargingLatitude => 'Latitude';

  @override
  String get chargingLicense => 'Licence';

  @override
  String get chargingLocationDenied => 'Location permission was not given. You can choose a place instead.';

  @override
  String get chargingLocationDeniedForever =>
      'Location access is turned off for this app. Turn it on in settings, or choose a city or a point instead.';

  @override
  String get chargingLocationPrivacy => 'Asked only now, used while you use the app, never saved.';

  @override
  String get chargingLocationServiceOff =>
      'Location services are off on this device. Turn them on, or choose a city or a point instead.';

  @override
  String get chargingLocationTitle => 'Choose a place';

  @override
  String get chargingLocationUnavailable => 'Your location could not be determined. Choose a place instead.';

  @override
  String get chargingLogsEditTitle => 'Edit charging session';

  @override
  String get chargingLogsNewTitle => 'New charging session';

  @override
  String get chargingLogsReportsTitle => 'Spending & consumption';

  @override
  String get chargingLogsTitle => 'Charging log';

  @override
  String get chargingLongitude => 'Longitude';

  @override
  String get chargingMapNotConfigured => 'The map is not configured yet, so stations are shown as a list.';

  @override
  String chargingMapSemantics(int count) {
    return 'Charging stations map, $count stations';
  }

  @override
  String get chargingMaxPower => 'Max power';

  @override
  String get chargingMergedMessage => 'It was a duplicate of another station and its details now live there.';

  @override
  String get chargingMergedTitle => 'This station was merged';

  @override
  String get chargingMinutesUnit => 'min';

  @override
  String get chargingNavApple => 'Apple Maps';

  @override
  String get chargingNavFailed => 'No app could open the directions.';

  @override
  String get chargingNavGoogle => 'Google Maps';

  @override
  String get chargingNavSystem => 'Choose a navigation app';

  @override
  String get chargingNavWaze => 'Waze';

  @override
  String get chargingNavWeb => 'Open in web map';

  @override
  String get chargingNearMe => 'Near me';

  @override
  String get chargingNoCityMatch => 'No city matches';

  @override
  String get chargingNoConnectorData => 'No connector data is available.';

  @override
  String get chargingNoLiveProvider =>
      'Live availability is shown only from a connected live source. None is connected yet, so it shows as unknown.';

  @override
  String get chargingNoLiveSourceForStation =>
      'No live data source is connected for this station, so availability is unknown. Community check-ins below are not live.';

  @override
  String get chargingNoStationsHere => 'No stations found in this area';

  @override
  String get chargingNoneStated => 'None stated by the source';

  @override
  String get chargingNotCompatible => 'No compatible connector';

  @override
  String get chargingNotSure => 'Not sure';

  @override
  String chargingObservedPower(String power) {
    return '$power observed';
  }

  @override
  String get chargingOfflineNoLive => 'This is saved data. Live status is never shown from saved data.';

  @override
  String get chargingOpOperational => 'Operational';

  @override
  String get chargingOpPermanentlyClosed => 'Permanently closed';

  @override
  String get chargingOpPlanned => 'Planned';

  @override
  String get chargingOpTemporarilyUnavailable => 'Temporarily unavailable';

  @override
  String get chargingOpUnknown => 'Operation status unknown';

  @override
  String get chargingOpen24h => 'Open 24 hours';

  @override
  String get chargingOpenMerged => 'Open the station';

  @override
  String get chargingOpenNow => 'Open now';

  @override
  String get chargingOpenNowFromSaved => 'Worked out on this device from the saved opening hours.';

  @override
  String get chargingOpenReports => 'Open reports';

  @override
  String get chargingOpenSource => 'Open the source';

  @override
  String chargingOpensAt(String time) {
    return 'Opens $time (station time)';
  }

  @override
  String get chargingOptional => 'optional';

  @override
  String get chargingParking => 'Parking';

  @override
  String get chargingPaymentMethods => 'Payment';

  @override
  String chargingPhases(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count-phase', one: 'single-phase');
    return '$_temp0';
  }

  @override
  String get chargingPhone => 'Phone';

  @override
  String get chargingPhoto => 'Station photo';

  @override
  String chargingPickPointHint(String lat, String lng) {
    return 'Pin at $lat, $lng. Move the map to adjust.';
  }

  @override
  String get chargingPickPointSubtitle => 'Move the map to place the pin, then search around it.';

  @override
  String get chargingPickPointTitle => 'Pick a point on the map';

  @override
  String chargingPlaceDefaultCity(String city) {
    return '$city (default)';
  }

  @override
  String get chargingPlaceMapPoint => 'Chosen point';

  @override
  String get chargingPlaceMarker => 'Chosen search point';

  @override
  String get chargingPlaceNearYou => 'Near you';

  @override
  String chargingPlugCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count connectors', one: '1 connector');
    return '$_temp0';
  }

  @override
  String get chargingPlugsNotCars =>
      'The number of connectors is not the number of cars that can charge at the same time.';

  @override
  String chargingPointCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count chargers', one: '1 charger');
    return '$_temp0';
  }

  @override
  String get chargingPointCountUnknown => 'Number of chargers not available';

  @override
  String get chargingPointUnnamed => 'Charger';

  @override
  String chargingPowerRange(String min, String max) {
    return '$min–$max';
  }

  @override
  String get chargingPowerUnknown => 'Power not available';

  @override
  String get chargingPriceNotAvailable => 'Prices are not available for this station.';

  @override
  String get chargingPricesSection => 'Prices';

  @override
  String chargingQuantity(int count) {
    return '×$count';
  }

  @override
  String get chargingQuickDc => 'Fast DC';

  @override
  String get chargingQuickMyCar => 'Fits my car';

  @override
  String chargingQuickMyCarNamed(String name) {
    return 'Fits $name';
  }

  @override
  String get chargingRecentCheckins => 'Recent check-ins';

  @override
  String get chargingRecentReports => 'Reports (last 90 days)';

  @override
  String get chargingRemove => 'Remove';

  @override
  String get chargingRemoveCarFilter => 'Remove car filter';

  @override
  String get chargingReportDetails => 'Details';

  @override
  String get chargingReportDetailsHint => 'What did you see? When?';

  @override
  String get chargingReportDetailsRequired => 'Please describe the problem.';

  @override
  String get chargingReportIntro =>
      'Tell us what is wrong. Moderators review every report; it does not change the station by itself.';

  @override
  String get chargingReportModeration => 'Reports are anonymous on the station page (type, status and date only).';

  @override
  String get chargingReportNewPrice => 'Price you saw';

  @override
  String get chargingReportNewPriceHint => 'e.g. price per kWh as shown at the charger';

  @override
  String get chargingReportSeenConnector => 'Connector you found on site';

  @override
  String get chargingReportSentMessage => 'Moderators will review it. You can follow it under your reports.';

  @override
  String get chargingReportSentTitle => 'Thanks for your report';

  @override
  String get chargingReportShort => 'Report';

  @override
  String get chargingReportSignIn => 'Sign in to report a problem, so moderators can review it and prevent abuse.';

  @override
  String get chargingReportStatusInReview => 'In review';

  @override
  String get chargingReportStatusOpen => 'Open';

  @override
  String get chargingReportStatusRejected => 'Rejected';

  @override
  String get chargingReportStatusResolved => 'Resolved';

  @override
  String get chargingReportTitle => 'Report a problem';

  @override
  String get chargingReportWhat => 'What is the problem?';

  @override
  String get chargingReportWhichConnector => 'Which connector?';

  @override
  String chargingResultsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count stations', one: '1 station');
    return '$_temp0';
  }

  @override
  String chargingResultsTruncated(int count) {
    return '$count stations shown — zoom in to see all';
  }

  @override
  String get chargingSavedCopy => 'Saved';

  @override
  String get chargingSearchHereAction => 'Search here';

  @override
  String get chargingSearchHereMessage =>
      'Stations will be listed around the point you picked, with distances from it.';

  @override
  String get chargingSearchHereTitle => 'Search around this point?';

  @override
  String get chargingSearchHint => 'Search stations, operators or cities';

  @override
  String get chargingSearchThisArea => 'Search this area';

  @override
  String get chargingSearching => 'Searching for stations…';

  @override
  String get chargingSend => 'Send';

  @override
  String get chargingServicesSection => 'Payment and services';

  @override
  String get chargingSignInAgain => 'Your session ended. Sign in again to send this.';

  @override
  String get chargingSourceCsv => 'Imported file';

  @override
  String get chargingSourceManual => 'Added by the editorial team';

  @override
  String get chargingSourceOcm => 'Open Charge Map';

  @override
  String get chargingSourcePartner => 'Partner data';

  @override
  String get chargingSourceSection => 'Data source and licence';

  @override
  String get chargingSourceUpdated => 'Updated at source';

  @override
  String get chargingSourceUserSuggestion => 'Suggested by a user, reviewed';

  @override
  String get chargingStartMethods => 'How to start charging';

  @override
  String chargingStationTimezone(String zone) {
    return 'Station time zone: $zone';
  }

  @override
  String get chargingStationTitle => 'Station details';

  @override
  String get chargingStatusLive => 'Live availability';

  @override
  String get chargingStatusOpenNow => 'Opening hours now';

  @override
  String get chargingStatusOperational => 'Operation';

  @override
  String get chargingStatusSection => 'Status now';

  @override
  String chargingStepSize(String step) {
    return 'billed in steps of $step';
  }

  @override
  String get chargingSuccessRate => 'Charged successfully';

  @override
  String get chargingSuccessRateNeedsMore => 'A success rate is shown after at least 3 check-ins.';

  @override
  String get chargingSuggestAddConnector => 'Add a connector';

  @override
  String get chargingSuggestAddress => 'Address or landmark';

  @override
  String get chargingSuggestCity => 'City';

  @override
  String chargingSuggestConnectorN(int number) {
    return 'Connector $number';
  }

  @override
  String get chargingSuggestConnectorTypeRequired => 'Choose a type or remove this connector.';

  @override
  String get chargingSuggestConnectors => 'Connectors';

  @override
  String get chargingSuggestCoordInvalid => 'Out of range';

  @override
  String get chargingSuggestCoordRequired => 'Required';

  @override
  String get chargingSuggestCountry => 'Country';

  @override
  String get chargingSuggestHours => 'Opening hours';

  @override
  String get chargingSuggestHoursHint => 'e.g. every day 08:00–22:00';

  @override
  String get chargingSuggestIntro =>
      'Know a station that is missing? Add what you know — a moderator checks it before it appears on the map.';

  @override
  String get chargingSuggestLocation => 'Location of the station';

  @override
  String get chargingSuggestLocationHelp =>
      'Use your location while you are at the station, pick it on the map, or type coordinates.';

  @override
  String get chargingSuggestMayExist => 'These nearby stations may be the same one:';

  @override
  String get chargingSuggestName => 'Station name';

  @override
  String get chargingSuggestNameRequired => 'Enter the station name.';

  @override
  String get chargingSuggestNotes => 'Notes for the reviewer';

  @override
  String get chargingSuggestOperator => 'Operator';

  @override
  String get chargingSuggestPickTitle => 'Pick on the map';

  @override
  String get chargingSuggestQuantity => 'How many';

  @override
  String get chargingSuggestReviewNote => 'Nothing is published until a moderator reviews it.';

  @override
  String get chargingSuggestSentMessage => 'Thanks! A moderator will review it before it appears on the map.';

  @override
  String get chargingSuggestSentTitle => 'Suggestion sent';

  @override
  String get chargingSuggestSignIn => 'Sign in to suggest a station. Suggestions are reviewed before they appear.';

  @override
  String get chargingSuggestTitle => 'Suggest a station';

  @override
  String get chargingSuggestUseMyLocation => 'I\'m at the station';

  @override
  String get chargingSuggestUsePoint => 'Use this point';

  @override
  String chargingTariffAppliesTo(String connector) {
    return 'Applies to: $connector';
  }

  @override
  String get chargingTariffNotCurrent => 'Not current';

  @override
  String get chargingTariffUnnamed => 'Tariff';

  @override
  String get chargingTaxExcluded => 'Taxes not included';

  @override
  String chargingTaxExcludedPct(String percent) {
    return 'Taxes not included ($percent%)';
  }

  @override
  String get chargingTaxIncluded => 'Taxes included';

  @override
  String chargingTaxIncludedPct(String percent) {
    return 'Taxes included ($percent%)';
  }

  @override
  String get chargingTaxUnknown => 'Taxes: not stated';

  @override
  String get chargingTitle => 'Charging stations';

  @override
  String get chargingToday => 'today';

  @override
  String get chargingTruncatedHint => 'Many stations match here. Zoom in or add filters to see them all.';

  @override
  String get chargingUnassignedConnectors => 'Connectors';

  @override
  String get chargingUnassignedConnectorsHelp => 'The source does not say which charger each connector belongs to.';

  @override
  String get chargingUsageCostNote => 'Shown as published; not verified or converted.';

  @override
  String get chargingUsageCostTitle => 'Price as published by the source';

  @override
  String get chargingUseMyLocation => 'Use my location';

  @override
  String chargingValidFrom(String date) {
    return 'From $date';
  }

  @override
  String chargingValidTo(String date) {
    return 'until $date';
  }

  @override
  String get chargingViewList => 'List';

  @override
  String get chargingViewMap => 'Map';

  @override
  String chargingWaited(String time) {
    return 'waited $time';
  }

  @override
  String get chargingWebsite => 'Website';

  @override
  String get chargingWholeStation => 'The whole station';

  @override
  String get chargingWidenSearch => 'Search within 100 km';

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
  String compareAboutRow(String label) {
    return 'About “$label”';
  }

  @override
  String compareAddCarCount(int count, int max) {
    return 'Add a car ($count of $max)';
  }

  @override
  String get compareAddCarHint => 'Brand, model, year, trim and market';

  @override
  String compareAddCarSlot(int number) {
    return 'Add car $number';
  }

  @override
  String get compareAlreadySaved => 'This comparison is already saved in your account';

  @override
  String compareAlternativesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '+$count other values',
      one: '+1 other value',
    );
    return '$_temp0';
  }

  @override
  String get compareAlternativesExplainer =>
      'Values on other cycles, charge windows or wheel sizes are listed for reference and never mixed into the comparison.';

  @override
  String get compareAvailabilityAvailable => 'Available';

  @override
  String get compareAvailabilityComingSoon => 'Coming soon';

  @override
  String get compareAvailabilityDiscontinued => 'Discontinued';

  @override
  String get compareAvailabilityUnknown => 'Availability not available';

  @override
  String get compareBest => 'Best';

  @override
  String get compareBestInRow => 'Best in this row';

  @override
  String get compareBodyCoupe => 'Coupe';

  @override
  String get compareBodyCrossover => 'Crossover';

  @override
  String get compareBodyHatchback => 'Hatchback';

  @override
  String get compareBodyMpv => 'MPV';

  @override
  String get compareBodyPickup => 'Pickup';

  @override
  String get compareBodySedan => 'Sedan';

  @override
  String get compareBodySuv => 'SUV';

  @override
  String get compareBodyVan => 'Van';

  @override
  String get compareBodyWagon => 'Wagon';

  @override
  String compareCarActions(String car) {
    return 'Options for $car';
  }

  @override
  String compareCarNumbered(int number, String car) {
    return 'Car $number: $car';
  }

  @override
  String get compareChangeCar => 'Change trim, year or market';

  @override
  String compareChargerPower(String power) {
    return '$power charger';
  }

  @override
  String compareComparedOn(String basis) {
    return 'Compared on: $basis';
  }

  @override
  String get compareConvertedEstimate => 'Estimate after conversion';

  @override
  String compareCopiedToTray(String count) {
    return '$count cars copied to Compare';
  }

  @override
  String get compareCurrentAc => 'AC';

  @override
  String get compareCurrentDc => 'DC';

  @override
  String compareDecidedRows(String decided, String total) {
    return 'Rows with a winner: $decided of $total';
  }

  @override
  String get compareDeleteSaved => 'Delete';

  @override
  String compareDeleteSavedMessage(String title) {
    return '“$title” will be removed from your account. Links you shared will stop working.';
  }

  @override
  String get compareDeleteSavedTitle => 'Delete this comparison?';

  @override
  String get compareDeleted => 'Comparison deleted';

  @override
  String get compareDerived => 'Calculated from another published value';

  @override
  String get compareDetailsAlternatives => 'Other published values';

  @override
  String get compareDetailsBasis => 'Measured on';

  @override
  String get compareDetailsCar => 'Car';

  @override
  String get compareDetailsConditions => 'Test conditions';

  @override
  String get compareDetailsDerivation => 'How it was obtained';

  @override
  String get compareDetailsDocumentDate => 'Document date';

  @override
  String get compareDetailsNote => 'Note';

  @override
  String get compareDetailsPublished => 'Published value';

  @override
  String get compareDetailsValue => 'Value';

  @override
  String get compareDifferencesOnly => 'Differences only';

  @override
  String get compareDifferencesOnlyHint => 'Hide rows where every car has the same value';

  @override
  String get compareDirectionHigher => 'Higher is better';

  @override
  String get compareDirectionLower => 'Lower is better';

  @override
  String get compareDirectionNone => 'No “better” value — depends on your needs';

  @override
  String get compareDisclosureFallback =>
      'Results are computed from catalog data only. Ads and sponsorships never change them.';

  @override
  String compareEditCars(int count) {
    return 'Cars ($count)';
  }

  @override
  String get compareEditCarsTitle => 'Cars in this comparison';

  @override
  String get compareEditInCompare => 'Edit in Compare';

  @override
  String get compareFactorAc => 'AC charging';

  @override
  String get compareFactorDc => 'DC fast charging';

  @override
  String get compareFactorEfficiency => 'Energy efficiency';

  @override
  String get compareFactorPerformance => 'Acceleration';

  @override
  String get compareFactorPrice => 'Price';

  @override
  String get compareFactorRange => 'Electric range';

  @override
  String get compareFactorSpace => 'Trunk space';

  @override
  String compareFavoriteSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count cars', one: '1 car');
    return '$_temp0';
  }

  @override
  String get compareFeaturedTitle => 'Curated comparisons';

  @override
  String compareGeneratedAt(String time) {
    return 'Calculated $time';
  }

  @override
  String get compareGoToCompare => 'Start a new comparison';

  @override
  String get compareHeaderSpec => 'Specification';

  @override
  String get compareIntroMessage =>
      'Pick each car by model year, trim and market. Figures are compared only when they were measured the same way.';

  @override
  String get compareIntroRuleCycles =>
      'Ranges are compared on the same test cycle only (WLTP, EPA, CLTC or NEDC), never converted.';

  @override
  String get compareIntroRuleMandatory => 'Year, trim and market are required for every car.';

  @override
  String get compareIntroRuleMissing => 'A missing value is shown as “Not available”, never as 0 or a win.';

  @override
  String get compareIntroTitle => 'Compare 2 to 4 cars side by side';

  @override
  String get compareKindCurated => 'Curated by the editors';

  @override
  String get compareKindMine => 'Saved in your account';

  @override
  String get compareKindSaved => 'Saved comparison';

  @override
  String get compareKindShared => 'Shared link';

  @override
  String get compareLegendBest => 'Shown only when every value is available and measured the same way.';

  @override
  String get compareLegendButton => 'What do the labels mean?';

  @override
  String get compareLegendTitle => 'How cars are compared';

  @override
  String get compareLoading => 'Loading the comparison…';

  @override
  String compareMissingRows(String count) {
    return 'Missing data: $count';
  }

  @override
  String get compareModeChargeDepleting => 'Charge depleting';

  @override
  String get compareModeChargeSustaining => 'Charge sustaining';

  @override
  String get compareModeCity => 'City';

  @override
  String get compareModeCombined => 'Combined';

  @override
  String get compareModeHighway => 'Highway';

  @override
  String get compareModeWeighted => 'Weighted';

  @override
  String get compareMoveDown => 'Move down';

  @override
  String get compareMoveUp => 'Move up';

  @override
  String get compareNo => 'No';

  @override
  String get compareNoDifferencesMessage =>
      'These cars show the same values in this view. Turn off “Differences only” to see every row.';

  @override
  String get compareNoRowsMessage => 'There is no data for this view yet.';

  @override
  String get compareNoRowsTitle => 'No rows to show';

  @override
  String get compareNotApplicable => 'Not applicable';

  @override
  String compareNotComparableRows(String count) {
    return 'Not comparable: $count';
  }

  @override
  String get compareOpenCar => 'Open car page';

  @override
  String get compareOpenSource => 'Open source';

  @override
  String compareOriginalValue(String value) {
    return 'Published as $value';
  }

  @override
  String get compareOutcomeTie => 'Equal — no winner';

  @override
  String comparePickerAdded(String car) {
    return '$car added to the comparison';
  }

  @override
  String get comparePickerAllMarkets => 'Include trims from other markets';

  @override
  String get comparePickerAllMarketsHint =>
      'Useful to compare the same car across countries. Prices stay in each market\'s currency.';

  @override
  String get comparePickerAlreadyIn => 'This trim and market are already in the comparison';

  @override
  String get comparePickerBack => 'Back';

  @override
  String get comparePickerBrowseMarket => 'Browse cars sold in';

  @override
  String get comparePickerChooseBrand => 'Choose the brand';

  @override
  String get comparePickerChooseMarket => 'Choose the market';

  @override
  String get comparePickerChooseModel => 'Choose the model';

  @override
  String get comparePickerChooseTrim => 'Choose the trim';

  @override
  String get comparePickerChooseYear => 'Choose the model year';

  @override
  String comparePickerCurrency(String currency) {
    return 'Prices in $currency';
  }

  @override
  String get comparePickerEmptyMessage =>
      'No published cars match in this market yet. Try including other markets or go back.';

  @override
  String get comparePickerEmptyMessageAll => 'No published cars match yet. Go back and choose again.';

  @override
  String get comparePickerEmptyTitle => 'Nothing to choose here';

  @override
  String get comparePickerMarketHint => 'Price, availability and charging inlets are taken from this market.';

  @override
  String get comparePickerNoMatch => 'No match for your search';

  @override
  String comparePickerProgress(int step, int total) {
    return 'Step $step of $total';
  }

  @override
  String get comparePickerReplaceTitle => 'Change car';

  @override
  String comparePickerReplaced(String car) {
    return 'Replaced with $car';
  }

  @override
  String get comparePickerSearchBrand => 'Search brands';

  @override
  String get comparePickerSearchModel => 'Search models';

  @override
  String get comparePickerShowAllMarkets => 'Include other markets';

  @override
  String comparePickerSoldIn(String markets) {
    return 'Listed in: $markets';
  }

  @override
  String get comparePickerStepBrand => 'Brand';

  @override
  String get comparePickerStepCurrent => 'current step';

  @override
  String get comparePickerStepDone => 'chosen';

  @override
  String get comparePickerStepEditHint => 'Change this choice';

  @override
  String get comparePickerStepMarket => 'Market';

  @override
  String get comparePickerStepModel => 'Model';

  @override
  String get comparePickerStepTodo => 'not chosen yet';

  @override
  String get comparePickerStepTrim => 'Trim';

  @override
  String get comparePickerStepYear => 'Year';

  @override
  String get comparePickerTitle => 'Choose a car';

  @override
  String comparePickerTrimCount(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$formatted trims', one: '1 trim');
    return '$_temp0';
  }

  @override
  String get compareRecBack => 'Back';

  @override
  String compareRecBasis(String cycle, String currency) {
    return 'Ranges and consumption compared on $cycle; prices in $currency.';
  }

  @override
  String get compareRecBasisPeak => 'peak';

  @override
  String get compareRecBodyTypes => 'Body types';

  @override
  String get compareRecBodyTypesAny => 'Any body type';

  @override
  String compareRecBodyTypesSome(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count body types selected',
      one: '1 body type selected',
    );
    return '$_temp0';
  }

  @override
  String get compareRecBreakdown => 'How the score was calculated';

  @override
  String get compareRecBudgetError => 'Enter a budget greater than zero';

  @override
  String compareRecBudgetHelper(String market, String currency) {
    return 'Prices in $market ($currency). Prices in other currencies are never converted.';
  }

  @override
  String compareRecBudgetLabel(String currency) {
    return 'Maximum price ($currency)';
  }

  @override
  String get compareRecBudgetMessage => 'We only consider cars whose current local price is within your budget.';

  @override
  String get compareRecBudgetTitle => 'What is your budget?';

  @override
  String get compareRecCycleMismatch => 'measured on a different test cycle';

  @override
  String get compareRecDailyKm => 'Daily distance';

  @override
  String compareRecDecrease(String label) {
    return 'Decrease $label';
  }

  @override
  String get compareRecEditAnswers => 'Edit answers';

  @override
  String compareRecExcludedBody(String count) {
    return 'Other body type: $count';
  }

  @override
  String compareRecExcludedBudget(String count) {
    return 'Over budget: $count';
  }

  @override
  String compareRecExcludedPowertrain(String count) {
    return 'Other powertrain: $count';
  }

  @override
  String compareRecExcludedSeats(String count) {
    return 'Too few seats: $count';
  }

  @override
  String compareRecExcludedTitle(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$formatted cars did not fit',
      one: '1 car did not fit',
    );
    return '$_temp0';
  }

  @override
  String get compareRecHomeCharging => 'Can you charge at home or at work?';

  @override
  String get compareRecHomeChargingNo => 'Public charging only';

  @override
  String get compareRecHomeChargingRequired => 'Choose whether you can charge at home';

  @override
  String get compareRecHomeChargingYes => 'I can charge at home';

  @override
  String compareRecIgnoreFactor(String factor) {
    return 'Rank without “$factor”';
  }

  @override
  String compareRecIncrease(String label) {
    return 'Increase $label';
  }

  @override
  String get compareRecInvalidTitle => 'Some answers need changes';

  @override
  String get compareRecLongTrips => 'Long trips per month';

  @override
  String get compareRecLongTripsHint => 'Trips longer than one full charge';

  @override
  String get compareRecMissingTitle => 'Missing data';

  @override
  String get compareRecNeedsMessage => 'Cars that do not fit are excluded, and we show how many.';

  @override
  String get compareRecNeedsTitle => 'What do you need?';

  @override
  String get compareRecNext => 'Next';

  @override
  String get compareRecNoDecision => 'No decisive recommendation';

  @override
  String get compareRecNotRankedComparable => 'Data not comparable';

  @override
  String get compareRecNotRankedMissing => 'Missing data';

  @override
  String get compareRecNotRankedPrice => 'Price not available';

  @override
  String get compareRecNotRankedSeats => 'Seats not available';

  @override
  String get compareRecNotRankedSubtitle => 'Missing values are never counted as 0';

  @override
  String get compareRecNotRankedTitle => 'Could not be ranked';

  @override
  String get compareRecNotesTitle => 'Good to know';

  @override
  String compareRecPoints(String points) {
    return '$points points';
  }

  @override
  String get compareRecPowertrainRequired => 'Choose at least one powertrain';

  @override
  String get compareRecPowertrains => 'Powertrains';

  @override
  String get compareRecPowertrainsHint => 'Choose at least one';

  @override
  String get compareRecPrioritiesMessage =>
      'Weights decide how much each factor counts. They are shown with the results.';

  @override
  String get compareRecPrioritiesTitle => 'What matters most?';

  @override
  String compareRecRank(int rank) {
    return 'Rank $rank';
  }

  @override
  String get compareRecRankedTitle => 'Ranked cars';

  @override
  String get compareRecReasonFewer =>
      'Only one car has complete, comparable data, so there is nothing to rank it against.';

  @override
  String get compareRecReasonNoCandidates =>
      'No car matches your budget and needs. Try a higher budget or fewer filters.';

  @override
  String get compareRecReasonNoComparable =>
      'The matching cars lack data or their data is not comparable, so we will not guess.';

  @override
  String get compareRecReasonTooClose => 'The top cars score too close to call one of them the best.';

  @override
  String get compareRecResultsTitle => 'Your recommendations';

  @override
  String compareRecScore(String score) {
    return 'Match score: $score / 100';
  }

  @override
  String get compareRecScoreUnknown => 'Match score: not available';

  @override
  String get compareRecSeats => 'Seats needed';

  @override
  String get compareRecSentimentNegative => 'Watch out';

  @override
  String get compareRecSentimentNeutral => 'Note';

  @override
  String get compareRecSentimentPositive => 'Plus';

  @override
  String get compareRecShowResults => 'Show recommendations';

  @override
  String get compareRecStepBudget => 'Budget';

  @override
  String get compareRecStepNeeds => 'Needs';

  @override
  String compareRecStepOf(int step, int total, String title) {
    return 'Step $step of $total: $title';
  }

  @override
  String get compareRecStepPriorities => 'Priorities';

  @override
  String get compareRecStepUsage => 'Driving';

  @override
  String get compareRecSuggestedWeights => 'Use weights suggested from my driving';

  @override
  String get compareRecSuggestedWeightsHint => 'Turn off to set every weight yourself (0 = ignore)';

  @override
  String compareRecSummaryBudget(String budget) {
    return 'Up to $budget';
  }

  @override
  String compareRecSummaryDaily(String distance) {
    return '$distance a day';
  }

  @override
  String compareRecSummarySeats(String seats) {
    return '$seats seats';
  }

  @override
  String compareRecSummaryTrips(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$formatted long trips a month',
      one: '1 long trip a month',
      zero: 'No long trips',
    );
    return '$_temp0';
  }

  @override
  String get compareRecTopPick => 'Top pick for you';

  @override
  String get compareRecUsageMessage =>
      'Your daily distance and long trips decide how much range and fast charging matter.';

  @override
  String get compareRecUsageTitle => 'How do you drive?';

  @override
  String get compareRecWeightDefault => 'Default weight';

  @override
  String get compareRecWeightIgnored => 'Ignored';

  @override
  String compareRecWeightShare(String percent) {
    return 'weight $percent';
  }

  @override
  String get compareRecWeightUsage => 'Adjusted to your driving';

  @override
  String get compareRecWeightUser => 'Your choice';

  @override
  String get compareRecWeightsAllZero => 'At least one priority must be above 0';

  @override
  String get compareRecWeightsTitle => 'Weights used';

  @override
  String get compareRecommendCtaMessage =>
      'Answer a few questions about your budget and driving to get an explained recommendation.';

  @override
  String get compareRecommendCtaTitle => 'Not sure which car suits you?';

  @override
  String get compareRecommendationsTitle => 'Find the right car';

  @override
  String get compareRemoveCar => 'Remove from comparison';

  @override
  String compareRemoved(String car) {
    return '$car removed from the comparison';
  }

  @override
  String get compareReplaceTrayConfirm => 'Replace';

  @override
  String compareReplaceTrayMessage(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'The $count cars you are comparing now will be replaced by the cars of this comparison.',
      one: 'The car you are comparing now will be replaced by the cars of this comparison.',
    );
    return '$_temp0';
  }

  @override
  String get compareReplaceTrayTitle => 'Replace your current cars?';

  @override
  String compareRowsWon(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Better in $formatted rows',
      one: 'Better in 1 row',
      zero: 'Better in no row',
    );
    return '$_temp0';
  }

  @override
  String get compareRowsWonUnknown => 'Not available';

  @override
  String get compareRulesText =>
      'Units are unified before comparing and the published values are kept. Ranges are compared only on the same test cycle and never converted; electric and total range are separate. DC peak and average charging power are separate rows. Charging times are compared only for the same charge window (10–80% is not 30–80%). Prices are compared only in the same currency. A bigger battery is not automatically better. A missing value is never treated as 0.';

  @override
  String get compareSave => 'Save';

  @override
  String get compareSaveGuestMessage =>
      'Saving to an account needs sign-in. Without an account you can still create a share link and keep it.';

  @override
  String get compareSaveGuestTitle => 'Save this comparison';

  @override
  String get compareSaveLimitReached =>
      'You have reached the limit of saved comparisons. Delete an old one to save more.';

  @override
  String get compareSaved => 'Comparison saved to your account';

  @override
  String get compareSavedEmptyMessage => 'Compare cars, then tap Save to keep the comparison here.';

  @override
  String get compareSavedEmptyTitle => 'No saved comparisons yet';

  @override
  String get compareSavedGuestHint => 'Sign in to keep comparisons in your account and open them on any device.';

  @override
  String get compareSavedTitle => 'Saved comparisons';

  @override
  String get compareShare => 'Share link';

  @override
  String get compareShareLinkInstead => 'Create a share link instead';

  @override
  String get compareSharedNoResultMessage => 'Fewer than two of its cars are still available in the catalog.';

  @override
  String get compareSharedNoResultTitle => 'This comparison can no longer be shown';

  @override
  String get compareSharedNotFoundMessage => 'This link is invalid, or the comparison was deleted or unpublished.';

  @override
  String get compareSharedNotFoundTitle => 'Comparison not found';

  @override
  String get compareSharedTitle => 'Shared comparison';

  @override
  String get compareShowAllRows => 'Show all rows';

  @override
  String compareSlotFacts(String year, String market) {
    return '$year · $market';
  }

  @override
  String compareSocWindow(String window) {
    return '$window charge';
  }

  @override
  String get compareSomeUnavailable => 'Some cars are no longer available';

  @override
  String get compareSponsoredWarning => 'This result was not confirmed as free of sponsorship. Treat it with caution.';

  @override
  String compareStars(String stars) {
    return '$stars stars';
  }

  @override
  String get compareStatusComparable => 'Comparable';

  @override
  String get compareStatusConditions => 'Different test conditions — no winner';

  @override
  String get compareStatusCurrency => 'Different currencies — no winner';

  @override
  String get compareStatusCycles => 'Different test cycles — no winner';

  @override
  String get compareStatusMissing => 'Missing data — no winner';

  @override
  String get compareStatusNotApplicable => 'Not applicable to every car';

  @override
  String get compareStatusSocWindow => 'Different charge windows — no winner';

  @override
  String get compareStatusUnknown => 'Not decided';

  @override
  String get compareSummaryTitle => 'At a glance';

  @override
  String get compareTitle => 'Comparisons';

  @override
  String compareTrayFull(int max) {
    return 'The comparison is full ($max cars). Remove a car to add another.';
  }

  @override
  String compareUnavailableTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count cars are no longer available',
      one: '1 car is no longer available',
    );
    return '$_temp0';
  }

  @override
  String get compareUnitInch => 'in';

  @override
  String get compareUnitLitersPer100 => 'L/100 km';

  @override
  String get compareValueDetailsHint => 'Shows the source and measuring conditions';

  @override
  String get compareViewDetailed => 'Detailed';

  @override
  String get compareViewLabel => 'Comparison view';

  @override
  String get compareViewSummary => 'Summary';

  @override
  String compareWheelSize(String size) {
    return '$size-inch wheels';
  }

  @override
  String compareYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count years', one: '1 year');
    return '$_temp0';
  }

  @override
  String get compareYes => 'Yes';

  @override
  String get encyclopediaAllCategories => 'All';

  @override
  String get encyclopediaClearFilters => 'Clear filters';

  @override
  String get encyclopediaEmptyMessage => 'Guides appear here after a technical specialist has reviewed them.';

  @override
  String get encyclopediaEmptyTitle => 'No guides yet';

  @override
  String get encyclopediaEntryTitle => 'Encyclopedia entry';

  @override
  String get encyclopediaIntro =>
      'Beginner guides to car types, connectors, batteries, range standards, home and fast charging, warranty and used-car checks.';

  @override
  String get encyclopediaLanguageAr => 'Arabic';

  @override
  String get encyclopediaLanguageEn => 'English';

  @override
  String get encyclopediaNoMatchesMessage => 'Try another word or category.';

  @override
  String get encyclopediaNoMatchesTitle => 'No matching guides';

  @override
  String get encyclopediaNotReviewedExplain => 'This guide has no technical review information.';

  @override
  String encyclopediaReadingMinutes(int minutes, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(minutes, locale: localeName, other: '$formatted min read', one: '1 min read');
    return '$_temp0';
  }

  @override
  String get encyclopediaRelated => 'Related guides';

  @override
  String get encyclopediaReviewPolicy =>
      'Only guides that passed a technical review are published. For any electrical work, use a qualified electrician.';

  @override
  String get encyclopediaReviewed => 'Technically reviewed';

  @override
  String get encyclopediaReviewedExplain =>
      'A technical specialist checked this guide against a safety checklist before it was published. It is general information, not a substitute for a qualified electrician or the manufacturer.';

  @override
  String encyclopediaReviewedOn(String label, String date) {
    return '$label · $date';
  }

  @override
  String get encyclopediaSafetyTitle => 'Electrical safety';

  @override
  String get encyclopediaSearchHint => 'Search the encyclopedia';

  @override
  String encyclopediaShownInLanguage(String language) {
    return 'Shown in $language';
  }

  @override
  String get encyclopediaTitle => 'EV encyclopedia';

  @override
  String get favoritesBrowseCars => 'Browse cars';

  @override
  String get favoritesBrowseComparisons => 'Compare cars';

  @override
  String get favoritesBrowseNews => 'Browse news';

  @override
  String get favoritesBrowseStations => 'Find stations';

  @override
  String get favoritesDeleteOffline => 'Delete offline copy';

  @override
  String get favoritesDeviceOnly => 'Favorites are saved on this device only.';

  @override
  String get favoritesEmptyArticlesMessage => 'Tap the heart on any article to find it here later.';

  @override
  String get favoritesEmptyArticlesTitle => 'No favorite articles yet';

  @override
  String get favoritesEmptyCarsMessage => 'Save models, trims and 360° tours with the heart button.';

  @override
  String get favoritesEmptyCarsTitle => 'No favorite cars yet';

  @override
  String get favoritesEmptyComparisonsMessage => 'Save a comparison to come back to it quickly.';

  @override
  String get favoritesEmptyComparisonsTitle => 'No favorite comparisons yet';

  @override
  String get favoritesEmptyStationsMessage => 'Save the stations you use often.';

  @override
  String get favoritesEmptyStationsTitle => 'No favorite stations yet';

  @override
  String get favoritesGuestHint => 'Saved on this device. Sign in to keep them in your account on every device.';

  @override
  String get favoritesLocalOnly => 'On this device only';

  @override
  String favoritesRemoved(String title) {
    return 'Removed “$title”';
  }

  @override
  String get favoritesSavedArticlesTitle => 'Articles';

  @override
  String favoritesSavedAt(String time) {
    return 'Saved $time';
  }

  @override
  String get favoritesSavedOfflineIntro =>
      'Content you saved to read without a connection, with the date it was saved. It may have changed since.';

  @override
  String get favoritesSavedOfflineTitle => 'Saved for offline reading';

  @override
  String get favoritesSavedSpecsTitle => 'Spec sheets';

  @override
  String get favoritesSyncFailed => 'Couldn\'t sync with your account.';

  @override
  String get favoritesSyncing => 'Syncing with your account…';

  @override
  String get favoritesTabArticles => 'Articles';

  @override
  String get favoritesTabCars => 'Cars';

  @override
  String get favoritesTabComparisons => 'Comparisons';

  @override
  String get favoritesTabStations => 'Stations';

  @override
  String get favoritesTitle => 'Favorites';

  @override
  String get favoritesUnavailable => 'No longer available';

  @override
  String get favoritesUndo => 'Undo';

  @override
  String get garageAddTitle => 'Add a car';

  @override
  String get garageEditTitle => 'Edit car';

  @override
  String get garageTitle => 'My garage';

  @override
  String get garageVehicleTitle => 'My car';

  @override
  String get homeAllTours => 'All 360° tours';

  @override
  String get homeChangePlace => 'Change';

  @override
  String get homeChargingGuides => 'Charging & maintenance guides';

  @override
  String get homeChooseCity => 'Choose a city';

  @override
  String get homeEmptyMessage => 'Nothing has been published for your country and language yet. Pull to refresh later.';

  @override
  String get homeEmptyTitle => 'Content is on its way';

  @override
  String get homeExploreBrands => 'Brands';

  @override
  String get homeExploreCalculators => 'Calculators';

  @override
  String get homeExploreEncyclopedia => 'EV encyclopedia';

  @override
  String get homeExploreNews => 'All news';

  @override
  String get homeExploreServices => 'Services directory';

  @override
  String get homeExploreTitle => 'Explore';

  @override
  String get homeExploreTours => '360° tours';

  @override
  String get homeFeaturedComparisons => 'Featured comparisons';

  @override
  String get homeForYou => 'For you';

  @override
  String get homeInteriorTours => '360° interior tours';

  @override
  String get homeLatestNews => 'Latest news';

  @override
  String homeNearbyAround(String place) {
    return 'Around: $place';
  }

  @override
  String get homeNearbyEmpty => 'No published stations within 25 km of this place yet.';

  @override
  String get homeNearbyPromptMessage =>
      'Allow location access or choose a city. Your location is only used for this search and is never stored.';

  @override
  String get homeNearbyPromptTitle => 'See charging stations near you';

  @override
  String get homeNearbyStations => 'Charging stations nearby';

  @override
  String get homeNewCars => 'New cars';

  @override
  String get homeRefreshFailed => 'Couldn\'t refresh. Showing the last loaded content.';

  @override
  String get homeReviews => 'Reviews';

  @override
  String get homeSearchHint => 'Search news, cars, stations…';

  @override
  String get homeSectionUnavailable => 'This section couldn\'t load right now.';

  @override
  String get homeTitle => 'Home';

  @override
  String get homeTopStory => 'Top story';

  @override
  String get homeToursIntro => 'Step inside the cabin and look around, seat by seat.';

  @override
  String get homeUseMyLocation => 'Use my location';

  @override
  String get newsAllMarkets => 'News from all markets';

  @override
  String newsAllMarketsHint(String market) {
    return 'Off: only news for $market and news for every market.';
  }

  @override
  String get newsArticleTitle => 'Article';

  @override
  String newsArticlesInCategory(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count articles', one: '1 article');
    return '$_temp0';
  }

  @override
  String get newsBackToTop => 'Back to top';

  @override
  String get newsBrowseAll => 'Browse all news';

  @override
  String newsByAuthor(String name) {
    return 'By $name';
  }

  @override
  String get newsCategoriesLabel => 'News categories';

  @override
  String get newsCategoryTitle => 'Category';

  @override
  String get newsClearFilters => 'Clear filters';

  @override
  String get newsComments => 'Comments';

  @override
  String get newsCorrectionKindClarification => 'Clarification';

  @override
  String get newsCorrectionKindCorrection => 'Correction';

  @override
  String get newsCorrectionKindUpdate => 'Update';

  @override
  String get newsCorrectionsTitle => 'Corrections and updates';

  @override
  String get newsCoverCaption => 'Cover image';

  @override
  String get newsEmptyFilteredMessage => 'No articles match these filters.';

  @override
  String get newsEmptyMessage => 'Nothing has been published here yet. Check back later.';

  @override
  String get newsEmptyTitle => 'No articles yet';

  @override
  String get newsEndOfFeed => 'You\'re all caught up';

  @override
  String newsEventDate(String date) {
    return 'Event date: $date';
  }

  @override
  String get newsExternalLinkInsecure => 'This link is not encrypted (http).';

  @override
  String newsExternalLinkMessage(String host) {
    return 'You\'re leaving EV Car News to open $host.';
  }

  @override
  String get newsExternalLinkTitle => 'Open an external link?';

  @override
  String newsFallbackNotice(String requested, String served) {
    return 'Not available in $requested yet, so it is shown in $served.';
  }

  @override
  String get newsFilterAll => 'All';

  @override
  String get newsFilterSaved => 'Saved offline';

  @override
  String get newsFiltersTitle => 'Filter news';

  @override
  String get newsFontLarger => 'Larger text';

  @override
  String newsFontScaleValue(String percent) {
    return 'Text size $percent';
  }

  @override
  String get newsFontSize => 'Text size';

  @override
  String get newsFontSmaller => 'Smaller text';

  @override
  String get newsImageLicense => 'Licence';

  @override
  String get newsImageOpen => 'Open image';

  @override
  String get newsImageSource => 'Image source';

  @override
  String get newsImageViewerHint => 'Pinch or double-tap to zoom.';

  @override
  String get newsLanguageAr => 'Arabic';

  @override
  String get newsLanguageEn => 'English';

  @override
  String get newsLineSpacing => 'Line spacing';

  @override
  String get newsLineSpacingComfortable => 'Comfortable';

  @override
  String get newsLineSpacingCompact => 'Compact';

  @override
  String get newsLineSpacingRelaxed => 'Relaxed';

  @override
  String get newsListTitle => 'News';

  @override
  String get newsLoadMoreFailed => 'Couldn\'t load more articles.';

  @override
  String get newsLoadingMore => 'Loading more articles';

  @override
  String get newsMachineTranslated => 'Machine translation reviewed by an editor.';

  @override
  String newsMarketMismatch(String market) {
    return 'This article is aimed at other markets; details may not apply in $market.';
  }

  @override
  String get newsNotFoundMessage => 'It may have been removed or is not published yet.';

  @override
  String get newsNotFoundTitle => 'Article not available';

  @override
  String get newsOfflineNoCopyMessage =>
      'This article isn\'t saved on your device. Connect to the internet to read it.';

  @override
  String get newsOnlyMyLanguage => 'Only articles in my language';

  @override
  String get newsOnlyMyLanguageHint =>
      'Off: articles not translated yet are shown in their original language, with a label.';

  @override
  String get newsOpenLink => 'Open';

  @override
  String get newsOpenSaved => 'Open saved articles';

  @override
  String newsPublishedOn(String date) {
    return 'Published $date';
  }

  @override
  String get newsReaderPreview => 'This is how article text will look while you read.';

  @override
  String get newsReaderSettings => 'Reading settings';

  @override
  String get newsReaderTheme => 'Reading theme';

  @override
  String get newsReaderThemeApp => 'Like the app';

  @override
  String get newsReaderThemeDark => 'Dark';

  @override
  String get newsReaderThemeLight => 'Light';

  @override
  String newsReadingTime(int minutes) {
    String _temp0 = intl.Intl.pluralLogic(minutes, locale: localeName, other: '$minutes min read', one: '1 min read');
    return '$_temp0';
  }

  @override
  String get newsRelatedArticlesTitle => 'Related articles';

  @override
  String get newsRelatedCarsTitle => 'Cars in this article';

  @override
  String get newsRemoveSaved => 'Remove from saved';

  @override
  String get newsRemoveSavedConfirmMessage => 'It will no longer be available without internet.';

  @override
  String get newsRemoveSavedConfirmTitle => 'Remove this article?';

  @override
  String get newsRemovedSnack => 'Removed from saved articles.';

  @override
  String get newsSaveFailed => 'Couldn\'t save the article. Please try again.';

  @override
  String get newsSaveOffline => 'Save for offline reading';

  @override
  String newsSavedCopyNotice(String time) {
    return 'Offline copy saved $time. It may have changed since.';
  }

  @override
  String newsSavedCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count articles on this device',
      one: '1 article on this device',
    );
    return '$_temp0';
  }

  @override
  String get newsSavedEmptyMessage => 'Open an article and tap the download button to read it later without internet.';

  @override
  String get newsSavedEmptyTitle => 'No saved articles';

  @override
  String get newsSavedImagesPartial => 'Some images weren\'t saved';

  @override
  String get newsSavedOfflineState => 'Saved for offline reading';

  @override
  String newsSavedOn(String date) {
    return 'Saved $date';
  }

  @override
  String get newsSavedSnack => 'Saved. You can read it without internet.';

  @override
  String newsSavedSnackPartial(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Saved, but $count images couldn\'t be downloaded.',
      one: 'Saved, but 1 image couldn\'t be downloaded.',
    );
    return '$_temp0';
  }

  @override
  String get newsSavingOffline => 'Saving for offline reading…';

  @override
  String get newsSearch => 'Search news';

  @override
  String newsShownInLanguage(String language) {
    return 'In $language';
  }

  @override
  String get newsSortLatest => 'Latest';

  @override
  String get newsSortOldest => 'Oldest';

  @override
  String get newsSortPopular => 'Most read';

  @override
  String get newsSourceOpen => 'Open the original source';

  @override
  String get newsSourceTitle => 'Source';

  @override
  String newsTagHeader(String name) {
    return '#$name';
  }

  @override
  String get newsTagTitle => 'Topic';

  @override
  String get newsTagsTitle => 'Topics';

  @override
  String get newsTypeAny => 'All types';

  @override
  String get newsTypeBuyingGuide => 'Buying guides';

  @override
  String get newsTypeExplainer => 'Explainers';

  @override
  String get newsTypeLabel => 'Content type';

  @override
  String get newsTypeNews => 'News';

  @override
  String get newsTypeOpinion => 'Opinion';

  @override
  String get newsTypeReview => 'Reviews';

  @override
  String get newsTypeTestDrive => 'Test drives';

  @override
  String newsUpdatedOn(String date) {
    return 'Updated $date';
  }

  @override
  String get newsVehicleBrand => 'Brand';

  @override
  String get newsVehicleModel => 'Model';

  @override
  String newsVehicleModelYear(String year) {
    return 'Model year $year';
  }

  @override
  String get newsVideoGeneric => 'the video site';

  @override
  String newsVideoOpensIn(String provider) {
    return 'Opens in $provider';
  }

  @override
  String newsVideoPrivacy(String provider) {
    return 'Nothing is loaded from $provider until you tap.';
  }

  @override
  String get newsWatchVideo => 'Watch the video';

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
  String get searchAllGroups => 'All results';

  @override
  String searchAlsoMatched(String terms) {
    return 'Also matched: $terms';
  }

  @override
  String get searchBrowseBrands => 'Brands';

  @override
  String get searchBrowseEncyclopedia => 'Encyclopedia';

  @override
  String get searchBrowseServices => 'Services';

  @override
  String get searchClearRecent => 'Clear all';

  @override
  String get searchClearRecentMessage => 'They are stored on this device only.';

  @override
  String get searchClearRecentTitle => 'Clear recent searches?';

  @override
  String get searchContactVerified => 'Contact verified';

  @override
  String searchFor(String query) {
    return 'Search for “$query”';
  }

  @override
  String get searchGroupArticles => 'News & articles';

  @override
  String get searchGroupBrands => 'Brands';

  @override
  String get searchGroupEncyclopedia => 'Encyclopedia';

  @override
  String get searchGroupModels => 'Models';

  @override
  String get searchGroupServices => 'Services';

  @override
  String get searchGroupStations => 'Charging stations';

  @override
  String get searchGroupVariants => 'Trims';

  @override
  String get searchHint => 'Search in Arabic or English';

  @override
  String get searchInvalidQuery => 'Type at least one letter or number.';

  @override
  String get searchLoadMoreFailed => 'Couldn\'t load more results.';

  @override
  String get searchMatchedSpelling => 'Matched another spelling';

  @override
  String searchNoResultsMessage(String query) {
    return 'Nothing matched “$query”. Check the spelling or try a shorter word.';
  }

  @override
  String get searchNoResultsTitle => 'No results';

  @override
  String get searchRecentPrivacy => 'Recent searches stay on this device and are never sent to your account.';

  @override
  String get searchRecentTitle => 'Recent searches';

  @override
  String searchRemoveRecent(String query) {
    return 'Remove “$query”';
  }

  @override
  String searchResultCount(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$formatted results',
      one: '1 result',
      zero: 'No results',
    );
    return '$_temp0';
  }

  @override
  String get searchReviewed => 'Technically reviewed';

  @override
  String searchSeeAllCount(String count) {
    return 'See all $count';
  }

  @override
  String get searchShownInArabic => 'Shown in Arabic';

  @override
  String get searchShownInEnglish => 'Shown in English';

  @override
  String get searchStartMessage =>
      'News, brands, models, trims, charging stations, the encyclopedia and services. Alternative spellings like “تسلا” or “Tesla” both work.';

  @override
  String get searchStartTitle => 'Search everything';

  @override
  String get searchTitle => 'Search';

  @override
  String get searchTypeArticle => 'Article';

  @override
  String get searchTypeBrand => 'Brand';

  @override
  String get searchTypeEncyclopedia => 'Encyclopedia';

  @override
  String get searchTypeModel => 'Model';

  @override
  String get searchTypeQuery => 'Search suggestion';

  @override
  String get searchTypeService => 'Service';

  @override
  String get searchTypeStation => 'Station';

  @override
  String get searchTypeVariant => 'Trim';

  @override
  String get servicesDirectoryAddress => 'Address';

  @override
  String get servicesDirectoryAllTypes => 'All';

  @override
  String get servicesDirectoryAlwaysOpen => 'Open 24/7';

  @override
  String get servicesDirectoryAnyCity => 'Any city';

  @override
  String get servicesDirectoryBrandsTitle => 'Brands served';

  @override
  String get servicesDirectoryCall => 'Call';

  @override
  String get servicesDirectoryCheckBeforeVisit => 'Call ahead to confirm before you visit.';

  @override
  String get servicesDirectoryChooseCity => 'Choose a city';

  @override
  String get servicesDirectoryCity => 'City';

  @override
  String get servicesDirectoryCityField => 'City name';

  @override
  String get servicesDirectoryClosedDay => 'Closed';

  @override
  String get servicesDirectoryClosedNow => 'Closed now';

  @override
  String get servicesDirectoryContactTitle => 'Contact';

  @override
  String get servicesDirectoryDayFri => 'Friday';

  @override
  String get servicesDirectoryDayMon => 'Monday';

  @override
  String get servicesDirectoryDaySat => 'Saturday';

  @override
  String get servicesDirectoryDaySun => 'Sunday';

  @override
  String get servicesDirectoryDayThu => 'Thursday';

  @override
  String get servicesDirectoryDayTue => 'Tuesday';

  @override
  String get servicesDirectoryDayWed => 'Wednesday';

  @override
  String get servicesDirectoryDemoNoContact => 'Demo listing: contact actions are disabled.';

  @override
  String get servicesDirectoryDirections => 'Directions';

  @override
  String get servicesDirectoryDistance => 'Distance';

  @override
  String servicesDirectoryDistanceAway(String distance) {
    return '$distance away';
  }

  @override
  String get servicesDirectoryEmail => 'Email';

  @override
  String get servicesDirectoryEmptyMessage => 'Nothing has been published for your country yet.';

  @override
  String get servicesDirectoryEmptyTitle => 'No providers yet';

  @override
  String get servicesDirectoryHoursNotAvailable => 'Opening hours not available.';

  @override
  String get servicesDirectoryHoursTitle => 'Opening hours';

  @override
  String get servicesDirectoryHoursUnknown => 'Hours not available';

  @override
  String get servicesDirectoryHoursUnknownDay => 'Not available';

  @override
  String get servicesDirectoryIntro =>
      'Service centres, dealers, charger installers and emergency services. Contact details show when they were last verified.';

  @override
  String get servicesDirectoryLocationDenied => 'Location access was not allowed. You can choose a city instead.';

  @override
  String get servicesDirectoryLocationDeniedForever =>
      'Location access is off for this app. Turn it on in Settings, or choose a city.';

  @override
  String get servicesDirectoryLocationServiceOff =>
      'Location services are off on this device. Turn them on, or choose a city.';

  @override
  String get servicesDirectoryLocationTitle => 'Location';

  @override
  String get servicesDirectoryLocationUnavailable => 'Couldn\'t get your location. You can choose a city instead.';

  @override
  String get servicesDirectoryNearMe => 'Near me';

  @override
  String get servicesDirectoryNoContact => 'No contact details published.';

  @override
  String get servicesDirectoryNoMatchesMessage => 'Try another type or city, or turn off “Open now”.';

  @override
  String get servicesDirectoryNoMatchesTitle => 'No matching providers';

  @override
  String get servicesDirectoryNotVerified => 'Contact details not verified';

  @override
  String get servicesDirectoryOpenNow => 'Open now';

  @override
  String get servicesDirectoryOrderDistance => 'Nearest first. Sponsorship never changes this order.';

  @override
  String get servicesDirectoryOrderVerified =>
      'Ordered by verified contact details first, then name. Sponsorship never changes this order.';

  @override
  String get servicesDirectoryPhone => 'Phone';

  @override
  String get servicesDirectoryProviderTitle => 'Service provider';

  @override
  String get servicesDirectoryResults => 'Directory';

  @override
  String get servicesDirectorySearchHint => 'Search by name';

  @override
  String get servicesDirectoryServicesTitle => 'Services';

  @override
  String get servicesDirectorySponsoredDetailNote =>
      'This listing is sponsored. Sponsorship does not mean the provider is recommended or verified.';

  @override
  String get servicesDirectorySponsoredSlotNote =>
      'Paid placements, shown separately. They keep their normal place in the directory below.';

  @override
  String get servicesDirectorySponsoredSlotTitle => 'Sponsored listings';

  @override
  String servicesDirectoryTimezone(String zone) {
    return 'Times in $zone';
  }

  @override
  String get servicesDirectoryTitle => 'Services directory';

  @override
  String get servicesDirectoryTruncated => 'Many results: narrow the search to see the most relevant.';

  @override
  String get servicesDirectoryTypeBattery => 'Battery services';

  @override
  String get servicesDirectoryTypeChargerInstaller => 'Charger installers';

  @override
  String get servicesDirectoryTypeDealer => 'Dealers';

  @override
  String get servicesDirectoryTypeEmergency => 'Emergency';

  @override
  String get servicesDirectoryTypeOther => 'Other';

  @override
  String get servicesDirectoryTypeServiceCenter => 'Service centres';

  @override
  String get servicesDirectoryVerified => 'Contact verified';

  @override
  String get servicesDirectoryVerifiedLongAgo => 'Verified over a year ago';

  @override
  String servicesDirectoryVerifiedOn(String date) {
    return 'Verified on $date';
  }

  @override
  String servicesDirectoryVerifiedStale(String date) {
    return 'Last verified $date (over a year ago)';
  }

  @override
  String get servicesDirectoryWebsite => 'Website';

  @override
  String get servicesDirectoryWhatsApp => 'WhatsApp';

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
  String get toursAbout => 'About';

  @override
  String get toursAttributionTitle => 'Photo credits & licence';

  @override
  String get toursBrowseCars => 'Browse cars';

  @override
  String get toursCar => 'Car';

  @override
  String toursCredit(String credit) {
    return '© $credit';
  }

  @override
  String get toursDemoFallback => 'Demo — not a real car interior';

  @override
  String get toursDetails => 'Tour details';

  @override
  String get toursDragHint => 'Drag to look around · pinch to zoom';

  @override
  String get toursDriveLhd => 'Left-hand drive';

  @override
  String get toursDriveRhd => 'Right-hand drive';

  @override
  String get toursDriveUnknown => 'Drive side: not available';

  @override
  String get toursFullscreenEnter => 'Full screen';

  @override
  String get toursFullscreenExit => 'Exit full screen';

  @override
  String get toursGoBack => 'Go back';

  @override
  String get toursHdFailed => 'Couldn\'t load high quality. Showing the preview.';

  @override
  String get toursHotspotImage => 'Detail photo';

  @override
  String get toursHotspotInfo => 'Information';

  @override
  String get toursHotspotScene => 'Go to another seat';

  @override
  String get toursHotspotSpec => 'Specification';

  @override
  String get toursHotspotVideo => 'Video';

  @override
  String get toursImageZoomHint => 'Tap the photo to zoom';

  @override
  String get toursImageZoomTitle => 'Detail photo';

  @override
  String get toursInfo => 'About this tour';

  @override
  String toursInterior(String color) {
    return 'Interior: $color';
  }

  @override
  String toursLicense(String license) {
    return 'Licence: $license';
  }

  @override
  String get toursLicenseCc0 => 'CC0 (public domain)';

  @override
  String get toursLicenseCcBy => 'CC BY';

  @override
  String get toursLicenseCcBySa => 'CC BY-SA';

  @override
  String get toursLicenseCommissioned => 'Commissioned';

  @override
  String get toursLicenseLicensed => 'Licensed';

  @override
  String get toursLicenseOther => 'Other licence';

  @override
  String get toursLicenseOwned => 'Owned';

  @override
  String get toursLicensePermission => 'Used with permission';

  @override
  String get toursLicensePressKit => 'Press kit';

  @override
  String get toursLicenseTerms => 'Licence terms';

  @override
  String get toursListEmptyMessage =>
      'We only publish tours made from licensed photos of the exact trim. New tours will appear here as soon as they are ready.';

  @override
  String get toursListEmptyTitle => 'No 360° tours yet';

  @override
  String get toursListIntro =>
      'Sit inside the car and look around, seat by seat. Every tour is made from licensed interior photos of the stated trim.';

  @override
  String get toursListTitle => '360° interior tours';

  @override
  String get toursLoadFailedMessage => 'Check your connection and try again. You can also browse the regular photos.';

  @override
  String get toursLoadFailedTitle => 'The 360° view couldn\'t be loaded';

  @override
  String get toursLoadMoreFailed => 'Couldn\'t load more tours.';

  @override
  String get toursLoading => 'Loading the 360° view…';

  @override
  String toursLoadingHd(String percent) {
    return 'Loading high quality… $percent';
  }

  @override
  String get toursLoadingHdUnknown => 'Loading high quality…';

  @override
  String toursMarket(String market) {
    return 'Market: $market';
  }

  @override
  String toursMarketMismatch(String market) {
    return 'This tour was made for the $market market, not the market you selected.';
  }

  @override
  String toursModelYear(String year) {
    return 'Model year $year';
  }

  @override
  String get toursMotionEnabled => 'Motion control on. Move your phone to look around.';

  @override
  String get toursMotionOff => 'Look around by moving the phone';

  @override
  String get toursMotionOn => 'Turn off motion control';

  @override
  String get toursMotionUnavailable => 'Motion control isn\'t available on this device. Drag to look around.';

  @override
  String get toursNoImageMessage => 'Its images are larger than this device can display.';

  @override
  String get toursNoImageTitle => 'This tour can\'t be shown on this device';

  @override
  String get toursOpen => 'Open 360° tour';

  @override
  String get toursOpenGallery => 'Open photo gallery';

  @override
  String get toursPoints => 'Points of interest';

  @override
  String get toursPointsEmpty => 'This view has no points of interest.';

  @override
  String toursPublished(String date) {
    return 'Published $date';
  }

  @override
  String get toursQualityHd => 'HD';

  @override
  String get toursQualityHdSemantics => 'Showing high quality';

  @override
  String get toursQualityPreview => 'Preview';

  @override
  String get toursQualityPreviewSemantics => 'Showing a low-resolution preview';

  @override
  String get toursReferenceBadge => 'Similar trim';

  @override
  String toursReferenceBody(String trim) {
    return 'These photos show the $trim trim, not exactly the selected one.';
  }

  @override
  String get toursReferenceTitle => 'Photographed in a similar trim';

  @override
  String get toursResetView => 'Reset view';

  @override
  String toursSceneCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count views', one: '1 view');
    return '$_temp0';
  }

  @override
  String get toursSeatCargo => 'Cargo area';

  @override
  String get toursSeatDriver => 'Driver seat';

  @override
  String get toursSeatFrontPassenger => 'Front passenger';

  @override
  String get toursSeatOther => 'Other view';

  @override
  String get toursSeatPicker => 'Choose a seat';

  @override
  String get toursSeatRear => 'Rear seats';

  @override
  String get toursSeatThirdRow => 'Third row';

  @override
  String get toursSourceLink => 'Source';

  @override
  String get toursSpecOpen => 'See all specifications';

  @override
  String get toursStillPreview => 'Still preview (not the 360° tour)';

  @override
  String toursTrim(String trim) {
    return 'Trim: $trim';
  }

  @override
  String get toursUnavailableMessage =>
      'There is no licensed 360° interior for this tour. You can browse the regular photos instead.';

  @override
  String get toursUnavailableTitle => 'Tour not available for this trim';

  @override
  String get toursVideoBlocked => 'This video link isn\'t allowed.';

  @override
  String get toursVideoOpen => 'Watch video';

  @override
  String toursVideoProvider(String provider) {
    return 'Opens on $provider';
  }

  @override
  String get toursVideoSelf => 'EV Car News';

  @override
  String get toursViewCar => 'View car page';

  @override
  String toursViewerSemantics(String car) {
    return '360° view of $car. Drag to look around, or use the buttons.';
  }

  @override
  String get toursViewerTitle => '360° interior tour';

  @override
  String get toursWebPreviewMessage =>
      'The 360° viewer runs in the Android and iOS apps. The image below is only a still preview, not the tour.';

  @override
  String get toursWebglMessage =>
      '3D graphics (WebGL) aren\'t available on this device. You can browse the regular photos instead.';

  @override
  String get toursWebglTitle => 'This device can\'t display 360° views';

  @override
  String get toursZoomIn => 'Zoom in';

  @override
  String get toursZoomOut => 'Zoom out';

  @override
  String get tripsTitle => 'Trip planner';
}
