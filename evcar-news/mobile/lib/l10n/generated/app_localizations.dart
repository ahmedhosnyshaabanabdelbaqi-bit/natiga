import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('ar'), Locale('en')];

  /// No description provided for @accountDeleteAccount.
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get accountDeleteAccount;

  /// No description provided for @accountDeleteAcknowledge.
  ///
  /// In en, this message translates to:
  /// **'I understand this is permanent and cannot be undone.'**
  String get accountDeleteAcknowledge;

  /// No description provided for @accountDeleteButton.
  ///
  /// In en, this message translates to:
  /// **'Delete account permanently'**
  String get accountDeleteButton;

  /// No description provided for @accountDeletePasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Enter your password to confirm'**
  String get accountDeletePasswordLabel;

  /// No description provided for @accountDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get accountDeleteTitle;

  /// No description provided for @accountDeleteWarning.
  ///
  /// In en, this message translates to:
  /// **'Your account and personal data will be permanently deleted, such as your garage, favorites, charging log, reminders and synced settings. Public contributions such as reviews and comments will be anonymized. This cannot be undone.'**
  String get accountDeleteWarning;

  /// No description provided for @accountDeleted.
  ///
  /// In en, this message translates to:
  /// **'Your account has been deleted.'**
  String get accountDeleted;

  /// No description provided for @accountEmailNotVerified.
  ///
  /// In en, this message translates to:
  /// **'Your email is not verified yet.'**
  String get accountEmailNotVerified;

  /// No description provided for @accountEmailVerified.
  ///
  /// In en, this message translates to:
  /// **'Email verified'**
  String get accountEmailVerified;

  /// No description provided for @accountExploreSection.
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get accountExploreSection;

  /// No description provided for @accountGuestMessage.
  ///
  /// In en, this message translates to:
  /// **'All public content is available without signing in. Create an account to save your cars and favorites and sync them across devices.'**
  String get accountGuestMessage;

  /// No description provided for @accountGuestTitle.
  ///
  /// In en, this message translates to:
  /// **'You\'re browsing as a guest'**
  String get accountGuestTitle;

  /// No description provided for @accountLoggedOut.
  ///
  /// In en, this message translates to:
  /// **'Signed out.'**
  String get accountLoggedOut;

  /// No description provided for @accountLogout.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get accountLogout;

  /// No description provided for @accountLogoutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Sign out of this device?'**
  String get accountLogoutConfirm;

  /// No description provided for @accountMyToolsSection.
  ///
  /// In en, this message translates to:
  /// **'My tools'**
  String get accountMyToolsSection;

  /// No description provided for @accountOfflineUser.
  ///
  /// In en, this message translates to:
  /// **'Showing saved account details because you\'re offline.'**
  String get accountOfflineUser;

  /// No description provided for @accountPreferredLanguageLabel.
  ///
  /// In en, this message translates to:
  /// **'Language for emails and notifications'**
  String get accountPreferredLanguageLabel;

  /// No description provided for @accountProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get accountProfile;

  /// No description provided for @accountProfileSaved.
  ///
  /// In en, this message translates to:
  /// **'Changes saved.'**
  String get accountProfileSaved;

  /// No description provided for @accountProfileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get accountProfileTitle;

  /// No description provided for @accountRestoring.
  ///
  /// In en, this message translates to:
  /// **'Restoring your session…'**
  String get accountRestoring;

  /// No description provided for @accountSessionCreated.
  ///
  /// In en, this message translates to:
  /// **'Started: {time}'**
  String accountSessionCreated(String time);

  /// No description provided for @accountSessionIp.
  ///
  /// In en, this message translates to:
  /// **'IP address: {ip}'**
  String accountSessionIp(String ip);

  /// No description provided for @accountSessionLastUsed.
  ///
  /// In en, this message translates to:
  /// **'Last used: {time}'**
  String accountSessionLastUsed(String time);

  /// No description provided for @accountSessionRevoke.
  ///
  /// In en, this message translates to:
  /// **'End session'**
  String get accountSessionRevoke;

  /// No description provided for @accountSessionRevokeConfirm.
  ///
  /// In en, this message translates to:
  /// **'End this session? That device will need to sign in again.'**
  String get accountSessionRevokeConfirm;

  /// No description provided for @accountSessionRevoked.
  ///
  /// In en, this message translates to:
  /// **'Session ended.'**
  String get accountSessionRevoked;

  /// No description provided for @accountSessionThisDevice.
  ///
  /// In en, this message translates to:
  /// **'This device'**
  String get accountSessionThisDevice;

  /// No description provided for @accountSessionUnknownDevice.
  ///
  /// In en, this message translates to:
  /// **'Unknown device'**
  String get accountSessionUnknownDevice;

  /// No description provided for @accountSessions.
  ///
  /// In en, this message translates to:
  /// **'Devices & sessions'**
  String get accountSessions;

  /// No description provided for @accountSessionsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No active sessions.'**
  String get accountSessionsEmpty;

  /// No description provided for @accountSessionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Devices & sessions'**
  String get accountSessionsTitle;

  /// No description provided for @accountSettingsSection.
  ///
  /// In en, this message translates to:
  /// **'Settings & privacy'**
  String get accountSettingsSection;

  /// No description provided for @accountTitle.
  ///
  /// In en, this message translates to:
  /// **'My account'**
  String get accountTitle;

  /// No description provided for @accountVerifyNow.
  ///
  /// In en, this message translates to:
  /// **'Verify now'**
  String get accountVerifyNow;

  /// No description provided for @authBackToLogin.
  ///
  /// In en, this message translates to:
  /// **'Back to sign in'**
  String get authBackToLogin;

  /// No description provided for @authConfirmPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get authConfirmPasswordLabel;

  /// No description provided for @authContinueAsGuest.
  ///
  /// In en, this message translates to:
  /// **'Continue as guest'**
  String get authContinueAsGuest;

  /// No description provided for @authDisplayNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Display name'**
  String get authDisplayNameLabel;

  /// No description provided for @authDisplayNameTooLong.
  ///
  /// In en, this message translates to:
  /// **'Name is too long (max {max} characters).'**
  String authDisplayNameTooLong(int max);

  /// No description provided for @authEmailInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address.'**
  String get authEmailInvalid;

  /// No description provided for @authEmailLabel.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get authEmailLabel;

  /// No description provided for @authForgotButton.
  ///
  /// In en, this message translates to:
  /// **'Send link'**
  String get authForgotButton;

  /// No description provided for @authForgotDone.
  ///
  /// In en, this message translates to:
  /// **'If an account exists for this email, you\'ll receive reset instructions.'**
  String get authForgotDone;

  /// No description provided for @authForgotIntro.
  ///
  /// In en, this message translates to:
  /// **'Enter your email and we\'ll send you a link to reset your password.'**
  String get authForgotIntro;

  /// No description provided for @authForgotPasswordLink.
  ///
  /// In en, this message translates to:
  /// **'Forgot password?'**
  String get authForgotPasswordLink;

  /// No description provided for @authForgotTitle.
  ///
  /// In en, this message translates to:
  /// **'Reset your password'**
  String get authForgotTitle;

  /// No description provided for @authGuestNote.
  ///
  /// In en, this message translates to:
  /// **'You can browse news, cars and stations without an account. An account is only needed for sync and personal features.'**
  String get authGuestNote;

  /// No description provided for @authHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'Already have an account?'**
  String get authHaveAccount;

  /// No description provided for @authHaveResetCode.
  ///
  /// In en, this message translates to:
  /// **'I have a reset code'**
  String get authHaveResetCode;

  /// No description provided for @authLoginButton.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get authLoginButton;

  /// No description provided for @authLoginTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get authLoginTitle;

  /// No description provided for @authNewPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get authNewPasswordLabel;

  /// No description provided for @authNoAccount.
  ///
  /// In en, this message translates to:
  /// **'No account yet?'**
  String get authNoAccount;

  /// No description provided for @authPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get authPasswordLabel;

  /// No description provided for @authPasswordTooLong.
  ///
  /// In en, this message translates to:
  /// **'Password is too long (max {max} characters).'**
  String authPasswordTooLong(int max);

  /// No description provided for @authPasswordTooShort.
  ///
  /// In en, this message translates to:
  /// **'Password must be at least {min} characters.'**
  String authPasswordTooShort(int min);

  /// No description provided for @authPasswordsDoNotMatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match.'**
  String get authPasswordsDoNotMatch;

  /// No description provided for @authRegisterButton.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get authRegisterButton;

  /// No description provided for @authRegisterSuccessMessage.
  ///
  /// In en, this message translates to:
  /// **'We sent a confirmation link to {email}. Open it from your inbox to verify your account, then sign in.'**
  String authRegisterSuccessMessage(String email);

  /// No description provided for @authRegisterSuccessTitle.
  ///
  /// In en, this message translates to:
  /// **'Account created'**
  String get authRegisterSuccessTitle;

  /// No description provided for @authRegisterTitle.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get authRegisterTitle;

  /// No description provided for @authRequired.
  ///
  /// In en, this message translates to:
  /// **'This field is required.'**
  String get authRequired;

  /// No description provided for @authResendVerification.
  ///
  /// In en, this message translates to:
  /// **'Resend verification link'**
  String get authResendVerification;

  /// No description provided for @authResendVerificationDone.
  ///
  /// In en, this message translates to:
  /// **'If the account exists and is not verified yet, a new link is on its way.'**
  String get authResendVerificationDone;

  /// No description provided for @authResetButton.
  ///
  /// In en, this message translates to:
  /// **'Save password'**
  String get authResetButton;

  /// No description provided for @authResetDone.
  ///
  /// In en, this message translates to:
  /// **'Your password has been changed. Sign in with your new password.'**
  String get authResetDone;

  /// No description provided for @authResetTitle.
  ///
  /// In en, this message translates to:
  /// **'Set a new password'**
  String get authResetTitle;

  /// No description provided for @authResetTokenLabel.
  ///
  /// In en, this message translates to:
  /// **'Reset code'**
  String get authResetTokenLabel;

  /// No description provided for @authVerifyButton.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get authVerifyButton;

  /// Button shown when sign-in is refused because the e-mail address is not verified yet.
  ///
  /// In en, this message translates to:
  /// **'Verify my email'**
  String get authVerifyEmailAction;

  /// No description provided for @authVerifyIntro.
  ///
  /// In en, this message translates to:
  /// **'Open the verification link we emailed you on this device, or paste the verification code here.'**
  String get authVerifyIntro;

  /// No description provided for @authVerifySuccess.
  ///
  /// In en, this message translates to:
  /// **'Your email has been verified.'**
  String get authVerifySuccess;

  /// No description provided for @authVerifyTitle.
  ///
  /// In en, this message translates to:
  /// **'Verify email'**
  String get authVerifyTitle;

  /// No description provided for @authVerifyTokenLabel.
  ///
  /// In en, this message translates to:
  /// **'Verification code'**
  String get authVerifyTokenLabel;

  /// No description provided for @calculatorsTitle.
  ///
  /// In en, this message translates to:
  /// **'Charging & running-cost calculators'**
  String get calculatorsTitle;

  /// No description provided for @carsBrandTitle.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get carsBrandTitle;

  /// No description provided for @carsCatalogTitle.
  ///
  /// In en, this message translates to:
  /// **'Car catalog'**
  String get carsCatalogTitle;

  /// No description provided for @carsDetailTitle.
  ///
  /// In en, this message translates to:
  /// **'Car details'**
  String get carsDetailTitle;

  /// No description provided for @chargingLogsTitle.
  ///
  /// In en, this message translates to:
  /// **'Charging log'**
  String get chargingLogsTitle;

  /// No description provided for @chargingStationTitle.
  ///
  /// In en, this message translates to:
  /// **'Station details'**
  String get chargingStationTitle;

  /// No description provided for @chargingTitle.
  ///
  /// In en, this message translates to:
  /// **'Charging stations'**
  String get chargingTitle;

  /// Shown whenever cached data is displayed instead of live data.
  ///
  /// In en, this message translates to:
  /// **'Saved copy from {time}; it may not be up to date.'**
  String commonCachedDataNotice(String time);

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get commonClose;

  /// No description provided for @commonConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get commonConfirm;

  /// No description provided for @commonCreateAccount.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get commonCreateAccount;

  /// No description provided for @commonDaysAgo.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 day ago} other{{count} days ago}}'**
  String commonDaysAgo(int count);

  /// Label for isDemo=true records.
  ///
  /// In en, this message translates to:
  /// **'Demo data'**
  String get commonDemoLabel;

  /// No description provided for @commonEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'There are no items to show right now.'**
  String get commonEmptyMessage;

  /// No description provided for @commonEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Nothing here yet'**
  String get commonEmptyTitle;

  /// No description provided for @commonErrorGeneric.
  ///
  /// In en, this message translates to:
  /// **'The request could not be completed. Please try again.'**
  String get commonErrorGeneric;

  /// No description provided for @commonErrorTitle.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get commonErrorTitle;

  /// Replaces embedded videos in article HTML.
  ///
  /// In en, this message translates to:
  /// **'Watch the video at its source'**
  String get commonExternalVideo;

  /// No description provided for @commonForbiddenMessage.
  ///
  /// In en, this message translates to:
  /// **'You don\'t have access to this content.'**
  String get commonForbiddenMessage;

  /// No description provided for @commonHidePassword.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get commonHidePassword;

  /// No description provided for @commonHoursAgo.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 hour ago} other{{count} hours ago}}'**
  String commonHoursAgo(int count);

  /// No description provided for @commonJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get commonJustNow;

  /// No description provided for @commonLinkOpenFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t open the link.'**
  String get commonLinkOpenFailed;

  /// No description provided for @commonLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading…'**
  String get commonLoading;

  /// No description provided for @commonMinutesAgo.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 minute ago} other{{count} minutes ago}}'**
  String commonMinutesAgo(int count);

  /// Shown instead of a missing value (never 0).
  ///
  /// In en, this message translates to:
  /// **'Not available'**
  String get commonNotAvailable;

  /// No description provided for @commonNotConfiguredMessage.
  ///
  /// In en, this message translates to:
  /// **'This service has not been set up by the administrators yet.'**
  String get commonNotConfiguredMessage;

  /// No description provided for @commonNotConfiguredTitle.
  ///
  /// In en, this message translates to:
  /// **'Service not configured'**
  String get commonNotConfiguredTitle;

  /// No description provided for @commonNotFoundMessage.
  ///
  /// In en, this message translates to:
  /// **'The requested content does not exist or is no longer available.'**
  String get commonNotFoundMessage;

  /// No description provided for @commonOfflineBanner.
  ///
  /// In en, this message translates to:
  /// **'You are offline'**
  String get commonOfflineBanner;

  /// No description provided for @commonOfflineMessage.
  ///
  /// In en, this message translates to:
  /// **'Check your connection and try again. Content you saved is still available offline.'**
  String get commonOfflineMessage;

  /// No description provided for @commonOfflineTitle.
  ///
  /// In en, this message translates to:
  /// **'You\'re offline'**
  String get commonOfflineTitle;

  /// No description provided for @commonOpenSettings.
  ///
  /// In en, this message translates to:
  /// **'Open device settings'**
  String get commonOpenSettings;

  /// No description provided for @commonPermissionDeniedMessage.
  ///
  /// In en, this message translates to:
  /// **'This feature needs a permission that has not been granted. You can allow it in the device settings.'**
  String get commonPermissionDeniedMessage;

  /// No description provided for @commonPermissionDeniedTitle.
  ///
  /// In en, this message translates to:
  /// **'Permission not granted'**
  String get commonPermissionDeniedTitle;

  /// No description provided for @commonRateLimitedMessage.
  ///
  /// In en, this message translates to:
  /// **'Too many requests. Please wait a moment and try again.'**
  String get commonRateLimitedMessage;

  /// No description provided for @commonReliabilityDisputed.
  ///
  /// In en, this message translates to:
  /// **'Disputed'**
  String get commonReliabilityDisputed;

  /// No description provided for @commonReliabilityEstimated.
  ///
  /// In en, this message translates to:
  /// **'Estimated'**
  String get commonReliabilityEstimated;

  /// No description provided for @commonReliabilityLabel.
  ///
  /// In en, this message translates to:
  /// **'Reliability: {level}'**
  String commonReliabilityLabel(String level);

  /// No description provided for @commonReliabilityManufacturerClaim.
  ///
  /// In en, this message translates to:
  /// **'Manufacturer claim'**
  String get commonReliabilityManufacturerClaim;

  /// No description provided for @commonReliabilityUnverified.
  ///
  /// In en, this message translates to:
  /// **'Unverified'**
  String get commonReliabilityUnverified;

  /// No description provided for @commonReliabilityVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get commonReliabilityVerified;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get commonRetry;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @commonSeeAll.
  ///
  /// In en, this message translates to:
  /// **'See all'**
  String get commonSeeAll;

  /// No description provided for @commonServerErrorMessage.
  ///
  /// In en, this message translates to:
  /// **'The server is currently unavailable. Please try again later.'**
  String get commonServerErrorMessage;

  /// No description provided for @commonShowPassword.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get commonShowPassword;

  /// No description provided for @commonSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get commonSignIn;

  /// No description provided for @commonSignInRequiredMessage.
  ///
  /// In en, this message translates to:
  /// **'This feature stores your personal data, so it needs an account. You can keep browsing the rest of the app without one.'**
  String get commonSignInRequiredMessage;

  /// No description provided for @commonSignInRequiredTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to continue'**
  String get commonSignInRequiredTitle;

  /// No description provided for @commonSource.
  ///
  /// In en, this message translates to:
  /// **'Source: {source}'**
  String commonSource(String source);

  /// No description provided for @commonSourceUnknown.
  ///
  /// In en, this message translates to:
  /// **'Source not specified'**
  String get commonSourceUnknown;

  /// No description provided for @commonTimeoutMessage.
  ///
  /// In en, this message translates to:
  /// **'The server took too long to respond. Please try again.'**
  String get commonTimeoutMessage;

  /// No description provided for @commonUnderConstructionMessage.
  ///
  /// In en, this message translates to:
  /// **'This screen is not built yet and shows no data until it is connected to the server.'**
  String get commonUnderConstructionMessage;

  /// No description provided for @commonUnderConstructionRequested.
  ///
  /// In en, this message translates to:
  /// **'Requested route: {path}'**
  String commonUnderConstructionRequested(String path);

  /// Honest placeholder for screens not built yet.
  ///
  /// In en, this message translates to:
  /// **'Under construction'**
  String get commonUnderConstructionTitle;

  /// No description provided for @commonVerifiedOn.
  ///
  /// In en, this message translates to:
  /// **'Verified on {date}'**
  String commonVerifiedOn(String date);

  /// No description provided for @compareRecommendationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Find the right car'**
  String get compareRecommendationsTitle;

  /// No description provided for @compareSharedTitle.
  ///
  /// In en, this message translates to:
  /// **'Shared comparison'**
  String get compareSharedTitle;

  /// No description provided for @compareTitle.
  ///
  /// In en, this message translates to:
  /// **'Comparisons'**
  String get compareTitle;

  /// No description provided for @encyclopediaEntryTitle.
  ///
  /// In en, this message translates to:
  /// **'Encyclopedia entry'**
  String get encyclopediaEntryTitle;

  /// No description provided for @encyclopediaTitle.
  ///
  /// In en, this message translates to:
  /// **'EV encyclopedia'**
  String get encyclopediaTitle;

  /// No description provided for @favoritesSavedOfflineTitle.
  ///
  /// In en, this message translates to:
  /// **'Saved for offline reading'**
  String get favoritesSavedOfflineTitle;

  /// No description provided for @favoritesTitle.
  ///
  /// In en, this message translates to:
  /// **'Favorites'**
  String get favoritesTitle;

  /// No description provided for @garageTitle.
  ///
  /// In en, this message translates to:
  /// **'My garage'**
  String get garageTitle;

  /// No description provided for @homeTitle.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get homeTitle;

  /// No description provided for @newsArticleTitle.
  ///
  /// In en, this message translates to:
  /// **'Article'**
  String get newsArticleTitle;

  /// No description provided for @newsListTitle.
  ///
  /// In en, this message translates to:
  /// **'News'**
  String get newsListTitle;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @remindersTitle.
  ///
  /// In en, this message translates to:
  /// **'Reminders'**
  String get remindersTitle;

  /// No description provided for @searchTitle.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get searchTitle;

  /// No description provided for @servicesDirectoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Services directory'**
  String get servicesDirectoryTitle;

  /// No description provided for @settingsAboutSection.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get settingsAboutSection;

  /// No description provided for @settingsClearCache.
  ///
  /// In en, this message translates to:
  /// **'Clear cached data'**
  String get settingsClearCache;

  /// No description provided for @settingsClearCacheConfirm.
  ///
  /// In en, this message translates to:
  /// **'Clear cached data?'**
  String get settingsClearCacheConfirm;

  /// No description provided for @settingsClearCacheDone.
  ///
  /// In en, this message translates to:
  /// **'Cached data cleared.'**
  String get settingsClearCacheDone;

  /// No description provided for @settingsClearCacheSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Removes temporary copies of content. Items you saved for offline reading are kept.'**
  String get settingsClearCacheSubtitle;

  /// No description provided for @settingsConfigCache.
  ///
  /// In en, this message translates to:
  /// **'Using saved server settings from {time}'**
  String settingsConfigCache(String time);

  /// No description provided for @settingsConfigFallback.
  ///
  /// In en, this message translates to:
  /// **'The server could not be reached; the built-in default settings are in use.'**
  String get settingsConfigFallback;

  /// No description provided for @settingsConfigNetwork.
  ///
  /// In en, this message translates to:
  /// **'Server settings up to date ({time})'**
  String settingsConfigNetwork(String time);

  /// No description provided for @settingsConfigRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh server settings'**
  String get settingsConfigRefresh;

  /// No description provided for @settingsDataSection.
  ///
  /// In en, this message translates to:
  /// **'Data'**
  String get settingsDataSection;

  /// No description provided for @settingsDigitsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Used only when the app language is Arabic.'**
  String get settingsDigitsSubtitle;

  /// No description provided for @settingsDigitsTitle.
  ///
  /// In en, this message translates to:
  /// **'Arabic-Indic digits (٠١٢٣)'**
  String get settingsDigitsTitle;

  /// No description provided for @settingsFontPreviewNumbers.
  ///
  /// In en, this message translates to:
  /// **'Numbers and date example: {number} — {date}'**
  String settingsFontPreviewNumbers(String number, String date);

  /// No description provided for @settingsFontPreviewSample.
  ///
  /// In en, this message translates to:
  /// **'Sample text: news, car catalog, comparisons and charging stations.'**
  String get settingsFontPreviewSample;

  /// No description provided for @settingsFontPreviewTitle.
  ///
  /// In en, this message translates to:
  /// **'Preview'**
  String get settingsFontPreviewTitle;

  /// No description provided for @settingsLanguageArabic.
  ///
  /// In en, this message translates to:
  /// **'العربية (Arabic)'**
  String get settingsLanguageArabic;

  /// No description provided for @settingsLanguageEnglish.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get settingsLanguageEnglish;

  /// No description provided for @settingsLanguageHint.
  ///
  /// In en, this message translates to:
  /// **'The app language is independent of the market; you can read any market in either language.'**
  String get settingsLanguageHint;

  /// No description provided for @settingsLanguageSection.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguageSection;

  /// No description provided for @settingsLanguageSystem.
  ///
  /// In en, this message translates to:
  /// **'Device language'**
  String get settingsLanguageSystem;

  /// No description provided for @settingsLicenses.
  ///
  /// In en, this message translates to:
  /// **'Software and font licences'**
  String get settingsLicenses;

  /// No description provided for @settingsMarketCurrency.
  ///
  /// In en, this message translates to:
  /// **'Currency: {currency}'**
  String settingsMarketCurrency(String currency);

  /// No description provided for @settingsMarketHint.
  ///
  /// In en, this message translates to:
  /// **'The market sets prices, availability and currency. Choosing a market does not mean charging station data is available there.'**
  String get settingsMarketHint;

  /// No description provided for @settingsMarketSection.
  ///
  /// In en, this message translates to:
  /// **'Market (country)'**
  String get settingsMarketSection;

  /// No description provided for @settingsMarketsUnavailable.
  ///
  /// In en, this message translates to:
  /// **'No markets are enabled in the server settings.'**
  String get settingsMarketsUnavailable;

  /// No description provided for @settingsPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy policy'**
  String get settingsPrivacy;

  /// No description provided for @settingsTerms.
  ///
  /// In en, this message translates to:
  /// **'Terms of use'**
  String get settingsTerms;

  /// No description provided for @settingsTextSizeDecrease.
  ///
  /// In en, this message translates to:
  /// **'Smaller text'**
  String get settingsTextSizeDecrease;

  /// No description provided for @settingsTextSizeHint.
  ///
  /// In en, this message translates to:
  /// **'Applied on top of the text size chosen in your device settings.'**
  String get settingsTextSizeHint;

  /// No description provided for @settingsTextSizeIncrease.
  ///
  /// In en, this message translates to:
  /// **'Larger text'**
  String get settingsTextSizeIncrease;

  /// No description provided for @settingsTextSizeSection.
  ///
  /// In en, this message translates to:
  /// **'Text size'**
  String get settingsTextSizeSection;

  /// No description provided for @settingsThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsThemeDark;

  /// No description provided for @settingsThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsThemeLight;

  /// No description provided for @settingsThemeSection.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsThemeSection;

  /// No description provided for @settingsThemeSystem.
  ///
  /// In en, this message translates to:
  /// **'Follow device'**
  String get settingsThemeSystem;

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsVersion.
  ///
  /// In en, this message translates to:
  /// **'Version {version}'**
  String settingsVersion(String version);

  /// No description provided for @settingsVersionUnknown.
  ///
  /// In en, this message translates to:
  /// **'Version unknown'**
  String get settingsVersionUnknown;

  /// No description provided for @shellGoHome.
  ///
  /// In en, this message translates to:
  /// **'Back to home'**
  String get shellGoHome;

  /// No description provided for @shellNavAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get shellNavAccount;

  /// No description provided for @shellNavCars.
  ///
  /// In en, this message translates to:
  /// **'Cars'**
  String get shellNavCars;

  /// No description provided for @shellNavCharging.
  ///
  /// In en, this message translates to:
  /// **'Charging'**
  String get shellNavCharging;

  /// No description provided for @shellNavCompare.
  ///
  /// In en, this message translates to:
  /// **'Compare'**
  String get shellNavCompare;

  /// No description provided for @shellNavHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get shellNavHome;

  /// No description provided for @shellNotificationsTooltip.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get shellNotificationsTooltip;

  /// No description provided for @shellRouteNotFoundMessage.
  ///
  /// In en, this message translates to:
  /// **'There is no screen at this address in the app.'**
  String get shellRouteNotFoundMessage;

  /// No description provided for @shellRouteNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Page not found'**
  String get shellRouteNotFoundTitle;

  /// No description provided for @shellSearchTooltip.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get shellSearchTooltip;

  /// No description provided for @shellSessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Your session has ended. Please sign in again.'**
  String get shellSessionExpired;

  /// No description provided for @toursViewerTitle.
  ///
  /// In en, this message translates to:
  /// **'360° interior tour'**
  String get toursViewerTitle;

  /// No description provided for @tripsTitle.
  ///
  /// In en, this message translates to:
  /// **'Trip planner'**
  String get tripsTitle;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
