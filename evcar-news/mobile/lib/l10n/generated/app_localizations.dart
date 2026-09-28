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

  /// No description provided for @accountCarsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 car} other{{count} cars}}'**
  String accountCarsCount(int count);

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

  /// No description provided for @accountTripPlannerExplain.
  ///
  /// In en, this message translates to:
  /// **'Trip planning needs a road-routing service, which is not configured on the server yet. We do not draw straight lines as driving routes or invent plans, so the planner stays hidden until it is. Meanwhile, every station page offers directions in your navigation app.'**
  String get accountTripPlannerExplain;

  /// No description provided for @accountTripPlannerUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Not available yet'**
  String get accountTripPlannerUnavailable;

  /// No description provided for @accountUnreadCount.
  ///
  /// In en, this message translates to:
  /// **'{count} new'**
  String accountUnreadCount(int count);

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

  /// No description provided for @calculatorsAcLimitHint.
  ///
  /// In en, this message translates to:
  /// **'Often 7.4, 11 or 22 kW. Unknown = lower confidence.'**
  String get calculatorsAcLimitHint;

  /// No description provided for @calculatorsAssumptions.
  ///
  /// In en, this message translates to:
  /// **'Values and assumptions used'**
  String get calculatorsAssumptions;

  /// No description provided for @calculatorsAssumptionsHint.
  ///
  /// In en, this message translates to:
  /// **'Change any of them above and calculate again.'**
  String get calculatorsAssumptionsHint;

  /// No description provided for @calculatorsBasisBattery.
  ///
  /// In en, this message translates to:
  /// **'Added to the battery'**
  String get calculatorsBasisBattery;

  /// No description provided for @calculatorsBasisBatteryConsumption.
  ///
  /// In en, this message translates to:
  /// **'From the car\'s display'**
  String get calculatorsBasisBatteryConsumption;

  /// No description provided for @calculatorsBasisGrid.
  ///
  /// In en, this message translates to:
  /// **'From the meter / charger'**
  String get calculatorsBasisGrid;

  /// No description provided for @calculatorsBasisGridConsumption.
  ///
  /// In en, this message translates to:
  /// **'At the plug (WLTP/EPA)'**
  String get calculatorsBasisGridConsumption;

  /// No description provided for @calculatorsCalculate.
  ///
  /// In en, this message translates to:
  /// **'Calculate'**
  String get calculatorsCalculate;

  /// No description provided for @calculatorsCalculatorTitle.
  ///
  /// In en, this message translates to:
  /// **'Calculator'**
  String get calculatorsCalculatorTitle;

  /// No description provided for @calculatorsCarNeedsNetwork.
  ///
  /// In en, this message translates to:
  /// **'Using a car\'s data needs a connection. Remove the car to calculate offline with your own values.'**
  String get calculatorsCarNeedsNetwork;

  /// No description provided for @calculatorsCarOptional.
  ///
  /// In en, this message translates to:
  /// **'Optional: fill missing values from a car'**
  String get calculatorsCarOptional;

  /// No description provided for @calculatorsCarSelectedHint.
  ///
  /// In en, this message translates to:
  /// **'Empty fields are filled from this car\'s catalog data'**
  String get calculatorsCarSelectedHint;

  /// No description provided for @calculatorsChooseCar.
  ///
  /// In en, this message translates to:
  /// **'Use a car\'s data'**
  String get calculatorsChooseCar;

  /// No description provided for @calculatorsChooseCarHint.
  ///
  /// In en, this message translates to:
  /// **'Missing values (battery, charging power, consumption) are filled from the catalog, with their source. Values you type always win. Needs an internet connection.'**
  String get calculatorsChooseCarHint;

  /// No description provided for @calculatorsCompareFuelCar.
  ///
  /// In en, this message translates to:
  /// **'Compare with a fuel car'**
  String get calculatorsCompareFuelCar;

  /// No description provided for @calculatorsConfidenceHigh.
  ///
  /// In en, this message translates to:
  /// **'High confidence'**
  String get calculatorsConfidenceHigh;

  /// No description provided for @calculatorsConfidenceLow.
  ///
  /// In en, this message translates to:
  /// **'Low confidence'**
  String get calculatorsConfidenceLow;

  /// No description provided for @calculatorsConfidenceMedium.
  ///
  /// In en, this message translates to:
  /// **'Medium confidence'**
  String get calculatorsConfidenceMedium;

  /// No description provided for @calculatorsConsumptionBasis.
  ///
  /// In en, this message translates to:
  /// **'The consumption I enter is measured'**
  String get calculatorsConsumptionBasis;

  /// No description provided for @calculatorsConsumptionHint.
  ///
  /// In en, this message translates to:
  /// **'From your car or a rating such as WLTP. Cycles are not converted.'**
  String get calculatorsConsumptionHint;

  /// No description provided for @calculatorsCostEnergy.
  ///
  /// In en, this message translates to:
  /// **'Energy'**
  String get calculatorsCostEnergy;

  /// No description provided for @calculatorsCostIdle.
  ///
  /// In en, this message translates to:
  /// **'Idle fee'**
  String get calculatorsCostIdle;

  /// No description provided for @calculatorsCostParking.
  ///
  /// In en, this message translates to:
  /// **'Parking'**
  String get calculatorsCostParking;

  /// No description provided for @calculatorsCostPer100.
  ///
  /// In en, this message translates to:
  /// **'Cost per 100 km'**
  String get calculatorsCostPer100;

  /// No description provided for @calculatorsCostPerKm.
  ///
  /// In en, this message translates to:
  /// **'Cost per km'**
  String get calculatorsCostPerKm;

  /// No description provided for @calculatorsCostPerKwhAdded.
  ///
  /// In en, this message translates to:
  /// **'Cost per kWh added'**
  String get calculatorsCostPerKwhAdded;

  /// No description provided for @calculatorsCostSession.
  ///
  /// In en, this message translates to:
  /// **'Session fee'**
  String get calculatorsCostSession;

  /// No description provided for @calculatorsCostTime.
  ///
  /// In en, this message translates to:
  /// **'Time'**
  String get calculatorsCostTime;

  /// No description provided for @calculatorsCurrency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get calculatorsCurrency;

  /// No description provided for @calculatorsDcCurveHint.
  ///
  /// In en, this message translates to:
  /// **'A precise DC time needs the car\'s documented charging curve, which comes from the catalog when you choose a car. Without it you get a low-confidence range.'**
  String get calculatorsDcCurveHint;

  /// No description provided for @calculatorsDifferenceHint.
  ///
  /// In en, this message translates to:
  /// **'Fuel cost minus electricity cost; a negative value means the EV costs more.'**
  String get calculatorsDifferenceHint;

  /// No description provided for @calculatorsDifferencePer100.
  ///
  /// In en, this message translates to:
  /// **'You save per 100 km'**
  String get calculatorsDifferencePer100;

  /// No description provided for @calculatorsDifferencePerMonth.
  ///
  /// In en, this message translates to:
  /// **'Difference per month'**
  String get calculatorsDifferencePerMonth;

  /// No description provided for @calculatorsDifferencePerYear.
  ///
  /// In en, this message translates to:
  /// **'Difference per year'**
  String get calculatorsDifferencePerYear;

  /// No description provided for @calculatorsDuration.
  ///
  /// In en, this message translates to:
  /// **'Charging time'**
  String get calculatorsDuration;

  /// No description provided for @calculatorsDurationRange.
  ///
  /// In en, this message translates to:
  /// **'Estimated range'**
  String get calculatorsDurationRange;

  /// No description provided for @calculatorsEffectiveFrom.
  ///
  /// In en, this message translates to:
  /// **'Effective {date}'**
  String calculatorsEffectiveFrom(String date);

  /// No description provided for @calculatorsEfficiencyHint.
  ///
  /// In en, this message translates to:
  /// **'A fraction, e.g. 0.9 = 90%. Empty = 0.9, shown as an editable assumption.'**
  String get calculatorsEfficiencyHint;

  /// No description provided for @calculatorsEnergyAdded.
  ///
  /// In en, this message translates to:
  /// **'Energy added to the battery'**
  String get calculatorsEnergyAdded;

  /// No description provided for @calculatorsEnergyCost.
  ///
  /// In en, this message translates to:
  /// **'Energy / fuel'**
  String get calculatorsEnergyCost;

  /// No description provided for @calculatorsEnergyPerMonth.
  ///
  /// In en, this message translates to:
  /// **'Energy cost per month'**
  String get calculatorsEnergyPerMonth;

  /// No description provided for @calculatorsEnterMyOwn.
  ///
  /// In en, this message translates to:
  /// **'Enter my own price'**
  String get calculatorsEnterMyOwn;

  /// No description provided for @calculatorsEv.
  ///
  /// In en, this message translates to:
  /// **'Electric'**
  String get calculatorsEv;

  /// No description provided for @calculatorsEvPer100.
  ///
  /// In en, this message translates to:
  /// **'Electric per 100 km'**
  String get calculatorsEvPer100;

  /// No description provided for @calculatorsEvPerMonth.
  ///
  /// In en, this message translates to:
  /// **'Electric per month'**
  String get calculatorsEvPerMonth;

  /// No description provided for @calculatorsEvTotal.
  ///
  /// In en, this message translates to:
  /// **'Electric car total'**
  String get calculatorsEvTotal;

  /// No description provided for @calculatorsFees.
  ///
  /// In en, this message translates to:
  /// **'Licence & fees'**
  String get calculatorsFees;

  /// No description provided for @calculatorsFieldAcLimit.
  ///
  /// In en, this message translates to:
  /// **'Car on-board AC charger'**
  String get calculatorsFieldAcLimit;

  /// No description provided for @calculatorsFieldAmps.
  ///
  /// In en, this message translates to:
  /// **'Current per phase'**
  String get calculatorsFieldAmps;

  /// No description provided for @calculatorsFieldChargingMinutes.
  ///
  /// In en, this message translates to:
  /// **'Charging time'**
  String get calculatorsFieldChargingMinutes;

  /// No description provided for @calculatorsFieldConsumption.
  ///
  /// In en, this message translates to:
  /// **'Consumption'**
  String get calculatorsFieldConsumption;

  /// No description provided for @calculatorsFieldDcPeak.
  ///
  /// In en, this message translates to:
  /// **'Car peak DC power'**
  String get calculatorsFieldDcPeak;

  /// No description provided for @calculatorsFieldEfficiency.
  ///
  /// In en, this message translates to:
  /// **'Charging efficiency'**
  String get calculatorsFieldEfficiency;

  /// No description provided for @calculatorsFieldElectricityPrice.
  ///
  /// In en, this message translates to:
  /// **'Main electricity price (home)'**
  String get calculatorsFieldElectricityPrice;

  /// No description provided for @calculatorsFieldEnergy.
  ///
  /// In en, this message translates to:
  /// **'Energy'**
  String get calculatorsFieldEnergy;

  /// No description provided for @calculatorsFieldFees.
  ///
  /// In en, this message translates to:
  /// **'Licence & fees per year'**
  String get calculatorsFieldFees;

  /// No description provided for @calculatorsFieldFixedFees.
  ///
  /// In en, this message translates to:
  /// **'Fixed monthly fees'**
  String get calculatorsFieldFixedFees;

  /// No description provided for @calculatorsFieldFromSoc.
  ///
  /// In en, this message translates to:
  /// **'Charge from'**
  String get calculatorsFieldFromSoc;

  /// No description provided for @calculatorsFieldFuelConsumption.
  ///
  /// In en, this message translates to:
  /// **'Fuel consumption'**
  String get calculatorsFieldFuelConsumption;

  /// No description provided for @calculatorsFieldFuelPrice.
  ///
  /// In en, this message translates to:
  /// **'Fuel price per litre'**
  String get calculatorsFieldFuelPrice;

  /// No description provided for @calculatorsFieldHomePrice.
  ///
  /// In en, this message translates to:
  /// **'Home electricity price'**
  String get calculatorsFieldHomePrice;

  /// No description provided for @calculatorsFieldIdleGrace.
  ///
  /// In en, this message translates to:
  /// **'Free idle minutes'**
  String get calculatorsFieldIdleGrace;

  /// No description provided for @calculatorsFieldIdleMinutes.
  ///
  /// In en, this message translates to:
  /// **'Idle time after charging'**
  String get calculatorsFieldIdleMinutes;

  /// No description provided for @calculatorsFieldIdlePrice.
  ///
  /// In en, this message translates to:
  /// **'Idle fee per minute'**
  String get calculatorsFieldIdlePrice;

  /// No description provided for @calculatorsFieldIncentives.
  ///
  /// In en, this message translates to:
  /// **'Incentives'**
  String get calculatorsFieldIncentives;

  /// No description provided for @calculatorsFieldInsurance.
  ///
  /// In en, this message translates to:
  /// **'Insurance per year'**
  String get calculatorsFieldInsurance;

  /// No description provided for @calculatorsFieldKmPerDay.
  ///
  /// In en, this message translates to:
  /// **'Distance per day'**
  String get calculatorsFieldKmPerDay;

  /// No description provided for @calculatorsFieldKmPerMonth.
  ///
  /// In en, this message translates to:
  /// **'Distance per month'**
  String get calculatorsFieldKmPerMonth;

  /// No description provided for @calculatorsFieldKmPerYear.
  ///
  /// In en, this message translates to:
  /// **'Distance per year'**
  String get calculatorsFieldKmPerYear;

  /// No description provided for @calculatorsFieldMaintenance.
  ///
  /// In en, this message translates to:
  /// **'Maintenance per year'**
  String get calculatorsFieldMaintenance;

  /// No description provided for @calculatorsFieldOneOff.
  ///
  /// In en, this message translates to:
  /// **'One-off costs'**
  String get calculatorsFieldOneOff;

  /// No description provided for @calculatorsFieldParkingFlat.
  ///
  /// In en, this message translates to:
  /// **'Flat parking fee'**
  String get calculatorsFieldParkingFlat;

  /// No description provided for @calculatorsFieldParkingMinutes.
  ///
  /// In en, this message translates to:
  /// **'Parking time'**
  String get calculatorsFieldParkingMinutes;

  /// No description provided for @calculatorsFieldParkingPerHour.
  ///
  /// In en, this message translates to:
  /// **'Parking per hour'**
  String get calculatorsFieldParkingPerHour;

  /// No description provided for @calculatorsFieldPublicEnergyPrice.
  ///
  /// In en, this message translates to:
  /// **'Price per kWh'**
  String get calculatorsFieldPublicEnergyPrice;

  /// No description provided for @calculatorsFieldPublicPrice.
  ///
  /// In en, this message translates to:
  /// **'Public charging price'**
  String get calculatorsFieldPublicPrice;

  /// No description provided for @calculatorsFieldPublicShare.
  ///
  /// In en, this message translates to:
  /// **'Share of public charging'**
  String get calculatorsFieldPublicShare;

  /// No description provided for @calculatorsFieldPurchase.
  ///
  /// In en, this message translates to:
  /// **'Purchase price'**
  String get calculatorsFieldPurchase;

  /// No description provided for @calculatorsFieldResidual.
  ///
  /// In en, this message translates to:
  /// **'Resale value at the end'**
  String get calculatorsFieldResidual;

  /// No description provided for @calculatorsFieldSessionFee.
  ///
  /// In en, this message translates to:
  /// **'Session fee'**
  String get calculatorsFieldSessionFee;

  /// No description provided for @calculatorsFieldStationPower.
  ///
  /// In en, this message translates to:
  /// **'Charger / station power'**
  String get calculatorsFieldStationPower;

  /// No description provided for @calculatorsFieldTimePrice.
  ///
  /// In en, this message translates to:
  /// **'Price per minute of charging'**
  String get calculatorsFieldTimePrice;

  /// No description provided for @calculatorsFieldToSoc.
  ///
  /// In en, this message translates to:
  /// **'Charge to'**
  String get calculatorsFieldToSoc;

  /// No description provided for @calculatorsFieldUsable.
  ///
  /// In en, this message translates to:
  /// **'Usable battery capacity'**
  String get calculatorsFieldUsable;

  /// No description provided for @calculatorsFieldVolts.
  ///
  /// In en, this message translates to:
  /// **'Volts per phase'**
  String get calculatorsFieldVolts;

  /// No description provided for @calculatorsFieldYears.
  ///
  /// In en, this message translates to:
  /// **'Years of ownership'**
  String get calculatorsFieldYears;

  /// No description provided for @calculatorsFixedFees.
  ///
  /// In en, this message translates to:
  /// **'Fixed fees'**
  String get calculatorsFixedFees;

  /// No description provided for @calculatorsFromCarHint.
  ///
  /// In en, this message translates to:
  /// **'Leave empty to use the car\'s catalog value.'**
  String get calculatorsFromCarHint;

  /// No description provided for @calculatorsFuelCar.
  ///
  /// In en, this message translates to:
  /// **'Fuel'**
  String get calculatorsFuelCar;

  /// No description provided for @calculatorsFuelPer100.
  ///
  /// In en, this message translates to:
  /// **'Fuel per 100 km'**
  String get calculatorsFuelPer100;

  /// No description provided for @calculatorsFuelPerMonth.
  ///
  /// In en, this message translates to:
  /// **'Fuel per month'**
  String get calculatorsFuelPerMonth;

  /// No description provided for @calculatorsGridConsumption.
  ///
  /// In en, this message translates to:
  /// **'Consumption from the grid'**
  String get calculatorsGridConsumption;

  /// No description provided for @calculatorsGridEnergy.
  ///
  /// In en, this message translates to:
  /// **'Energy from the grid'**
  String get calculatorsGridEnergy;

  /// No description provided for @calculatorsHomeDescription.
  ///
  /// In en, this message translates to:
  /// **'Energy added, energy from the grid with losses, and the cost at your home tariff.'**
  String get calculatorsHomeDescription;

  /// No description provided for @calculatorsHomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Home charging cost'**
  String get calculatorsHomeTitle;

  /// No description provided for @calculatorsHowCalculated.
  ///
  /// In en, this message translates to:
  /// **'How it was calculated'**
  String get calculatorsHowCalculated;

  /// No description provided for @calculatorsIncentives.
  ///
  /// In en, this message translates to:
  /// **'Incentives'**
  String get calculatorsIncentives;

  /// No description provided for @calculatorsInsurance.
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get calculatorsInsurance;

  /// No description provided for @calculatorsIntro.
  ///
  /// In en, this message translates to:
  /// **'Results are computed from the values you enter, with the same formulas as our server. There are no built-in prices: enter today\'s prices or pick an admin reference price with its date and source.'**
  String get calculatorsIntro;

  /// No description provided for @calculatorsKmPerMonth.
  ///
  /// In en, this message translates to:
  /// **'Distance per month'**
  String get calculatorsKmPerMonth;

  /// No description provided for @calculatorsKwhPerMonth.
  ///
  /// In en, this message translates to:
  /// **'Energy per month'**
  String get calculatorsKwhPerMonth;

  /// No description provided for @calculatorsLimitCurve.
  ///
  /// In en, this message translates to:
  /// **'The charging curve'**
  String get calculatorsLimitCurve;

  /// No description provided for @calculatorsLimitStation.
  ///
  /// In en, this message translates to:
  /// **'The charger'**
  String get calculatorsLimitStation;

  /// No description provided for @calculatorsLimitSupply.
  ///
  /// In en, this message translates to:
  /// **'The home supply'**
  String get calculatorsLimitSupply;

  /// No description provided for @calculatorsLimitVehicle.
  ///
  /// In en, this message translates to:
  /// **'The car'**
  String get calculatorsLimitVehicle;

  /// No description provided for @calculatorsLimitingFactor.
  ///
  /// In en, this message translates to:
  /// **'Limited by'**
  String get calculatorsLimitingFactor;

  /// No description provided for @calculatorsLosses.
  ///
  /// In en, this message translates to:
  /// **'Charging losses'**
  String get calculatorsLosses;

  /// No description provided for @calculatorsMaintenance.
  ///
  /// In en, this message translates to:
  /// **'Maintenance'**
  String get calculatorsMaintenance;

  /// No description provided for @calculatorsModeEnergy.
  ///
  /// In en, this message translates to:
  /// **'Energy I know'**
  String get calculatorsModeEnergy;

  /// No description provided for @calculatorsModeSoc.
  ///
  /// In en, this message translates to:
  /// **'Battery & charge levels'**
  String get calculatorsModeSoc;

  /// No description provided for @calculatorsMonthlyDescription.
  ///
  /// In en, this message translates to:
  /// **'Monthly and yearly energy cost from your distance and consumption.'**
  String get calculatorsMonthlyDescription;

  /// No description provided for @calculatorsMonthlyTitle.
  ///
  /// In en, this message translates to:
  /// **'Monthly cost'**
  String get calculatorsMonthlyTitle;

  /// No description provided for @calculatorsNo.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get calculatorsNo;

  /// No description provided for @calculatorsNoCar.
  ///
  /// In en, this message translates to:
  /// **'Don\'t use a car'**
  String get calculatorsNoCar;

  /// No description provided for @calculatorsNoCarSelected.
  ///
  /// In en, this message translates to:
  /// **'No car selected'**
  String get calculatorsNoCarSelected;

  /// No description provided for @calculatorsNoDefaultPrices.
  ///
  /// In en, this message translates to:
  /// **'Prices change: the result shows the date of the prices you used.'**
  String get calculatorsNoDefaultPrices;

  /// No description provided for @calculatorsNoReferencePrices.
  ///
  /// In en, this message translates to:
  /// **'No reference prices for this market'**
  String get calculatorsNoReferencePrices;

  /// No description provided for @calculatorsNoReferencePricesHint.
  ///
  /// In en, this message translates to:
  /// **'Enter the price you pay. We never assume a price.'**
  String get calculatorsNoReferencePricesHint;

  /// No description provided for @calculatorsNonEnergy.
  ///
  /// In en, this message translates to:
  /// **'Everything except energy'**
  String get calculatorsNonEnergy;

  /// No description provided for @calculatorsNotIncluded.
  ///
  /// In en, this message translates to:
  /// **'Not included'**
  String get calculatorsNotIncluded;

  /// No description provided for @calculatorsOnDevice.
  ///
  /// In en, this message translates to:
  /// **'Calculated on this phone'**
  String get calculatorsOnDevice;

  /// No description provided for @calculatorsOnServer.
  ///
  /// In en, this message translates to:
  /// **'Calculated with catalog data'**
  String get calculatorsOnServer;

  /// No description provided for @calculatorsOneOff.
  ///
  /// In en, this message translates to:
  /// **'One-off costs'**
  String get calculatorsOneOff;

  /// No description provided for @calculatorsOneOffHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. home charger installation.'**
  String get calculatorsOneOffHint;

  /// No description provided for @calculatorsOriginCatalog.
  ///
  /// In en, this message translates to:
  /// **'From catalog'**
  String get calculatorsOriginCatalog;

  /// No description provided for @calculatorsOriginDefault.
  ///
  /// In en, this message translates to:
  /// **'Default'**
  String get calculatorsOriginDefault;

  /// No description provided for @calculatorsOriginReference.
  ///
  /// In en, this message translates to:
  /// **'Reference price'**
  String get calculatorsOriginReference;

  /// No description provided for @calculatorsOriginUser.
  ///
  /// In en, this message translates to:
  /// **'You entered'**
  String get calculatorsOriginUser;

  /// No description provided for @calculatorsPer100Description.
  ///
  /// In en, this message translates to:
  /// **'What 100 km costs in electricity, with home and public prices mixed as you drive.'**
  String get calculatorsPer100Description;

  /// No description provided for @calculatorsPer100Title.
  ///
  /// In en, this message translates to:
  /// **'Cost per 100 km'**
  String get calculatorsPer100Title;

  /// No description provided for @calculatorsPerDayMode.
  ///
  /// In en, this message translates to:
  /// **'Per day'**
  String get calculatorsPerDayMode;

  /// No description provided for @calculatorsPerKm.
  ///
  /// In en, this message translates to:
  /// **'Per km'**
  String get calculatorsPerKm;

  /// No description provided for @calculatorsPerMonth.
  ///
  /// In en, this message translates to:
  /// **'Per month'**
  String get calculatorsPerMonth;

  /// No description provided for @calculatorsPerMonthMode.
  ///
  /// In en, this message translates to:
  /// **'Per month'**
  String get calculatorsPerMonthMode;

  /// No description provided for @calculatorsPerMonthTotal.
  ///
  /// In en, this message translates to:
  /// **'Per month'**
  String get calculatorsPerMonthTotal;

  /// No description provided for @calculatorsPerYear.
  ///
  /// In en, this message translates to:
  /// **'Per year'**
  String get calculatorsPerYear;

  /// No description provided for @calculatorsPerYearValue.
  ///
  /// In en, this message translates to:
  /// **'{amount} per year'**
  String calculatorsPerYearValue(String amount);

  /// No description provided for @calculatorsPickTrim.
  ///
  /// In en, this message translates to:
  /// **'Pick a trim from the catalog'**
  String get calculatorsPickTrim;

  /// No description provided for @calculatorsPossiblyOutdated.
  ///
  /// In en, this message translates to:
  /// **'May be outdated'**
  String get calculatorsPossiblyOutdated;

  /// No description provided for @calculatorsPower.
  ///
  /// In en, this message translates to:
  /// **'Power used'**
  String get calculatorsPower;

  /// No description provided for @calculatorsPriceDate.
  ///
  /// In en, this message translates to:
  /// **'Price date'**
  String get calculatorsPriceDate;

  /// No description provided for @calculatorsPriceDateFromReference.
  ///
  /// In en, this message translates to:
  /// **'Empty = the effective date of the reference price.'**
  String get calculatorsPriceDateFromReference;

  /// No description provided for @calculatorsPriceDateHint.
  ///
  /// In en, this message translates to:
  /// **'When these prices applied. Without a date the result says so.'**
  String get calculatorsPriceDateHint;

  /// No description provided for @calculatorsPriceDateMissing.
  ///
  /// In en, this message translates to:
  /// **'Price date not given'**
  String get calculatorsPriceDateMissing;

  /// No description provided for @calculatorsPriceDateNotSet.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get calculatorsPriceDateNotSet;

  /// No description provided for @calculatorsPricePerKwh.
  ///
  /// In en, this message translates to:
  /// **'Price per kWh used'**
  String get calculatorsPricePerKwh;

  /// No description provided for @calculatorsPricesAsOf.
  ///
  /// In en, this message translates to:
  /// **'Prices as of {date}'**
  String calculatorsPricesAsOf(String date);

  /// No description provided for @calculatorsPublicDescription.
  ///
  /// In en, this message translates to:
  /// **'Per-kWh, per-minute, session, parking and idle fees exactly as the operator charges them.'**
  String get calculatorsPublicDescription;

  /// No description provided for @calculatorsPublicTitle.
  ///
  /// In en, this message translates to:
  /// **'Public charging cost'**
  String get calculatorsPublicTitle;

  /// No description provided for @calculatorsPurchase.
  ///
  /// In en, this message translates to:
  /// **'Purchase'**
  String get calculatorsPurchase;

  /// No description provided for @calculatorsReferencePrices.
  ///
  /// In en, this message translates to:
  /// **'Reference prices'**
  String get calculatorsReferencePrices;

  /// No description provided for @calculatorsReferenceUsed.
  ///
  /// In en, this message translates to:
  /// **'Reference price: {label}, effective {date}'**
  String calculatorsReferenceUsed(String label, String date);

  /// No description provided for @calculatorsResidual.
  ///
  /// In en, this message translates to:
  /// **'Resale value'**
  String get calculatorsResidual;

  /// No description provided for @calculatorsResult.
  ///
  /// In en, this message translates to:
  /// **'Result'**
  String get calculatorsResult;

  /// No description provided for @calculatorsRoughEstimate.
  ///
  /// In en, this message translates to:
  /// **'Rough estimate — not an exact time'**
  String get calculatorsRoughEstimate;

  /// No description provided for @calculatorsSavingPercent.
  ///
  /// In en, this message translates to:
  /// **'Saving'**
  String get calculatorsSavingPercent;

  /// No description provided for @calculatorsSectionConsumption.
  ///
  /// In en, this message translates to:
  /// **'Consumption'**
  String get calculatorsSectionConsumption;

  /// No description provided for @calculatorsSectionDriving.
  ///
  /// In en, this message translates to:
  /// **'Driving'**
  String get calculatorsSectionDriving;

  /// No description provided for @calculatorsSectionDrivingOptional.
  ///
  /// In en, this message translates to:
  /// **'Driving (optional, for monthly figures)'**
  String get calculatorsSectionDrivingOptional;

  /// No description provided for @calculatorsSectionDurations.
  ///
  /// In en, this message translates to:
  /// **'Times at the charger'**
  String get calculatorsSectionDurations;

  /// No description provided for @calculatorsSectionEnergy.
  ///
  /// In en, this message translates to:
  /// **'Battery & energy'**
  String get calculatorsSectionEnergy;

  /// No description provided for @calculatorsSectionEvCosts.
  ///
  /// In en, this message translates to:
  /// **'Electric car costs'**
  String get calculatorsSectionEvCosts;

  /// No description provided for @calculatorsSectionFuel.
  ///
  /// In en, this message translates to:
  /// **'Fuel car'**
  String get calculatorsSectionFuel;

  /// No description provided for @calculatorsSectionFuelCar.
  ///
  /// In en, this message translates to:
  /// **'Fuel car costs'**
  String get calculatorsSectionFuelCar;

  /// No description provided for @calculatorsSectionOwnership.
  ///
  /// In en, this message translates to:
  /// **'Ownership'**
  String get calculatorsSectionOwnership;

  /// No description provided for @calculatorsSectionPower.
  ///
  /// In en, this message translates to:
  /// **'Power'**
  String get calculatorsSectionPower;

  /// No description provided for @calculatorsSectionPrices.
  ///
  /// In en, this message translates to:
  /// **'Currency & price date'**
  String get calculatorsSectionPrices;

  /// No description provided for @calculatorsSectionTariff.
  ///
  /// In en, this message translates to:
  /// **'Prices'**
  String get calculatorsSectionTariff;

  /// No description provided for @calculatorsSupplyLimit.
  ///
  /// In en, this message translates to:
  /// **'Home supply limit'**
  String get calculatorsSupplyLimit;

  /// No description provided for @calculatorsSupplyNone.
  ///
  /// In en, this message translates to:
  /// **'Not limited'**
  String get calculatorsSupplyNone;

  /// No description provided for @calculatorsSupplyOne.
  ///
  /// In en, this message translates to:
  /// **'Single phase'**
  String get calculatorsSupplyOne;

  /// No description provided for @calculatorsSupplyThree.
  ///
  /// In en, this message translates to:
  /// **'Three phase'**
  String get calculatorsSupplyThree;

  /// No description provided for @calculatorsTcoDescription.
  ///
  /// In en, this message translates to:
  /// **'Purchase, incentives, resale, energy, insurance and maintenance over the years you choose.'**
  String get calculatorsTcoDescription;

  /// No description provided for @calculatorsTcoDifference.
  ///
  /// In en, this message translates to:
  /// **'Fuel car minus EV: {amount}'**
  String calculatorsTcoDifference(String amount);

  /// No description provided for @calculatorsTcoTitle.
  ///
  /// In en, this message translates to:
  /// **'Total cost of ownership'**
  String get calculatorsTcoTitle;

  /// No description provided for @calculatorsTimeDescription.
  ///
  /// In en, this message translates to:
  /// **'AC time from the real power limit; DC from a documented curve, otherwise a low-confidence range.'**
  String get calculatorsTimeDescription;

  /// No description provided for @calculatorsTimeTitle.
  ///
  /// In en, this message translates to:
  /// **'Charging time'**
  String get calculatorsTimeTitle;

  /// No description provided for @calculatorsTitle.
  ///
  /// In en, this message translates to:
  /// **'Charging & running-cost calculators'**
  String get calculatorsTitle;

  /// No description provided for @calculatorsTotal.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get calculatorsTotal;

  /// No description provided for @calculatorsTotalCost.
  ///
  /// In en, this message translates to:
  /// **'Total cost'**
  String get calculatorsTotalCost;

  /// No description provided for @calculatorsTotalKm.
  ///
  /// In en, this message translates to:
  /// **'Total distance'**
  String get calculatorsTotalKm;

  /// No description provided for @calculatorsUnknown.
  ///
  /// In en, this message translates to:
  /// **'This calculator does not exist.'**
  String get calculatorsUnknown;

  /// No description provided for @calculatorsUseReference.
  ///
  /// In en, this message translates to:
  /// **'Use a reference price'**
  String get calculatorsUseReference;

  /// No description provided for @calculatorsVoltsHint.
  ///
  /// In en, this message translates to:
  /// **'Empty = 230 V (shown as an assumption).'**
  String get calculatorsVoltsHint;

  /// No description provided for @calculatorsVsFuelDescription.
  ///
  /// In en, this message translates to:
  /// **'Energy cost of your EV compared with a fuel car, per 100 km and per month.'**
  String get calculatorsVsFuelDescription;

  /// No description provided for @calculatorsVsFuelTitle.
  ///
  /// In en, this message translates to:
  /// **'Electric vs petrol'**
  String get calculatorsVsFuelTitle;

  /// No description provided for @calculatorsYes.
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get calculatorsYes;

  /// No description provided for @carsAbout.
  ///
  /// In en, this message translates to:
  /// **'About {name}'**
  String carsAbout(String name);

  /// No description provided for @carsAllReviews.
  ///
  /// In en, this message translates to:
  /// **'All reviews'**
  String get carsAllReviews;

  /// No description provided for @carsArticleBuyingGuide.
  ///
  /// In en, this message translates to:
  /// **'Buying guide'**
  String get carsArticleBuyingGuide;

  /// No description provided for @carsArticleExplainer.
  ///
  /// In en, this message translates to:
  /// **'Explainer'**
  String get carsArticleExplainer;

  /// No description provided for @carsArticleNews.
  ///
  /// In en, this message translates to:
  /// **'News'**
  String get carsArticleNews;

  /// No description provided for @carsArticleOpinion.
  ///
  /// In en, this message translates to:
  /// **'Opinion'**
  String get carsArticleOpinion;

  /// No description provided for @carsArticleReview.
  ///
  /// In en, this message translates to:
  /// **'Review'**
  String get carsArticleReview;

  /// No description provided for @carsArticleTestDrive.
  ///
  /// In en, this message translates to:
  /// **'Test drive'**
  String get carsArticleTestDrive;

  /// No description provided for @carsAvailabilityAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get carsAvailabilityAvailable;

  /// No description provided for @carsAvailabilityComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming soon'**
  String get carsAvailabilityComingSoon;

  /// No description provided for @carsAvailabilityDiscontinued.
  ///
  /// In en, this message translates to:
  /// **'Discontinued'**
  String get carsAvailabilityDiscontinued;

  /// No description provided for @carsAvailabilityNotListed.
  ///
  /// In en, this message translates to:
  /// **'Not sold in this market'**
  String get carsAvailabilityNotListed;

  /// No description provided for @carsAvailabilityUnknown.
  ///
  /// In en, this message translates to:
  /// **'Availability unknown'**
  String get carsAvailabilityUnknown;

  /// No description provided for @carsAveragePower.
  ///
  /// In en, this message translates to:
  /// **'average {power}'**
  String carsAveragePower(String power);

  /// No description provided for @carsBatteryTemp.
  ///
  /// In en, this message translates to:
  /// **'battery at {temp} °C'**
  String carsBatteryTemp(String temp);

  /// No description provided for @carsBodyConvertible.
  ///
  /// In en, this message translates to:
  /// **'Convertible'**
  String get carsBodyConvertible;

  /// No description provided for @carsBodyCoupe.
  ///
  /// In en, this message translates to:
  /// **'Coupe'**
  String get carsBodyCoupe;

  /// No description provided for @carsBodyCrossover.
  ///
  /// In en, this message translates to:
  /// **'Crossover'**
  String get carsBodyCrossover;

  /// No description provided for @carsBodyHatchback.
  ///
  /// In en, this message translates to:
  /// **'Hatchback'**
  String get carsBodyHatchback;

  /// No description provided for @carsBodyMpv.
  ///
  /// In en, this message translates to:
  /// **'MPV'**
  String get carsBodyMpv;

  /// No description provided for @carsBodyOther.
  ///
  /// In en, this message translates to:
  /// **'Other body'**
  String get carsBodyOther;

  /// No description provided for @carsBodyPickup.
  ///
  /// In en, this message translates to:
  /// **'Pickup'**
  String get carsBodyPickup;

  /// No description provided for @carsBodySedan.
  ///
  /// In en, this message translates to:
  /// **'Sedan'**
  String get carsBodySedan;

  /// No description provided for @carsBodySuv.
  ///
  /// In en, this message translates to:
  /// **'SUV'**
  String get carsBodySuv;

  /// No description provided for @carsBodyVan.
  ///
  /// In en, this message translates to:
  /// **'Van'**
  String get carsBodyVan;

  /// No description provided for @carsBodyWagon.
  ///
  /// In en, this message translates to:
  /// **'Wagon'**
  String get carsBodyWagon;

  /// No description provided for @carsBrandCountry.
  ///
  /// In en, this message translates to:
  /// **'Origin: {country}'**
  String carsBrandCountry(String country);

  /// No description provided for @carsBrandModelsIn.
  ///
  /// In en, this message translates to:
  /// **'Models in {market}'**
  String carsBrandModelsIn(String market);

  /// No description provided for @carsBrandNoCarsInMarket.
  ///
  /// In en, this message translates to:
  /// **'No models in this market'**
  String get carsBrandNoCarsInMarket;

  /// No description provided for @carsBrandNoCarsMessage.
  ///
  /// In en, this message translates to:
  /// **'This brand has no models on sale in the selected market. Try another market.'**
  String get carsBrandNoCarsMessage;

  /// No description provided for @carsBrandNoCarsTitle.
  ///
  /// In en, this message translates to:
  /// **'No models listed in {market}'**
  String carsBrandNoCarsTitle(String market);

  /// No description provided for @carsBrandNotInMarketHint.
  ///
  /// In en, this message translates to:
  /// **'Shown for reference; prices and availability belong to other markets.'**
  String get carsBrandNotInMarketHint;

  /// No description provided for @carsBrandNotInMarketTitle.
  ///
  /// In en, this message translates to:
  /// **'Not sold in {market}'**
  String carsBrandNotInMarketTitle(String market);

  /// No description provided for @carsBrandTitle.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get carsBrandTitle;

  /// No description provided for @carsBrandWebsite.
  ///
  /// In en, this message translates to:
  /// **'Official website'**
  String get carsBrandWebsite;

  /// No description provided for @carsBrandsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Brands appear here once they are added to the catalog.'**
  String get carsBrandsEmptyMessage;

  /// No description provided for @carsBrandsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No brands yet'**
  String get carsBrandsEmptyTitle;

  /// No description provided for @carsBrandsNoMatchMessage.
  ///
  /// In en, this message translates to:
  /// **'Check the spelling or try another name.'**
  String get carsBrandsNoMatchMessage;

  /// No description provided for @carsBrandsNoMatchTitle.
  ///
  /// In en, this message translates to:
  /// **'No brand found'**
  String get carsBrandsNoMatchTitle;

  /// No description provided for @carsBrandsNotInMarket.
  ///
  /// In en, this message translates to:
  /// **'Not sold in your market'**
  String get carsBrandsNotInMarket;

  /// No description provided for @carsBrandsNotInMarketHint.
  ///
  /// In en, this message translates to:
  /// **'These brands have no models listed in the selected market.'**
  String get carsBrandsNotInMarketHint;

  /// No description provided for @carsBrandsSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search brands'**
  String get carsBrandsSearchHint;

  /// No description provided for @carsBrandsTitle.
  ///
  /// In en, this message translates to:
  /// **'Brands'**
  String get carsBrandsTitle;

  /// No description provided for @carsCatalogTitle.
  ///
  /// In en, this message translates to:
  /// **'Car catalog'**
  String get carsCatalogTitle;

  /// No description provided for @carsChangeMarket.
  ///
  /// In en, this message translates to:
  /// **'Change market'**
  String get carsChangeMarket;

  /// No description provided for @carsChargingCurve.
  ///
  /// In en, this message translates to:
  /// **'Charging curve'**
  String get carsChargingCurve;

  /// No description provided for @carsChargingInlets.
  ///
  /// In en, this message translates to:
  /// **'Charging ports'**
  String get carsChargingInlets;

  /// No description provided for @carsChargingNotPlugIn.
  ///
  /// In en, this message translates to:
  /// **'This is a self-charging hybrid without a charging port, so it has no charging data.'**
  String get carsChargingNotPlugIn;

  /// No description provided for @carsChargingTimeLabel.
  ///
  /// In en, this message translates to:
  /// **'{current} charging ({window})'**
  String carsChargingTimeLabel(String current, String window);

  /// No description provided for @carsChargingTimes.
  ///
  /// In en, this message translates to:
  /// **'Charging times'**
  String get carsChargingTimes;

  /// No description provided for @carsChargingTitle.
  ///
  /// In en, this message translates to:
  /// **'Charging'**
  String get carsChargingTitle;

  /// No description provided for @carsChooseVersion.
  ///
  /// In en, this message translates to:
  /// **'Choose the exact version'**
  String get carsChooseVersion;

  /// No description provided for @carsChooseVersionHint.
  ///
  /// In en, this message translates to:
  /// **'Specs, prices and tours below belong only to this market, year and trim.'**
  String get carsChooseVersionHint;

  /// No description provided for @carsCompareNeedsMarket.
  ///
  /// In en, this message translates to:
  /// **'Not sold in {market} — cannot be compared there'**
  String carsCompareNeedsMarket(String market);

  /// No description provided for @carsConsumptionElectric.
  ///
  /// In en, this message translates to:
  /// **'Electricity consumption'**
  String get carsConsumptionElectric;

  /// No description provided for @carsConsumptionFuel.
  ///
  /// In en, this message translates to:
  /// **'Fuel consumption'**
  String get carsConsumptionFuel;

  /// No description provided for @carsCurrentAc.
  ///
  /// In en, this message translates to:
  /// **'AC'**
  String get carsCurrentAc;

  /// No description provided for @carsCurrentDc.
  ///
  /// In en, this message translates to:
  /// **'DC'**
  String get carsCurrentDc;

  /// No description provided for @carsCurveHideTable.
  ///
  /// In en, this message translates to:
  /// **'Hide table'**
  String get carsCurveHideTable;

  /// No description provided for @carsCurvePower.
  ///
  /// In en, this message translates to:
  /// **'Power'**
  String get carsCurvePower;

  /// No description provided for @carsCurveShowTable.
  ///
  /// In en, this message translates to:
  /// **'Show as a table'**
  String get carsCurveShowTable;

  /// No description provided for @carsCurveSoc.
  ///
  /// In en, this message translates to:
  /// **'State of charge'**
  String get carsCurveSoc;

  /// No description provided for @carsCurveSummary.
  ///
  /// In en, this message translates to:
  /// **'{current} charging curve: peak {peak}, measured from {from} to {to} state of charge.'**
  String carsCurveSummary(String current, String peak, String from, String to);

  /// No description provided for @carsDerivedValue.
  ///
  /// In en, this message translates to:
  /// **'Calculated from another published value'**
  String get carsDerivedValue;

  /// No description provided for @carsDetailTitle.
  ///
  /// In en, this message translates to:
  /// **'Car details'**
  String get carsDetailTitle;

  /// No description provided for @carsDoors.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 door} other{{count} doors}}'**
  String carsDoors(int count);

  /// No description provided for @carsDriveAwd.
  ///
  /// In en, this message translates to:
  /// **'All-wheel drive'**
  String get carsDriveAwd;

  /// No description provided for @carsDriveFwd.
  ///
  /// In en, this message translates to:
  /// **'Front-wheel drive'**
  String get carsDriveFwd;

  /// No description provided for @carsDriveRwd.
  ///
  /// In en, this message translates to:
  /// **'Rear-wheel drive'**
  String get carsDriveRwd;

  /// No description provided for @carsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'No cars are listed in {market} yet. You can choose another market.'**
  String carsEmptyMessage(String market);

  /// No description provided for @carsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No cars listed yet'**
  String get carsEmptyTitle;

  /// No description provided for @carsEndOfList.
  ///
  /// In en, this message translates to:
  /// **'You have reached the end of the list'**
  String get carsEndOfList;

  /// No description provided for @carsFilterAny.
  ///
  /// In en, this message translates to:
  /// **'Any'**
  String get carsFilterAny;

  /// No description provided for @carsFilterAtLeast.
  ///
  /// In en, this message translates to:
  /// **'At least {value}'**
  String carsFilterAtLeast(String value);

  /// No description provided for @carsFilterBody.
  ///
  /// In en, this message translates to:
  /// **'Body type'**
  String get carsFilterBody;

  /// No description provided for @carsFilterClear.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get carsFilterClear;

  /// No description provided for @carsFilterCycle.
  ///
  /// In en, this message translates to:
  /// **'Test cycle'**
  String get carsFilterCycle;

  /// No description provided for @carsFilterMinRange.
  ///
  /// In en, this message translates to:
  /// **'Minimum electric range'**
  String get carsFilterMinRange;

  /// No description provided for @carsFilterMinRangeHint.
  ///
  /// In en, this message translates to:
  /// **'Ranges are only compared within the same test cycle.'**
  String get carsFilterMinRangeHint;

  /// No description provided for @carsFilterPowertrain.
  ///
  /// In en, this message translates to:
  /// **'Powertrain'**
  String get carsFilterPowertrain;

  /// No description provided for @carsFilterPrice.
  ///
  /// In en, this message translates to:
  /// **'Local price'**
  String get carsFilterPrice;

  /// No description provided for @carsFilterPriceHint.
  ///
  /// In en, this message translates to:
  /// **'In {currency} for {market}. Only local prices are compared; trims without a local price are hidden while this filter is on.'**
  String carsFilterPriceHint(String currency, String market);

  /// No description provided for @carsFilterPriceHintNoCurrency.
  ///
  /// In en, this message translates to:
  /// **'In the local currency of {market}.'**
  String carsFilterPriceHintNoCurrency(String market);

  /// No description provided for @carsFilterPriceInvalid.
  ///
  /// In en, this message translates to:
  /// **'The minimum price is higher than the maximum.'**
  String get carsFilterPriceInvalid;

  /// No description provided for @carsFilterPriceMax.
  ///
  /// In en, this message translates to:
  /// **'Maximum'**
  String get carsFilterPriceMax;

  /// No description provided for @carsFilterPriceMin.
  ///
  /// In en, this message translates to:
  /// **'Minimum'**
  String get carsFilterPriceMin;

  /// No description provided for @carsFilterRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove filter'**
  String get carsFilterRemove;

  /// No description provided for @carsFilterSeats.
  ///
  /// In en, this message translates to:
  /// **'Seats'**
  String get carsFilterSeats;

  /// No description provided for @carsFilterSeatsAtLeast.
  ///
  /// In en, this message translates to:
  /// **'{count}+ seats'**
  String carsFilterSeatsAtLeast(int count);

  /// No description provided for @carsGalleryEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Only licensed photos are published; none are available for this car yet.'**
  String get carsGalleryEmptyMessage;

  /// No description provided for @carsGalleryEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No photos yet'**
  String get carsGalleryEmptyTitle;

  /// No description provided for @carsGalleryOf.
  ///
  /// In en, this message translates to:
  /// **'Photos: {car}'**
  String carsGalleryOf(String car);

  /// No description provided for @carsGalleryPhoto.
  ///
  /// In en, this message translates to:
  /// **'Photo {index} of {total}'**
  String carsGalleryPhoto(int index, int total);

  /// No description provided for @carsGalleryTitle.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get carsGalleryTitle;

  /// No description provided for @carsInletsNeedMarket.
  ///
  /// In en, this message translates to:
  /// **'Ports depend on the market; this trim is not listed in {market}.'**
  String carsInletsNeedMarket(String market);

  /// No description provided for @carsLocalName.
  ///
  /// In en, this message translates to:
  /// **'Local name: {name}'**
  String carsLocalName(String name);

  /// No description provided for @carsMarket.
  ///
  /// In en, this message translates to:
  /// **'Market'**
  String get carsMarket;

  /// No description provided for @carsMarketLine.
  ///
  /// In en, this message translates to:
  /// **'Prices and availability for {market} ({currency})'**
  String carsMarketLine(String market, String currency);

  /// No description provided for @carsMarketLineNoCurrency.
  ///
  /// In en, this message translates to:
  /// **'Prices and availability for {market}'**
  String carsMarketLineNoCurrency(String market);

  /// No description provided for @carsMarketSpecific.
  ///
  /// In en, this message translates to:
  /// **'Specific to {market}'**
  String carsMarketSpecific(String market);

  /// No description provided for @carsMaxPower.
  ///
  /// In en, this message translates to:
  /// **'up to {power}'**
  String carsMaxPower(String power);

  /// No description provided for @carsMeasuredCycle.
  ///
  /// In en, this message translates to:
  /// **'{cycle} cycle'**
  String carsMeasuredCycle(String cycle);

  /// No description provided for @carsModeCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get carsModeCity;

  /// No description provided for @carsModeCombined.
  ///
  /// In en, this message translates to:
  /// **'Combined'**
  String get carsModeCombined;

  /// No description provided for @carsModeHighway.
  ///
  /// In en, this message translates to:
  /// **'Highway'**
  String get carsModeHighway;

  /// No description provided for @carsModelCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 model} other{{count} models}}'**
  String carsModelCount(int count);

  /// No description provided for @carsModelYear.
  ///
  /// In en, this message translates to:
  /// **'Model year'**
  String get carsModelYear;

  /// No description provided for @carsNo.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get carsNo;

  /// No description provided for @carsNoArticlesMessage.
  ///
  /// In en, this message translates to:
  /// **'News, reviews and guides about this car will appear here.'**
  String get carsNoArticlesMessage;

  /// No description provided for @carsNoArticlesTitle.
  ///
  /// In en, this message translates to:
  /// **'No related articles yet'**
  String get carsNoArticlesTitle;

  /// No description provided for @carsNoCompetitorsMessage.
  ///
  /// In en, this message translates to:
  /// **'Our editors have not linked competitors sold in this market yet.'**
  String get carsNoCompetitorsMessage;

  /// No description provided for @carsNoCompetitorsTitle.
  ///
  /// In en, this message translates to:
  /// **'No competitors listed'**
  String get carsNoCompetitorsTitle;

  /// No description provided for @carsNoLocalPrice.
  ///
  /// In en, this message translates to:
  /// **'No local price has been published for {market} yet.'**
  String carsNoLocalPrice(String market);

  /// No description provided for @carsNoMatchMessage.
  ///
  /// In en, this message translates to:
  /// **'Try removing a filter or widening the price or range.'**
  String get carsNoMatchMessage;

  /// No description provided for @carsNoMatchTitle.
  ///
  /// In en, this message translates to:
  /// **'No cars match these filters'**
  String get carsNoMatchTitle;

  /// No description provided for @carsNotOfferedInMarket.
  ///
  /// In en, this message translates to:
  /// **'This trim is not sold in {market}, so there is no local price.'**
  String carsNotOfferedInMarket(String market);

  /// No description provided for @carsNotPreconditioned.
  ///
  /// In en, this message translates to:
  /// **'battery not preconditioned'**
  String get carsNotPreconditioned;

  /// No description provided for @carsNotSoldAnywhere.
  ///
  /// In en, this message translates to:
  /// **'Not listed in any market'**
  String get carsNotSoldAnywhere;

  /// No description provided for @carsNotSoldAnywhereMessage.
  ///
  /// In en, this message translates to:
  /// **'This car is not listed in any market yet.'**
  String get carsNotSoldAnywhereMessage;

  /// No description provided for @carsNotSoldInMarketMessage.
  ///
  /// In en, this message translates to:
  /// **'This car is listed in: {markets}. Choose one of them to see its trims and prices.'**
  String carsNotSoldInMarketMessage(String markets);

  /// No description provided for @carsNotSoldInMarketTitle.
  ///
  /// In en, this message translates to:
  /// **'Not sold in this market'**
  String get carsNotSoldInMarketTitle;

  /// No description provided for @carsNotSoldShort.
  ///
  /// In en, this message translates to:
  /// **'not sold'**
  String get carsNotSoldShort;

  /// No description provided for @carsOnCharger.
  ///
  /// In en, this message translates to:
  /// **'on a {power} charger'**
  String carsOnCharger(String power);

  /// No description provided for @carsOnboardLimit.
  ///
  /// In en, this message translates to:
  /// **'on-board limit {power}'**
  String carsOnboardLimit(String power);

  /// No description provided for @carsOpenFullSheet.
  ///
  /// In en, this message translates to:
  /// **'Open the full spec sheet'**
  String get carsOpenFullSheet;

  /// No description provided for @carsOpenModelPage.
  ///
  /// In en, this message translates to:
  /// **'All versions of {model}'**
  String carsOpenModelPage(String model);

  /// No description provided for @carsOwnerReviewsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Own this car? Share your real experience to help others.'**
  String get carsOwnerReviewsEmptyMessage;

  /// No description provided for @carsOwnerReviewsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No owner reviews for this trim yet'**
  String get carsOwnerReviewsEmptyTitle;

  /// No description provided for @carsOwnerReviewsUnavailableMessage.
  ///
  /// In en, this message translates to:
  /// **'This section opens once community reviews are enabled.'**
  String get carsOwnerReviewsUnavailableMessage;

  /// No description provided for @carsOwnerReviewsUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Owner reviews are not available yet'**
  String get carsOwnerReviewsUnavailableTitle;

  /// No description provided for @carsPeakPower.
  ///
  /// In en, this message translates to:
  /// **'peak {power}'**
  String carsPeakPower(String power);

  /// No description provided for @carsPreconditioned.
  ///
  /// In en, this message translates to:
  /// **'battery preconditioned'**
  String get carsPreconditioned;

  /// No description provided for @carsPriceCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current'**
  String get carsPriceCurrent;

  /// No description provided for @carsPriceFrom.
  ///
  /// In en, this message translates to:
  /// **'From {price}'**
  String carsPriceFrom(String price);

  /// No description provided for @carsPriceHistory.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Price history (1 entry)} other{Price history ({count} entries)}}'**
  String carsPriceHistory(int count);

  /// No description provided for @carsPriceIn.
  ///
  /// In en, this message translates to:
  /// **'Price in {market}'**
  String carsPriceIn(String market);

  /// No description provided for @carsPricePeriod.
  ///
  /// In en, this message translates to:
  /// **'{from} – {to}'**
  String carsPricePeriod(String from, String to);

  /// No description provided for @carsPriceSince.
  ///
  /// In en, this message translates to:
  /// **'Since {date}'**
  String carsPriceSince(String date);

  /// No description provided for @carsRangeAndConsumption.
  ///
  /// In en, this message translates to:
  /// **'Range & consumption'**
  String get carsRangeAndConsumption;

  /// No description provided for @carsRangeCycleExplainer.
  ///
  /// In en, this message translates to:
  /// **'Each figure is shown with its test cycle (WLTP, EPA, CLTC…). Cycles are never converted into one another; real-world range is usually lower.'**
  String get carsRangeCycleExplainer;

  /// No description provided for @carsRatingOutOfFive.
  ///
  /// In en, this message translates to:
  /// **'{rating} out of 5'**
  String carsRatingOutOfFive(String rating);

  /// No description provided for @carsResultCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 car} other{{count} cars}}'**
  String carsResultCount(int count);

  /// No description provided for @carsReviewCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 review} other{{count} reviews}}'**
  String carsReviewCount(int count);

  /// No description provided for @carsSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search brand, model or trim'**
  String get carsSearchHint;

  /// No description provided for @carsSeatDriver.
  ///
  /// In en, this message translates to:
  /// **'Driver seat'**
  String get carsSeatDriver;

  /// No description provided for @carsSeatPassenger.
  ///
  /// In en, this message translates to:
  /// **'Front passenger'**
  String get carsSeatPassenger;

  /// No description provided for @carsSeatRear.
  ///
  /// In en, this message translates to:
  /// **'Rear seats'**
  String get carsSeatRear;

  /// No description provided for @carsSeatThirdRow.
  ///
  /// In en, this message translates to:
  /// **'Third row'**
  String get carsSeatThirdRow;

  /// No description provided for @carsSeatTrunk.
  ///
  /// In en, this message translates to:
  /// **'Trunk'**
  String get carsSeatTrunk;

  /// No description provided for @carsSeats.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 seat} other{{count} seats}}'**
  String carsSeats(int count);

  /// No description provided for @carsShareFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open sharing.'**
  String get carsShareFailed;

  /// No description provided for @carsSoldIn.
  ///
  /// In en, this message translates to:
  /// **'Sold in: {markets}'**
  String carsSoldIn(String markets);

  /// No description provided for @carsSortName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get carsSortName;

  /// No description provided for @carsSortNewest.
  ///
  /// In en, this message translates to:
  /// **'Newest'**
  String get carsSortNewest;

  /// No description provided for @carsSortPriceAsc.
  ///
  /// In en, this message translates to:
  /// **'Price: low to high'**
  String get carsSortPriceAsc;

  /// No description provided for @carsSortPriceDesc.
  ///
  /// In en, this message translates to:
  /// **'Price: high to low'**
  String get carsSortPriceDesc;

  /// No description provided for @carsSortRange.
  ///
  /// In en, this message translates to:
  /// **'Longest range'**
  String get carsSortRange;

  /// No description provided for @carsSourceAccessedAt.
  ///
  /// In en, this message translates to:
  /// **'Accessed on'**
  String get carsSourceAccessedAt;

  /// No description provided for @carsSourceDocumentDate.
  ///
  /// In en, this message translates to:
  /// **'Document date'**
  String get carsSourceDocumentDate;

  /// No description provided for @carsSourceOpen.
  ///
  /// In en, this message translates to:
  /// **'Open source'**
  String get carsSourceOpen;

  /// No description provided for @carsSourcePublisher.
  ///
  /// In en, this message translates to:
  /// **'Publisher'**
  String get carsSourcePublisher;

  /// No description provided for @carsSourceTitle.
  ///
  /// In en, this message translates to:
  /// **'Data source'**
  String get carsSourceTitle;

  /// No description provided for @carsSourceVerifiedAt.
  ///
  /// In en, this message translates to:
  /// **'Verified on'**
  String get carsSourceVerifiedAt;

  /// No description provided for @carsSourcesTitle.
  ///
  /// In en, this message translates to:
  /// **'Sources'**
  String get carsSourcesTitle;

  /// No description provided for @carsSpecsOnlyAvailable.
  ///
  /// In en, this message translates to:
  /// **'Hide unavailable values'**
  String get carsSpecsOnlyAvailable;

  /// No description provided for @carsSpecsOnlyAvailableHint.
  ///
  /// In en, this message translates to:
  /// **'Missing values are shown as “Not available”, never as 0.'**
  String get carsSpecsOnlyAvailableHint;

  /// No description provided for @carsSpecsRemoveOffline.
  ///
  /// In en, this message translates to:
  /// **'Remove offline copy'**
  String get carsSpecsRemoveOffline;

  /// No description provided for @carsSpecsRemovedOffline.
  ///
  /// In en, this message translates to:
  /// **'Offline copy removed'**
  String get carsSpecsRemovedOffline;

  /// No description provided for @carsSpecsSaveOffline.
  ///
  /// In en, this message translates to:
  /// **'Save specs offline'**
  String get carsSpecsSaveOffline;

  /// No description provided for @carsSpecsSavedOffline.
  ///
  /// In en, this message translates to:
  /// **'Specs saved for offline reading'**
  String get carsSpecsSavedOffline;

  /// No description provided for @carsSpecsSavedOn.
  ///
  /// In en, this message translates to:
  /// **'Saved on {time}'**
  String carsSpecsSavedOn(String time);

  /// No description provided for @carsStarsCount.
  ///
  /// In en, this message translates to:
  /// **'{stars} stars: {count}'**
  String carsStarsCount(int stars, int count);

  /// No description provided for @carsStatAcMax.
  ///
  /// In en, this message translates to:
  /// **'AC charging'**
  String get carsStatAcMax;

  /// No description provided for @carsStatAccel.
  ///
  /// In en, this message translates to:
  /// **'0–100 km/h'**
  String get carsStatAccel;

  /// No description provided for @carsStatBattery.
  ///
  /// In en, this message translates to:
  /// **'Battery'**
  String get carsStatBattery;

  /// No description provided for @carsStatDcPeak.
  ///
  /// In en, this message translates to:
  /// **'DC peak'**
  String get carsStatDcPeak;

  /// No description provided for @carsStatElectricRange.
  ///
  /// In en, this message translates to:
  /// **'Electric range'**
  String get carsStatElectricRange;

  /// No description provided for @carsStatPower.
  ///
  /// In en, this message translates to:
  /// **'Power'**
  String get carsStatPower;

  /// No description provided for @carsStatRange.
  ///
  /// In en, this message translates to:
  /// **'Range'**
  String get carsStatRange;

  /// No description provided for @carsStatUsableBattery.
  ///
  /// In en, this message translates to:
  /// **'Usable battery'**
  String get carsStatUsableBattery;

  /// No description provided for @carsTabCompetitors.
  ///
  /// In en, this message translates to:
  /// **'Competitors'**
  String get carsTabCompetitors;

  /// No description provided for @carsTabNews.
  ///
  /// In en, this message translates to:
  /// **'News & reviews'**
  String get carsTabNews;

  /// No description provided for @carsTabOverview.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get carsTabOverview;

  /// No description provided for @carsTabOwners.
  ///
  /// In en, this message translates to:
  /// **'Owner reviews'**
  String get carsTabOwners;

  /// No description provided for @carsTabSpecs.
  ///
  /// In en, this message translates to:
  /// **'Specifications'**
  String get carsTabSpecs;

  /// No description provided for @carsTabTours.
  ///
  /// In en, this message translates to:
  /// **'360° tour'**
  String get carsTabTours;

  /// No description provided for @carsTableReliability.
  ///
  /// In en, this message translates to:
  /// **'Reliability'**
  String get carsTableReliability;

  /// No description provided for @carsTableSource.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get carsTableSource;

  /// No description provided for @carsTableSpec.
  ///
  /// In en, this message translates to:
  /// **'Specification'**
  String get carsTableSpec;

  /// No description provided for @carsTableValue.
  ///
  /// In en, this message translates to:
  /// **'Value'**
  String get carsTableValue;

  /// No description provided for @carsTourInterior.
  ///
  /// In en, this message translates to:
  /// **'Interior: {color}'**
  String carsTourInterior(String color);

  /// No description provided for @carsTourOpen.
  ///
  /// In en, this message translates to:
  /// **'Start the tour'**
  String get carsTourOpen;

  /// No description provided for @carsTourReference.
  ///
  /// In en, this message translates to:
  /// **'Photographed in a similar trim: {trim}'**
  String carsTourReference(String trim);

  /// No description provided for @carsTourSeats.
  ///
  /// In en, this message translates to:
  /// **'Views: {seats}'**
  String carsTourSeats(String seats);

  /// No description provided for @carsTourTitle.
  ///
  /// In en, this message translates to:
  /// **'360° interior tour'**
  String get carsTourTitle;

  /// No description provided for @carsTourUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The interior tour is not available for this trim'**
  String get carsTourUnavailable;

  /// No description provided for @carsTourUnavailableHint.
  ///
  /// In en, this message translates to:
  /// **'We only publish tours photographed in real cars. You can browse the licensed photos instead.'**
  String get carsTourUnavailableHint;

  /// No description provided for @carsToursDisabled.
  ///
  /// In en, this message translates to:
  /// **'Interior tours are not available right now'**
  String get carsToursDisabled;

  /// No description provided for @carsTrim.
  ///
  /// In en, this message translates to:
  /// **'Trim'**
  String get carsTrim;

  /// No description provided for @carsTrimCode.
  ///
  /// In en, this message translates to:
  /// **'Code {code}'**
  String carsTrimCode(String code);

  /// No description provided for @carsTrimCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 trim} other{{count} trims}}'**
  String carsTrimCount(int count);

  /// No description provided for @carsUnitInch.
  ///
  /// In en, this message translates to:
  /// **'in'**
  String get carsUnitInch;

  /// No description provided for @carsUnitLitersPer100.
  ///
  /// In en, this message translates to:
  /// **'L/100 km'**
  String get carsUnitLitersPer100;

  /// No description provided for @carsVariantTitle.
  ///
  /// In en, this message translates to:
  /// **'Trim details'**
  String get carsVariantTitle;

  /// No description provided for @carsVerifiedOwner.
  ///
  /// In en, this message translates to:
  /// **'Verified owner'**
  String get carsVerifiedOwner;

  /// No description provided for @carsVerifiedOwners.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 verified owner} other{{count} verified owners}}'**
  String carsVerifiedOwners(int count);

  /// No description provided for @carsViewingTrim.
  ///
  /// In en, this message translates to:
  /// **'Showing {trim} in {market}'**
  String carsViewingTrim(String trim, String market);

  /// No description provided for @carsWheelSize.
  ///
  /// In en, this message translates to:
  /// **'{size} wheels'**
  String carsWheelSize(String size);

  /// No description provided for @carsWriteReview.
  ///
  /// In en, this message translates to:
  /// **'Write a review'**
  String get carsWriteReview;

  /// No description provided for @carsYears.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 year} other{{count} years}}'**
  String carsYears(int count);

  /// No description provided for @carsYes.
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get carsYes;

  /// No description provided for @chargingAccessRestrictions.
  ///
  /// In en, this message translates to:
  /// **'Restrictions'**
  String get chargingAccessRestrictions;

  /// No description provided for @chargingAccessSection.
  ///
  /// In en, this message translates to:
  /// **'Access'**
  String get chargingAccessSection;

  /// No description provided for @chargingAccessType.
  ///
  /// In en, this message translates to:
  /// **'Access'**
  String get chargingAccessType;

  /// No description provided for @chargingAddressUnknown.
  ///
  /// In en, this message translates to:
  /// **'Address not available'**
  String get chargingAddressUnknown;

  /// No description provided for @chargingAmenities.
  ///
  /// In en, this message translates to:
  /// **'Nearby amenities'**
  String get chargingAmenities;

  /// No description provided for @chargingAreaAround.
  ///
  /// In en, this message translates to:
  /// **'Around {place} · {radius}'**
  String chargingAreaAround(String place, String radius);

  /// No description provided for @chargingAreaVisibleMap.
  ///
  /// In en, this message translates to:
  /// **'Visible map area'**
  String get chargingAreaVisibleMap;

  /// No description provided for @chargingAttribution.
  ///
  /// In en, this message translates to:
  /// **'Attribution'**
  String get chargingAttribution;

  /// No description provided for @chargingAvailAvailable.
  ///
  /// In en, this message translates to:
  /// **'Connector free now'**
  String get chargingAvailAvailable;

  /// No description provided for @chargingAvailCounts.
  ///
  /// In en, this message translates to:
  /// **'Free: {available} · In use: {occupied} · Out of order: {outOfOrder} · Unknown: {unknown}'**
  String chargingAvailCounts(String available, String occupied, String outOfOrder, String unknown);

  /// No description provided for @chargingAvailExpiredExplain.
  ///
  /// In en, this message translates to:
  /// **'The last live reading has expired, so it is not shown as available.'**
  String get chargingAvailExpiredExplain;

  /// No description provided for @chargingAvailLastReading.
  ///
  /// In en, this message translates to:
  /// **'Last reading {time} — expired, so the current state is uncertain.'**
  String chargingAvailLastReading(String time);

  /// No description provided for @chargingAvailNotLiveOffline.
  ///
  /// In en, this message translates to:
  /// **'No live status (saved data)'**
  String get chargingAvailNotLiveOffline;

  /// No description provided for @chargingAvailObserved.
  ///
  /// In en, this message translates to:
  /// **'Reading from {time}'**
  String chargingAvailObserved(String time);

  /// No description provided for @chargingAvailOccupied.
  ///
  /// In en, this message translates to:
  /// **'All in use'**
  String get chargingAvailOccupied;

  /// No description provided for @chargingAvailOutOfOrder.
  ///
  /// In en, this message translates to:
  /// **'Out of order'**
  String get chargingAvailOutOfOrder;

  /// No description provided for @chargingAvailSource.
  ///
  /// In en, this message translates to:
  /// **'Source: {source}'**
  String chargingAvailSource(String source);

  /// No description provided for @chargingAvailUncertain.
  ///
  /// In en, this message translates to:
  /// **'Uncertain (reading expired)'**
  String get chargingAvailUncertain;

  /// No description provided for @chargingAvailUnknown.
  ///
  /// In en, this message translates to:
  /// **'Availability unknown'**
  String get chargingAvailUnknown;

  /// No description provided for @chargingAvailValidUntil.
  ///
  /// In en, this message translates to:
  /// **'valid until {time}'**
  String chargingAvailValidUntil(String time);

  /// No description provided for @chargingCheckInCar.
  ///
  /// In en, this message translates to:
  /// **'Your car'**
  String get chargingCheckInCar;

  /// No description provided for @chargingCheckInComment.
  ///
  /// In en, this message translates to:
  /// **'Comment'**
  String get chargingCheckInComment;

  /// No description provided for @chargingCheckInConnector.
  ///
  /// In en, this message translates to:
  /// **'Connector used'**
  String get chargingCheckInConnector;

  /// No description provided for @chargingCheckInHowWasIt.
  ///
  /// In en, this message translates to:
  /// **'How did it go?'**
  String get chargingCheckInHowWasIt;

  /// No description provided for @chargingCheckInIntro.
  ///
  /// In en, this message translates to:
  /// **'Share how charging went. It appears with its date as community data, not as live status.'**
  String get chargingCheckInIntro;

  /// No description provided for @chargingCheckInNoCar.
  ///
  /// In en, this message translates to:
  /// **'Don\'t add a car'**
  String get chargingCheckInNoCar;

  /// No description provided for @chargingCheckInPending.
  ///
  /// In en, this message translates to:
  /// **'Thanks! Your comment will appear after review.'**
  String get chargingCheckInPending;

  /// No description provided for @chargingCheckInPower.
  ///
  /// In en, this message translates to:
  /// **'Power you saw'**
  String get chargingCheckInPower;

  /// No description provided for @chargingCheckInPublicNote.
  ///
  /// In en, this message translates to:
  /// **'Your check-in is shown without your name. Comments with links are reviewed first.'**
  String get chargingCheckInPublicNote;

  /// No description provided for @chargingCheckInSentMessage.
  ///
  /// In en, this message translates to:
  /// **'Thanks! It now appears on the station page with today\'s date.'**
  String get chargingCheckInSentMessage;

  /// No description provided for @chargingCheckInSentTitle.
  ///
  /// In en, this message translates to:
  /// **'Check-in saved'**
  String get chargingCheckInSentTitle;

  /// No description provided for @chargingCheckInShort.
  ///
  /// In en, this message translates to:
  /// **'Check in'**
  String get chargingCheckInShort;

  /// No description provided for @chargingCheckInSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in to check in, so others can trust community data.'**
  String get chargingCheckInSignIn;

  /// No description provided for @chargingCheckInTitle.
  ///
  /// In en, this message translates to:
  /// **'Check in'**
  String get chargingCheckInTitle;

  /// No description provided for @chargingCheckInWait.
  ///
  /// In en, this message translates to:
  /// **'Waiting time'**
  String get chargingCheckInWait;

  /// No description provided for @chargingCheckins30d.
  ///
  /// In en, this message translates to:
  /// **'Check-ins (30 days)'**
  String get chargingCheckins30d;

  /// No description provided for @chargingChoosePlace.
  ///
  /// In en, this message translates to:
  /// **'Choose a place'**
  String get chargingChoosePlace;

  /// No description provided for @chargingCityListNote.
  ///
  /// In en, this message translates to:
  /// **'Cities set only the centre of the search. Which stations exist comes from the station database.'**
  String get chargingCityListNote;

  /// No description provided for @chargingCitySearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search cities'**
  String get chargingCitySearchHint;

  /// No description provided for @chargingClearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get chargingClearFilters;

  /// No description provided for @chargingClosedNow.
  ///
  /// In en, this message translates to:
  /// **'Closed now'**
  String get chargingClosedNow;

  /// No description provided for @chargingClosesAt.
  ///
  /// In en, this message translates to:
  /// **'Closes at {time} (station time)'**
  String chargingClosesAt(String time);

  /// No description provided for @chargingClusterSemantics.
  ///
  /// In en, this message translates to:
  /// **'{count} stations here, tap to zoom in'**
  String chargingClusterSemantics(int count);

  /// No description provided for @chargingCommunityDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'Check-ins and reports are dated community data, not an official live status.'**
  String get chargingCommunityDisclaimer;

  /// No description provided for @chargingCommunityEmpty.
  ///
  /// In en, this message translates to:
  /// **'No check-ins or reports yet. Tell others how your visit went.'**
  String get chargingCommunityEmpty;

  /// No description provided for @chargingCommunitySection.
  ///
  /// In en, this message translates to:
  /// **'Community reports and check-ins'**
  String get chargingCommunitySection;

  /// No description provided for @chargingCompatBestPower.
  ///
  /// In en, this message translates to:
  /// **'Up to {power} with your car'**
  String chargingCompatBestPower(String power);

  /// No description provided for @chargingCompatIgnored.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 unverified inlet record was not used.} other{{count} unverified inlet records were not used.}}'**
  String chargingCompatIgnored(int count);

  /// No description provided for @chargingCompatNoAdapters.
  ///
  /// In en, this message translates to:
  /// **'Based on the same plug type and current only. No adapter is recommended.'**
  String get chargingCompatNoAdapters;

  /// No description provided for @chargingCompatNoGuess.
  ///
  /// In en, this message translates to:
  /// **'The station is shown without a compatibility guess.'**
  String get chargingCompatNoGuess;

  /// No description provided for @chargingCompatNone.
  ///
  /// In en, this message translates to:
  /// **'No connector here matches the verified charging inlets of {car}.'**
  String chargingCompatNone(String car);

  /// No description provided for @chargingCompatNotice.
  ///
  /// In en, this message translates to:
  /// **'Showing connectors compatible with {car}, based on verified inlet data only.'**
  String chargingCompatNotice(String car);

  /// No description provided for @chargingCompatSection.
  ///
  /// In en, this message translates to:
  /// **'Compatibility with your car'**
  String get chargingCompatSection;

  /// No description provided for @chargingCompatSome.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 connector matches {car}.} other{{count} connectors match {car}.}}'**
  String chargingCompatSome(String car, int count);

  /// No description provided for @chargingCompatUnknownShort.
  ///
  /// In en, this message translates to:
  /// **'No verified charging data for this car'**
  String get chargingCompatUnknownShort;

  /// No description provided for @chargingCompatUnknownTitle.
  ///
  /// In en, this message translates to:
  /// **'Compatibility can\'t be checked'**
  String get chargingCompatUnknownTitle;

  /// No description provided for @chargingCompatibleConnectors.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 compatible connector} other{{count} compatible connectors}}'**
  String chargingCompatibleConnectors(int count);

  /// No description provided for @chargingConnectorCompatible.
  ///
  /// In en, this message translates to:
  /// **'Compatible'**
  String get chargingConnectorCompatible;

  /// No description provided for @chargingConnectorCompatibleUpTo.
  ///
  /// In en, this message translates to:
  /// **'Compatible up to {power}'**
  String chargingConnectorCompatibleUpTo(String power);

  /// No description provided for @chargingConnectorNotCompatible.
  ///
  /// In en, this message translates to:
  /// **'Not compatible'**
  String get chargingConnectorNotCompatible;

  /// No description provided for @chargingConnectorType.
  ///
  /// In en, this message translates to:
  /// **'Connector type'**
  String get chargingConnectorType;

  /// No description provided for @chargingConnectorsSection.
  ///
  /// In en, this message translates to:
  /// **'Chargers and connectors'**
  String get chargingConnectorsSection;

  /// No description provided for @chargingContactSection.
  ///
  /// In en, this message translates to:
  /// **'Contact'**
  String get chargingContactSection;

  /// No description provided for @chargingCurrentAc.
  ///
  /// In en, this message translates to:
  /// **'AC'**
  String get chargingCurrentAc;

  /// No description provided for @chargingCurrentDc.
  ///
  /// In en, this message translates to:
  /// **'DC'**
  String get chargingCurrentDc;

  /// No description provided for @chargingCurrentTypes.
  ///
  /// In en, this message translates to:
  /// **'Current'**
  String get chargingCurrentTypes;

  /// No description provided for @chargingDataSource.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get chargingDataSource;

  /// No description provided for @chargingDayClosed.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get chargingDayClosed;

  /// No description provided for @chargingDayFri.
  ///
  /// In en, this message translates to:
  /// **'Friday'**
  String get chargingDayFri;

  /// No description provided for @chargingDayMon.
  ///
  /// In en, this message translates to:
  /// **'Monday'**
  String get chargingDayMon;

  /// No description provided for @chargingDaySat.
  ///
  /// In en, this message translates to:
  /// **'Saturday'**
  String get chargingDaySat;

  /// No description provided for @chargingDaySun.
  ///
  /// In en, this message translates to:
  /// **'Sunday'**
  String get chargingDaySun;

  /// No description provided for @chargingDayThu.
  ///
  /// In en, this message translates to:
  /// **'Thursday'**
  String get chargingDayThu;

  /// No description provided for @chargingDayTue.
  ///
  /// In en, this message translates to:
  /// **'Tuesday'**
  String get chargingDayTue;

  /// No description provided for @chargingDayUnknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get chargingDayUnknown;

  /// No description provided for @chargingDayWed.
  ///
  /// In en, this message translates to:
  /// **'Wednesday'**
  String get chargingDayWed;

  /// No description provided for @chargingDefaultPlaceHint.
  ///
  /// In en, this message translates to:
  /// **'Showing the default city of your country. Use your location or choose another place.'**
  String get chargingDefaultPlaceHint;

  /// No description provided for @chargingDemoNoDirections.
  ///
  /// In en, this message translates to:
  /// **'This is a demo station, not a real place.'**
  String get chargingDemoNoDirections;

  /// No description provided for @chargingDemoNotRealPlace.
  ///
  /// In en, this message translates to:
  /// **'Demo station for testing — not a real place. Do not drive here.'**
  String get chargingDemoNotRealPlace;

  /// No description provided for @chargingDirections.
  ///
  /// In en, this message translates to:
  /// **'Directions'**
  String get chargingDirections;

  /// No description provided for @chargingDirectionsNote.
  ///
  /// In en, this message translates to:
  /// **'Opens a navigation app with the station\'s coordinates. Check access and opening hours before you go.'**
  String get chargingDirectionsNote;

  /// No description provided for @chargingDistance.
  ///
  /// In en, this message translates to:
  /// **'Distance'**
  String get chargingDistance;

  /// No description provided for @chargingDistanceAway.
  ///
  /// In en, this message translates to:
  /// **'{distance} away'**
  String chargingDistanceAway(String distance);

  /// No description provided for @chargingDistanceMeters.
  ///
  /// In en, this message translates to:
  /// **'{meters} m'**
  String chargingDistanceMeters(String meters);

  /// No description provided for @chargingEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get chargingEmail;

  /// No description provided for @chargingEmptyFilteredMessage.
  ///
  /// In en, this message translates to:
  /// **'No station matches these filters here. Try clearing some filters or searching a wider area.'**
  String get chargingEmptyFilteredMessage;

  /// No description provided for @chargingEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'No published stations were found in this area. Coverage of any country is not complete — you can suggest a station you know.'**
  String get chargingEmptyMessage;

  /// No description provided for @chargingEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No stations here'**
  String get chargingEmptyTitle;

  /// No description provided for @chargingEndOfResults.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 station in total} other{{count} stations in total}}'**
  String chargingEndOfResults(int count);

  /// No description provided for @chargingEntrance.
  ///
  /// In en, this message translates to:
  /// **'Entrance'**
  String get chargingEntrance;

  /// No description provided for @chargingFetchedAt.
  ///
  /// In en, this message translates to:
  /// **'Loaded {time}'**
  String chargingFetchedAt(String time);

  /// No description provided for @chargingFilterAmenities.
  ///
  /// In en, this message translates to:
  /// **'Nearby amenities'**
  String get chargingFilterAmenities;

  /// No description provided for @chargingFilterAmenitiesHelp.
  ///
  /// In en, this message translates to:
  /// **'Stations must have all selected amenities.'**
  String get chargingFilterAmenitiesHelp;

  /// No description provided for @chargingFilterAny.
  ///
  /// In en, this message translates to:
  /// **'Any'**
  String get chargingFilterAny;

  /// No description provided for @chargingFilterAvailability.
  ///
  /// In en, this message translates to:
  /// **'Hours and access'**
  String get chargingFilterAvailability;

  /// No description provided for @chargingFilterConnectors.
  ///
  /// In en, this message translates to:
  /// **'Connector types'**
  String get chargingFilterConnectors;

  /// No description provided for @chargingFilterConnectorsHelp.
  ///
  /// In en, this message translates to:
  /// **'One connector must match the type, current and power together.'**
  String get chargingFilterConnectorsHelp;

  /// No description provided for @chargingFilterCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current type'**
  String get chargingFilterCurrent;

  /// No description provided for @chargingFilterMetaUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Connector list is not available right now.'**
  String get chargingFilterMetaUnavailable;

  /// No description provided for @chargingFilterMinPower.
  ///
  /// In en, this message translates to:
  /// **'Minimum power'**
  String get chargingFilterMinPower;

  /// No description provided for @chargingFilterMinPowerHelp.
  ///
  /// In en, this message translates to:
  /// **'Connectors with unknown power are not included.'**
  String get chargingFilterMinPowerHelp;

  /// No description provided for @chargingFilterOpenNow.
  ///
  /// In en, this message translates to:
  /// **'Open now'**
  String get chargingFilterOpenNow;

  /// No description provided for @chargingFilterOpenNowHelp.
  ///
  /// In en, this message translates to:
  /// **'By published opening hours. Stations with unknown hours are hidden.'**
  String get chargingFilterOpenNowHelp;

  /// No description provided for @chargingFilterOperator.
  ///
  /// In en, this message translates to:
  /// **'Operator'**
  String get chargingFilterOperator;

  /// No description provided for @chargingFilterOperatorHelp.
  ///
  /// In en, this message translates to:
  /// **'From the stations loaded in this area.'**
  String get chargingFilterOperatorHelp;

  /// No description provided for @chargingFilterPowerAtLeast.
  ///
  /// In en, this message translates to:
  /// **'{power}+'**
  String chargingFilterPowerAtLeast(String power);

  /// No description provided for @chargingFilterPublicOnly.
  ///
  /// In en, this message translates to:
  /// **'Public access only'**
  String get chargingFilterPublicOnly;

  /// No description provided for @chargingFilterVehicle.
  ///
  /// In en, this message translates to:
  /// **'Compatible with my car'**
  String get chargingFilterVehicle;

  /// No description provided for @chargingFilterVehicleAddCar.
  ///
  /// In en, this message translates to:
  /// **'Add a car to my garage'**
  String get chargingFilterVehicleAddCar;

  /// No description provided for @chargingFilterVehicleHelp.
  ///
  /// In en, this message translates to:
  /// **'Uses verified charging-inlet data of your car in its market. Plug shape alone is never treated as compatible, and adapters are never assumed.'**
  String get chargingFilterVehicleHelp;

  /// No description provided for @chargingFilterVehicleNone.
  ///
  /// In en, this message translates to:
  /// **'Any car'**
  String get chargingFilterVehicleNone;

  /// No description provided for @chargingFilterVehicleNotInMarket.
  ///
  /// In en, this message translates to:
  /// **'Not listed in this car\'s market — compatibility may be unknown'**
  String get chargingFilterVehicleNotInMarket;

  /// No description provided for @chargingFilterVehicleSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in to use a car from your garage'**
  String get chargingFilterVehicleSignIn;

  /// No description provided for @chargingFiltersTitle.
  ///
  /// In en, this message translates to:
  /// **'Station filters'**
  String get chargingFiltersTitle;

  /// No description provided for @chargingFloor.
  ///
  /// In en, this message translates to:
  /// **'Floor {floor}'**
  String chargingFloor(String floor);

  /// No description provided for @chargingFormatCable.
  ///
  /// In en, this message translates to:
  /// **'attached cable'**
  String get chargingFormatCable;

  /// No description provided for @chargingFormatSocket.
  ///
  /// In en, this message translates to:
  /// **'socket (bring your cable)'**
  String get chargingFormatSocket;

  /// No description provided for @chargingGraceMinutes.
  ///
  /// In en, this message translates to:
  /// **'after {minutes} min grace'**
  String chargingGraceMinutes(String minutes);

  /// No description provided for @chargingHoursAsPublished.
  ///
  /// In en, this message translates to:
  /// **'As published by the source: {text}'**
  String chargingHoursAsPublished(String text);

  /// No description provided for @chargingHoursNotPublished.
  ///
  /// In en, this message translates to:
  /// **'Opening hours are not published.'**
  String get chargingHoursNotPublished;

  /// No description provided for @chargingHoursSection.
  ///
  /// In en, this message translates to:
  /// **'Opening hours'**
  String get chargingHoursSection;

  /// No description provided for @chargingHoursTextOnly.
  ///
  /// In en, this message translates to:
  /// **'Hours are published as text only — see below.'**
  String get chargingHoursTextOnly;

  /// No description provided for @chargingHoursTimezoneNote.
  ///
  /// In en, this message translates to:
  /// **'Times are in the station\'s time zone ({zone}).'**
  String chargingHoursTimezoneNote(String zone);

  /// No description provided for @chargingHoursUnknown.
  ///
  /// In en, this message translates to:
  /// **'Hours unknown'**
  String get chargingHoursUnknown;

  /// No description provided for @chargingInvalidPower.
  ///
  /// In en, this message translates to:
  /// **'Enter a power between 0 and 1000 kW.'**
  String get chargingInvalidPower;

  /// No description provided for @chargingInvalidWait.
  ///
  /// In en, this message translates to:
  /// **'Enter minutes between 0 and 1440.'**
  String get chargingInvalidWait;

  /// No description provided for @chargingLastSynced.
  ///
  /// In en, this message translates to:
  /// **'Last synced'**
  String get chargingLastSynced;

  /// No description provided for @chargingLastVerified.
  ///
  /// In en, this message translates to:
  /// **'Last verified'**
  String get chargingLastVerified;

  /// No description provided for @chargingLatitude.
  ///
  /// In en, this message translates to:
  /// **'Latitude'**
  String get chargingLatitude;

  /// No description provided for @chargingLicense.
  ///
  /// In en, this message translates to:
  /// **'Licence'**
  String get chargingLicense;

  /// No description provided for @chargingLocationDenied.
  ///
  /// In en, this message translates to:
  /// **'Location permission was not given. You can choose a place instead.'**
  String get chargingLocationDenied;

  /// No description provided for @chargingLocationDeniedForever.
  ///
  /// In en, this message translates to:
  /// **'Location access is turned off for this app. Turn it on in settings, or choose a city or a point instead.'**
  String get chargingLocationDeniedForever;

  /// No description provided for @chargingLocationPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Asked only now, used while you use the app, never saved.'**
  String get chargingLocationPrivacy;

  /// No description provided for @chargingLocationServiceOff.
  ///
  /// In en, this message translates to:
  /// **'Location services are off on this device. Turn them on, or choose a city or a point instead.'**
  String get chargingLocationServiceOff;

  /// No description provided for @chargingLocationTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose a place'**
  String get chargingLocationTitle;

  /// No description provided for @chargingLocationUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Your location could not be determined. Choose a place instead.'**
  String get chargingLocationUnavailable;

  /// No description provided for @chargingLogsAdd.
  ///
  /// In en, this message translates to:
  /// **'Add session'**
  String get chargingLogsAdd;

  /// No description provided for @chargingLogsAdded.
  ///
  /// In en, this message translates to:
  /// **'Session added.'**
  String get chargingLogsAdded;

  /// No description provided for @chargingLogsAllCars.
  ///
  /// In en, this message translates to:
  /// **'All cars'**
  String get chargingLogsAllCars;

  /// No description provided for @chargingLogsAvgPerKwh.
  ///
  /// In en, this message translates to:
  /// **'Average per kWh'**
  String get chargingLogsAvgPerKwh;

  /// No description provided for @chargingLogsByLocation.
  ///
  /// In en, this message translates to:
  /// **'Where you charge'**
  String get chargingLogsByLocation;

  /// No description provided for @chargingLogsCar.
  ///
  /// In en, this message translates to:
  /// **'Car'**
  String get chargingLogsCar;

  /// No description provided for @chargingLogsConfidenceLow.
  ///
  /// In en, this message translates to:
  /// **'Low confidence'**
  String get chargingLogsConfidenceLow;

  /// No description provided for @chargingLogsConfidenceMedium.
  ///
  /// In en, this message translates to:
  /// **'Medium confidence'**
  String get chargingLogsConfidenceMedium;

  /// No description provided for @chargingLogsConsumption.
  ///
  /// In en, this message translates to:
  /// **'Consumption'**
  String get chargingLogsConsumption;

  /// No description provided for @chargingLogsCost.
  ///
  /// In en, this message translates to:
  /// **'Amount paid'**
  String get chargingLogsCost;

  /// No description provided for @chargingLogsCostHint.
  ///
  /// In en, this message translates to:
  /// **'Optional. Leave empty if you do not know it — it will not count as free.'**
  String get chargingLogsCostHint;

  /// No description provided for @chargingLogsCostPer100.
  ///
  /// In en, this message translates to:
  /// **'Cost per 100 km'**
  String get chargingLogsCostPer100;

  /// No description provided for @chargingLogsCostSection.
  ///
  /// In en, this message translates to:
  /// **'Cost'**
  String get chargingLogsCostSection;

  /// No description provided for @chargingLogsCurrency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get chargingLogsCurrency;

  /// No description provided for @chargingLogsCurrentType.
  ///
  /// In en, this message translates to:
  /// **'Current type'**
  String get chargingLogsCurrentType;

  /// No description provided for @chargingLogsCurrentUnknown.
  ///
  /// In en, this message translates to:
  /// **'Not sure'**
  String get chargingLogsCurrentUnknown;

  /// No description provided for @chargingLogsDate.
  ///
  /// In en, this message translates to:
  /// **'Date and time'**
  String get chargingLogsDate;

  /// No description provided for @chargingLogsDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete session'**
  String get chargingLogsDelete;

  /// No description provided for @chargingLogsDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this session?'**
  String get chargingLogsDeleteConfirm;

  /// No description provided for @chargingLogsDeleteMessage.
  ///
  /// In en, this message translates to:
  /// **'It will be removed from your reports.'**
  String get chargingLogsDeleteMessage;

  /// No description provided for @chargingLogsDeleted.
  ///
  /// In en, this message translates to:
  /// **'Session deleted.'**
  String get chargingLogsDeleted;

  /// No description provided for @chargingLogsDistance.
  ///
  /// In en, this message translates to:
  /// **'Distance'**
  String get chargingLogsDistance;

  /// No description provided for @chargingLogsDuration.
  ///
  /// In en, this message translates to:
  /// **'Duration'**
  String get chargingLogsDuration;

  /// No description provided for @chargingLogsEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit charging session'**
  String get chargingLogsEditTitle;

  /// No description provided for @chargingLogsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Log the energy, cost and odometer of each charge. Reports are built only from what you enter.'**
  String get chargingLogsEmptyMessage;

  /// No description provided for @chargingLogsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No charging sessions yet'**
  String get chargingLogsEmptyTitle;

  /// No description provided for @chargingLogsEnergy.
  ///
  /// In en, this message translates to:
  /// **'Energy charged'**
  String get chargingLogsEnergy;

  /// No description provided for @chargingLogsEnergyHint.
  ///
  /// In en, this message translates to:
  /// **'As shown by the charger, app or meter.'**
  String get chargingLogsEnergyHint;

  /// No description provided for @chargingLogsErrorMax.
  ///
  /// In en, this message translates to:
  /// **'Must be at most {max}.'**
  String chargingLogsErrorMax(String max);

  /// No description provided for @chargingLogsErrorPositive.
  ///
  /// In en, this message translates to:
  /// **'Must be greater than zero.'**
  String get chargingLogsErrorPositive;

  /// No description provided for @chargingLogsErrorRequired.
  ///
  /// In en, this message translates to:
  /// **'Required.'**
  String get chargingLogsErrorRequired;

  /// No description provided for @chargingLogsErrorSoc.
  ///
  /// In en, this message translates to:
  /// **'The end level must be above the start level.'**
  String get chargingLogsErrorSoc;

  /// No description provided for @chargingLogsGuestMessage.
  ///
  /// In en, this message translates to:
  /// **'Sign in to keep a private log of your charging sessions and see your real spending and consumption.'**
  String get chargingLogsGuestMessage;

  /// No description provided for @chargingLogsInCurrency.
  ///
  /// In en, this message translates to:
  /// **'In {currency}'**
  String chargingLogsInCurrency(String currency);

  /// No description provided for @chargingLogsLoadMore.
  ///
  /// In en, this message translates to:
  /// **'Load more'**
  String get chargingLogsLoadMore;

  /// No description provided for @chargingLogsLocation.
  ///
  /// In en, this message translates to:
  /// **'Where'**
  String get chargingLogsLocation;

  /// No description provided for @chargingLogsLocationHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get chargingLogsLocationHome;

  /// No description provided for @chargingLogsLocationOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get chargingLogsLocationOther;

  /// No description provided for @chargingLogsLocationPublic.
  ///
  /// In en, this message translates to:
  /// **'Public'**
  String get chargingLogsLocationPublic;

  /// No description provided for @chargingLogsLocationWork.
  ///
  /// In en, this message translates to:
  /// **'Work'**
  String get chargingLogsLocationWork;

  /// No description provided for @chargingLogsLowConfidenceHint.
  ///
  /// In en, this message translates to:
  /// **'Based on few readings or a short distance. Log more sessions with the odometer for a better figure.'**
  String get chargingLogsLowConfidenceHint;

  /// No description provided for @chargingLogsMethod.
  ///
  /// In en, this message translates to:
  /// **'How this is calculated'**
  String get chargingLogsMethod;

  /// No description provided for @chargingLogsMixedCurrencies.
  ///
  /// In en, this message translates to:
  /// **'You paid in more than one currency. Amounts are shown per currency and never converted.'**
  String get chargingLogsMixedCurrencies;

  /// No description provided for @chargingLogsMonthlyEnergy.
  ///
  /// In en, this message translates to:
  /// **'Monthly energy'**
  String get chargingLogsMonthlyEnergy;

  /// No description provided for @chargingLogsMonthlySpend.
  ///
  /// In en, this message translates to:
  /// **'Monthly spending'**
  String get chargingLogsMonthlySpend;

  /// No description provided for @chargingLogsMoreHint.
  ///
  /// In en, this message translates to:
  /// **'Optional. The odometer reading makes consumption reports possible.'**
  String get chargingLogsMoreHint;

  /// No description provided for @chargingLogsMoreSection.
  ///
  /// In en, this message translates to:
  /// **'More details'**
  String get chargingLogsMoreSection;

  /// No description provided for @chargingLogsNewTitle.
  ///
  /// In en, this message translates to:
  /// **'New charging session'**
  String get chargingLogsNewTitle;

  /// No description provided for @chargingLogsNoCarMessage.
  ///
  /// In en, this message translates to:
  /// **'Each charging session belongs to a car in your garage.'**
  String get chargingLogsNoCarMessage;

  /// No description provided for @chargingLogsNoCarTitle.
  ///
  /// In en, this message translates to:
  /// **'Add your car first'**
  String get chargingLogsNoCarTitle;

  /// No description provided for @chargingLogsNoCost.
  ///
  /// In en, this message translates to:
  /// **'No cost entered'**
  String get chargingLogsNoCost;

  /// No description provided for @chargingLogsNoSpendData.
  ///
  /// In en, this message translates to:
  /// **'No costs were entered in this period.'**
  String get chargingLogsNoSpendData;

  /// No description provided for @chargingLogsNotes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get chargingLogsNotes;

  /// No description provided for @chargingLogsOdometer.
  ///
  /// In en, this message translates to:
  /// **'Odometer'**
  String get chargingLogsOdometer;

  /// No description provided for @chargingLogsOdometerHint.
  ///
  /// In en, this message translates to:
  /// **'Must not be lower than an earlier session of this car.'**
  String get chargingLogsOdometerHint;

  /// No description provided for @chargingLogsPerKwh.
  ///
  /// In en, this message translates to:
  /// **'{price}/kWh'**
  String chargingLogsPerKwh(String price);

  /// No description provided for @chargingLogsPeriod12.
  ///
  /// In en, this message translates to:
  /// **'12 months'**
  String get chargingLogsPeriod12;

  /// No description provided for @chargingLogsPeriod3.
  ///
  /// In en, this message translates to:
  /// **'3 months'**
  String get chargingLogsPeriod3;

  /// No description provided for @chargingLogsPeriod6.
  ///
  /// In en, this message translates to:
  /// **'6 months'**
  String get chargingLogsPeriod6;

  /// No description provided for @chargingLogsPeriodAll.
  ///
  /// In en, this message translates to:
  /// **'All time'**
  String get chargingLogsPeriodAll;

  /// No description provided for @chargingLogsPower.
  ///
  /// In en, this message translates to:
  /// **'Charger power'**
  String get chargingLogsPower;

  /// No description provided for @chargingLogsReasonMissingCosts.
  ///
  /// In en, this message translates to:
  /// **'Insufficient data: some costs missing'**
  String get chargingLogsReasonMissingCosts;

  /// No description provided for @chargingLogsReasonMixedCurrencies.
  ///
  /// In en, this message translates to:
  /// **'Not shown: mixed currencies'**
  String get chargingLogsReasonMixedCurrencies;

  /// No description provided for @chargingLogsReasonNoDistance.
  ///
  /// In en, this message translates to:
  /// **'Insufficient data: no distance between readings'**
  String get chargingLogsReasonNoDistance;

  /// No description provided for @chargingLogsReasonNoSessions.
  ///
  /// In en, this message translates to:
  /// **'Insufficient data: no sessions'**
  String get chargingLogsReasonNoSessions;

  /// No description provided for @chargingLogsReasonOdometer.
  ///
  /// In en, this message translates to:
  /// **'Insufficient data: needs 2+ odometer readings'**
  String get chargingLogsReasonOdometer;

  /// No description provided for @chargingLogsReasonUnknown.
  ///
  /// In en, this message translates to:
  /// **'Insufficient data'**
  String get chargingLogsReasonUnknown;

  /// No description provided for @chargingLogsReportEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Reports use only the sessions you log. Add a session or choose a longer period.'**
  String get chargingLogsReportEmptyMessage;

  /// No description provided for @chargingLogsReportEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No sessions in this period'**
  String get chargingLogsReportEmptyTitle;

  /// No description provided for @chargingLogsReportsTitle.
  ///
  /// In en, this message translates to:
  /// **'Spending & consumption'**
  String get chargingLogsReportsTitle;

  /// No description provided for @chargingLogsSaved.
  ///
  /// In en, this message translates to:
  /// **'Session saved.'**
  String get chargingLogsSaved;

  /// No description provided for @chargingLogsSessionSection.
  ///
  /// In en, this message translates to:
  /// **'Session'**
  String get chargingLogsSessionSection;

  /// No description provided for @chargingLogsSessions.
  ///
  /// In en, this message translates to:
  /// **'Sessions'**
  String get chargingLogsSessions;

  /// No description provided for @chargingLogsSessionsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 session} other{{count} sessions}}'**
  String chargingLogsSessionsCount(int count);

  /// No description provided for @chargingLogsSessionsWithoutCost.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 session has no cost and is not in the spending totals.} other{{count} sessions have no cost and are not in the spending totals.}}'**
  String chargingLogsSessionsWithoutCost(int count);

  /// No description provided for @chargingLogsShowTable.
  ///
  /// In en, this message translates to:
  /// **'Show the numbers'**
  String get chargingLogsShowTable;

  /// No description provided for @chargingLogsSocEnd.
  ///
  /// In en, this message translates to:
  /// **'Battery at end'**
  String get chargingLogsSocEnd;

  /// No description provided for @chargingLogsSocStart.
  ///
  /// In en, this message translates to:
  /// **'Battery at start'**
  String get chargingLogsSocStart;

  /// No description provided for @chargingLogsTitle.
  ///
  /// In en, this message translates to:
  /// **'Charging log'**
  String get chargingLogsTitle;

  /// No description provided for @chargingLogsTotalEnergy.
  ///
  /// In en, this message translates to:
  /// **'Energy'**
  String get chargingLogsTotalEnergy;

  /// No description provided for @chargingLogsTotalSpend.
  ///
  /// In en, this message translates to:
  /// **'Spent'**
  String get chargingLogsTotalSpend;

  /// No description provided for @chargingLogsVehicleSummary.
  ///
  /// In en, this message translates to:
  /// **'{sessions, plural, =1{1 session} other{{sessions} sessions}} · {energy}'**
  String chargingLogsVehicleSummary(int sessions, String energy);

  /// No description provided for @chargingLongitude.
  ///
  /// In en, this message translates to:
  /// **'Longitude'**
  String get chargingLongitude;

  /// No description provided for @chargingMapNotConfigured.
  ///
  /// In en, this message translates to:
  /// **'The map is not configured yet, so stations are shown as a list.'**
  String get chargingMapNotConfigured;

  /// No description provided for @chargingMapSemantics.
  ///
  /// In en, this message translates to:
  /// **'Charging stations map, {count} stations'**
  String chargingMapSemantics(int count);

  /// No description provided for @chargingMaxPower.
  ///
  /// In en, this message translates to:
  /// **'Max power'**
  String get chargingMaxPower;

  /// No description provided for @chargingMergedMessage.
  ///
  /// In en, this message translates to:
  /// **'It was a duplicate of another station and its details now live there.'**
  String get chargingMergedMessage;

  /// No description provided for @chargingMergedTitle.
  ///
  /// In en, this message translates to:
  /// **'This station was merged'**
  String get chargingMergedTitle;

  /// No description provided for @chargingMinutesUnit.
  ///
  /// In en, this message translates to:
  /// **'min'**
  String get chargingMinutesUnit;

  /// No description provided for @chargingNavApple.
  ///
  /// In en, this message translates to:
  /// **'Apple Maps'**
  String get chargingNavApple;

  /// No description provided for @chargingNavFailed.
  ///
  /// In en, this message translates to:
  /// **'No app could open the directions.'**
  String get chargingNavFailed;

  /// No description provided for @chargingNavGoogle.
  ///
  /// In en, this message translates to:
  /// **'Google Maps'**
  String get chargingNavGoogle;

  /// No description provided for @chargingNavSystem.
  ///
  /// In en, this message translates to:
  /// **'Choose a navigation app'**
  String get chargingNavSystem;

  /// No description provided for @chargingNavWaze.
  ///
  /// In en, this message translates to:
  /// **'Waze'**
  String get chargingNavWaze;

  /// No description provided for @chargingNavWeb.
  ///
  /// In en, this message translates to:
  /// **'Open in web map'**
  String get chargingNavWeb;

  /// No description provided for @chargingNearMe.
  ///
  /// In en, this message translates to:
  /// **'Near me'**
  String get chargingNearMe;

  /// No description provided for @chargingNoCityMatch.
  ///
  /// In en, this message translates to:
  /// **'No city matches'**
  String get chargingNoCityMatch;

  /// No description provided for @chargingNoConnectorData.
  ///
  /// In en, this message translates to:
  /// **'No connector data is available.'**
  String get chargingNoConnectorData;

  /// No description provided for @chargingNoLiveProvider.
  ///
  /// In en, this message translates to:
  /// **'Live availability is shown only from a connected live source. None is connected yet, so it shows as unknown.'**
  String get chargingNoLiveProvider;

  /// No description provided for @chargingNoLiveSourceForStation.
  ///
  /// In en, this message translates to:
  /// **'No live data source is connected for this station, so availability is unknown. Community check-ins below are not live.'**
  String get chargingNoLiveSourceForStation;

  /// No description provided for @chargingNoStationsHere.
  ///
  /// In en, this message translates to:
  /// **'No stations found in this area'**
  String get chargingNoStationsHere;

  /// No description provided for @chargingNoneStated.
  ///
  /// In en, this message translates to:
  /// **'None stated by the source'**
  String get chargingNoneStated;

  /// No description provided for @chargingNotCompatible.
  ///
  /// In en, this message translates to:
  /// **'No compatible connector'**
  String get chargingNotCompatible;

  /// No description provided for @chargingNotSure.
  ///
  /// In en, this message translates to:
  /// **'Not sure'**
  String get chargingNotSure;

  /// No description provided for @chargingObservedPower.
  ///
  /// In en, this message translates to:
  /// **'{power} observed'**
  String chargingObservedPower(String power);

  /// No description provided for @chargingOfflineNoLive.
  ///
  /// In en, this message translates to:
  /// **'This is saved data. Live status is never shown from saved data.'**
  String get chargingOfflineNoLive;

  /// No description provided for @chargingOpOperational.
  ///
  /// In en, this message translates to:
  /// **'Operational'**
  String get chargingOpOperational;

  /// No description provided for @chargingOpPermanentlyClosed.
  ///
  /// In en, this message translates to:
  /// **'Permanently closed'**
  String get chargingOpPermanentlyClosed;

  /// No description provided for @chargingOpPlanned.
  ///
  /// In en, this message translates to:
  /// **'Planned'**
  String get chargingOpPlanned;

  /// No description provided for @chargingOpTemporarilyUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Temporarily unavailable'**
  String get chargingOpTemporarilyUnavailable;

  /// No description provided for @chargingOpUnknown.
  ///
  /// In en, this message translates to:
  /// **'Operation status unknown'**
  String get chargingOpUnknown;

  /// No description provided for @chargingOpen24h.
  ///
  /// In en, this message translates to:
  /// **'Open 24 hours'**
  String get chargingOpen24h;

  /// No description provided for @chargingOpenMerged.
  ///
  /// In en, this message translates to:
  /// **'Open the station'**
  String get chargingOpenMerged;

  /// No description provided for @chargingOpenNow.
  ///
  /// In en, this message translates to:
  /// **'Open now'**
  String get chargingOpenNow;

  /// No description provided for @chargingOpenNowFromSaved.
  ///
  /// In en, this message translates to:
  /// **'Worked out on this device from the saved opening hours.'**
  String get chargingOpenNowFromSaved;

  /// No description provided for @chargingOpenReports.
  ///
  /// In en, this message translates to:
  /// **'Open reports'**
  String get chargingOpenReports;

  /// No description provided for @chargingOpenSource.
  ///
  /// In en, this message translates to:
  /// **'Open the source'**
  String get chargingOpenSource;

  /// No description provided for @chargingOpensAt.
  ///
  /// In en, this message translates to:
  /// **'Opens {time} (station time)'**
  String chargingOpensAt(String time);

  /// No description provided for @chargingOptional.
  ///
  /// In en, this message translates to:
  /// **'optional'**
  String get chargingOptional;

  /// No description provided for @chargingParking.
  ///
  /// In en, this message translates to:
  /// **'Parking'**
  String get chargingParking;

  /// No description provided for @chargingPaymentMethods.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get chargingPaymentMethods;

  /// No description provided for @chargingPhases.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{single-phase} other{{count}-phase}}'**
  String chargingPhases(int count);

  /// No description provided for @chargingPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get chargingPhone;

  /// No description provided for @chargingPhoto.
  ///
  /// In en, this message translates to:
  /// **'Station photo'**
  String get chargingPhoto;

  /// No description provided for @chargingPickPointHint.
  ///
  /// In en, this message translates to:
  /// **'Pin at {lat}, {lng}. Move the map to adjust.'**
  String chargingPickPointHint(String lat, String lng);

  /// No description provided for @chargingPickPointSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Move the map to place the pin, then search around it.'**
  String get chargingPickPointSubtitle;

  /// No description provided for @chargingPickPointTitle.
  ///
  /// In en, this message translates to:
  /// **'Pick a point on the map'**
  String get chargingPickPointTitle;

  /// No description provided for @chargingPlaceDefaultCity.
  ///
  /// In en, this message translates to:
  /// **'{city} (default)'**
  String chargingPlaceDefaultCity(String city);

  /// No description provided for @chargingPlaceMapPoint.
  ///
  /// In en, this message translates to:
  /// **'Chosen point'**
  String get chargingPlaceMapPoint;

  /// No description provided for @chargingPlaceMarker.
  ///
  /// In en, this message translates to:
  /// **'Chosen search point'**
  String get chargingPlaceMarker;

  /// No description provided for @chargingPlaceNearYou.
  ///
  /// In en, this message translates to:
  /// **'Near you'**
  String get chargingPlaceNearYou;

  /// No description provided for @chargingPlugCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 connector} other{{count} connectors}}'**
  String chargingPlugCount(int count);

  /// No description provided for @chargingPlugsNotCars.
  ///
  /// In en, this message translates to:
  /// **'The number of connectors is not the number of cars that can charge at the same time.'**
  String get chargingPlugsNotCars;

  /// No description provided for @chargingPointCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 charger} other{{count} chargers}}'**
  String chargingPointCount(int count);

  /// No description provided for @chargingPointCountUnknown.
  ///
  /// In en, this message translates to:
  /// **'Number of chargers not available'**
  String get chargingPointCountUnknown;

  /// No description provided for @chargingPointUnnamed.
  ///
  /// In en, this message translates to:
  /// **'Charger'**
  String get chargingPointUnnamed;

  /// No description provided for @chargingPowerRange.
  ///
  /// In en, this message translates to:
  /// **'{min}–{max}'**
  String chargingPowerRange(String min, String max);

  /// No description provided for @chargingPowerUnknown.
  ///
  /// In en, this message translates to:
  /// **'Power not available'**
  String get chargingPowerUnknown;

  /// No description provided for @chargingPriceNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'Prices are not available for this station.'**
  String get chargingPriceNotAvailable;

  /// No description provided for @chargingPricesSection.
  ///
  /// In en, this message translates to:
  /// **'Prices'**
  String get chargingPricesSection;

  /// No description provided for @chargingQuantity.
  ///
  /// In en, this message translates to:
  /// **'×{count}'**
  String chargingQuantity(int count);

  /// No description provided for @chargingQuickDc.
  ///
  /// In en, this message translates to:
  /// **'Fast DC'**
  String get chargingQuickDc;

  /// No description provided for @chargingQuickMyCar.
  ///
  /// In en, this message translates to:
  /// **'Fits my car'**
  String get chargingQuickMyCar;

  /// No description provided for @chargingQuickMyCarNamed.
  ///
  /// In en, this message translates to:
  /// **'Fits {name}'**
  String chargingQuickMyCarNamed(String name);

  /// No description provided for @chargingRecentCheckins.
  ///
  /// In en, this message translates to:
  /// **'Recent check-ins'**
  String get chargingRecentCheckins;

  /// No description provided for @chargingRecentReports.
  ///
  /// In en, this message translates to:
  /// **'Reports (last 90 days)'**
  String get chargingRecentReports;

  /// No description provided for @chargingRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get chargingRemove;

  /// No description provided for @chargingRemoveCarFilter.
  ///
  /// In en, this message translates to:
  /// **'Remove car filter'**
  String get chargingRemoveCarFilter;

  /// No description provided for @chargingReportDetails.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get chargingReportDetails;

  /// No description provided for @chargingReportDetailsHint.
  ///
  /// In en, this message translates to:
  /// **'What did you see? When?'**
  String get chargingReportDetailsHint;

  /// No description provided for @chargingReportDetailsRequired.
  ///
  /// In en, this message translates to:
  /// **'Please describe the problem.'**
  String get chargingReportDetailsRequired;

  /// No description provided for @chargingReportIntro.
  ///
  /// In en, this message translates to:
  /// **'Tell us what is wrong. Moderators review every report; it does not change the station by itself.'**
  String get chargingReportIntro;

  /// No description provided for @chargingReportModeration.
  ///
  /// In en, this message translates to:
  /// **'Reports are anonymous on the station page (type, status and date only).'**
  String get chargingReportModeration;

  /// No description provided for @chargingReportNewPrice.
  ///
  /// In en, this message translates to:
  /// **'Price you saw'**
  String get chargingReportNewPrice;

  /// No description provided for @chargingReportNewPriceHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. price per kWh as shown at the charger'**
  String get chargingReportNewPriceHint;

  /// No description provided for @chargingReportSeenConnector.
  ///
  /// In en, this message translates to:
  /// **'Connector you found on site'**
  String get chargingReportSeenConnector;

  /// No description provided for @chargingReportSentMessage.
  ///
  /// In en, this message translates to:
  /// **'Moderators will review it. You can follow it under your reports.'**
  String get chargingReportSentMessage;

  /// No description provided for @chargingReportSentTitle.
  ///
  /// In en, this message translates to:
  /// **'Thanks for your report'**
  String get chargingReportSentTitle;

  /// No description provided for @chargingReportShort.
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get chargingReportShort;

  /// No description provided for @chargingReportSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in to report a problem, so moderators can review it and prevent abuse.'**
  String get chargingReportSignIn;

  /// No description provided for @chargingReportStatusInReview.
  ///
  /// In en, this message translates to:
  /// **'In review'**
  String get chargingReportStatusInReview;

  /// No description provided for @chargingReportStatusOpen.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get chargingReportStatusOpen;

  /// No description provided for @chargingReportStatusRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get chargingReportStatusRejected;

  /// No description provided for @chargingReportStatusResolved.
  ///
  /// In en, this message translates to:
  /// **'Resolved'**
  String get chargingReportStatusResolved;

  /// No description provided for @chargingReportTitle.
  ///
  /// In en, this message translates to:
  /// **'Report a problem'**
  String get chargingReportTitle;

  /// No description provided for @chargingReportWhat.
  ///
  /// In en, this message translates to:
  /// **'What is the problem?'**
  String get chargingReportWhat;

  /// No description provided for @chargingReportWhichConnector.
  ///
  /// In en, this message translates to:
  /// **'Which connector?'**
  String get chargingReportWhichConnector;

  /// No description provided for @chargingResultsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 station} other{{count} stations}}'**
  String chargingResultsCount(int count);

  /// No description provided for @chargingResultsTruncated.
  ///
  /// In en, this message translates to:
  /// **'{count} stations shown — zoom in to see all'**
  String chargingResultsTruncated(int count);

  /// No description provided for @chargingSavedCopy.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get chargingSavedCopy;

  /// No description provided for @chargingSearchHereAction.
  ///
  /// In en, this message translates to:
  /// **'Search here'**
  String get chargingSearchHereAction;

  /// No description provided for @chargingSearchHereMessage.
  ///
  /// In en, this message translates to:
  /// **'Stations will be listed around the point you picked, with distances from it.'**
  String get chargingSearchHereMessage;

  /// No description provided for @chargingSearchHereTitle.
  ///
  /// In en, this message translates to:
  /// **'Search around this point?'**
  String get chargingSearchHereTitle;

  /// No description provided for @chargingSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search stations, operators or cities'**
  String get chargingSearchHint;

  /// No description provided for @chargingSearchThisArea.
  ///
  /// In en, this message translates to:
  /// **'Search this area'**
  String get chargingSearchThisArea;

  /// No description provided for @chargingSearching.
  ///
  /// In en, this message translates to:
  /// **'Searching for stations…'**
  String get chargingSearching;

  /// No description provided for @chargingSend.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get chargingSend;

  /// No description provided for @chargingServicesSection.
  ///
  /// In en, this message translates to:
  /// **'Payment and services'**
  String get chargingServicesSection;

  /// No description provided for @chargingSignInAgain.
  ///
  /// In en, this message translates to:
  /// **'Your session ended. Sign in again to send this.'**
  String get chargingSignInAgain;

  /// No description provided for @chargingSourceCsv.
  ///
  /// In en, this message translates to:
  /// **'Imported file'**
  String get chargingSourceCsv;

  /// No description provided for @chargingSourceManual.
  ///
  /// In en, this message translates to:
  /// **'Added by the editorial team'**
  String get chargingSourceManual;

  /// No description provided for @chargingSourceOcm.
  ///
  /// In en, this message translates to:
  /// **'Open Charge Map'**
  String get chargingSourceOcm;

  /// No description provided for @chargingSourcePartner.
  ///
  /// In en, this message translates to:
  /// **'Partner data'**
  String get chargingSourcePartner;

  /// No description provided for @chargingSourceSection.
  ///
  /// In en, this message translates to:
  /// **'Data source and licence'**
  String get chargingSourceSection;

  /// No description provided for @chargingSourceUpdated.
  ///
  /// In en, this message translates to:
  /// **'Updated at source'**
  String get chargingSourceUpdated;

  /// No description provided for @chargingSourceUserSuggestion.
  ///
  /// In en, this message translates to:
  /// **'Suggested by a user, reviewed'**
  String get chargingSourceUserSuggestion;

  /// No description provided for @chargingStartMethods.
  ///
  /// In en, this message translates to:
  /// **'How to start charging'**
  String get chargingStartMethods;

  /// No description provided for @chargingStationTimezone.
  ///
  /// In en, this message translates to:
  /// **'Station time zone: {zone}'**
  String chargingStationTimezone(String zone);

  /// No description provided for @chargingStationTitle.
  ///
  /// In en, this message translates to:
  /// **'Station details'**
  String get chargingStationTitle;

  /// No description provided for @chargingStatusLive.
  ///
  /// In en, this message translates to:
  /// **'Live availability'**
  String get chargingStatusLive;

  /// No description provided for @chargingStatusOpenNow.
  ///
  /// In en, this message translates to:
  /// **'Opening hours now'**
  String get chargingStatusOpenNow;

  /// No description provided for @chargingStatusOperational.
  ///
  /// In en, this message translates to:
  /// **'Operation'**
  String get chargingStatusOperational;

  /// No description provided for @chargingStatusSection.
  ///
  /// In en, this message translates to:
  /// **'Status now'**
  String get chargingStatusSection;

  /// No description provided for @chargingStepSize.
  ///
  /// In en, this message translates to:
  /// **'billed in steps of {step}'**
  String chargingStepSize(String step);

  /// No description provided for @chargingSuccessRate.
  ///
  /// In en, this message translates to:
  /// **'Charged successfully'**
  String get chargingSuccessRate;

  /// No description provided for @chargingSuccessRateNeedsMore.
  ///
  /// In en, this message translates to:
  /// **'A success rate is shown after at least 3 check-ins.'**
  String get chargingSuccessRateNeedsMore;

  /// No description provided for @chargingSuggestAddConnector.
  ///
  /// In en, this message translates to:
  /// **'Add a connector'**
  String get chargingSuggestAddConnector;

  /// No description provided for @chargingSuggestAddress.
  ///
  /// In en, this message translates to:
  /// **'Address or landmark'**
  String get chargingSuggestAddress;

  /// No description provided for @chargingSuggestCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get chargingSuggestCity;

  /// No description provided for @chargingSuggestConnectorN.
  ///
  /// In en, this message translates to:
  /// **'Connector {number}'**
  String chargingSuggestConnectorN(int number);

  /// No description provided for @chargingSuggestConnectorTypeRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a type or remove this connector.'**
  String get chargingSuggestConnectorTypeRequired;

  /// No description provided for @chargingSuggestConnectors.
  ///
  /// In en, this message translates to:
  /// **'Connectors'**
  String get chargingSuggestConnectors;

  /// No description provided for @chargingSuggestCoordInvalid.
  ///
  /// In en, this message translates to:
  /// **'Out of range'**
  String get chargingSuggestCoordInvalid;

  /// No description provided for @chargingSuggestCoordRequired.
  ///
  /// In en, this message translates to:
  /// **'Required'**
  String get chargingSuggestCoordRequired;

  /// No description provided for @chargingSuggestCountry.
  ///
  /// In en, this message translates to:
  /// **'Country'**
  String get chargingSuggestCountry;

  /// No description provided for @chargingSuggestHours.
  ///
  /// In en, this message translates to:
  /// **'Opening hours'**
  String get chargingSuggestHours;

  /// No description provided for @chargingSuggestHoursHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. every day 08:00–22:00'**
  String get chargingSuggestHoursHint;

  /// No description provided for @chargingSuggestIntro.
  ///
  /// In en, this message translates to:
  /// **'Know a station that is missing? Add what you know — a moderator checks it before it appears on the map.'**
  String get chargingSuggestIntro;

  /// No description provided for @chargingSuggestLocation.
  ///
  /// In en, this message translates to:
  /// **'Location of the station'**
  String get chargingSuggestLocation;

  /// No description provided for @chargingSuggestLocationHelp.
  ///
  /// In en, this message translates to:
  /// **'Use your location while you are at the station, pick it on the map, or type coordinates.'**
  String get chargingSuggestLocationHelp;

  /// No description provided for @chargingSuggestMayExist.
  ///
  /// In en, this message translates to:
  /// **'These nearby stations may be the same one:'**
  String get chargingSuggestMayExist;

  /// No description provided for @chargingSuggestName.
  ///
  /// In en, this message translates to:
  /// **'Station name'**
  String get chargingSuggestName;

  /// No description provided for @chargingSuggestNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter the station name.'**
  String get chargingSuggestNameRequired;

  /// No description provided for @chargingSuggestNotes.
  ///
  /// In en, this message translates to:
  /// **'Notes for the reviewer'**
  String get chargingSuggestNotes;

  /// No description provided for @chargingSuggestOperator.
  ///
  /// In en, this message translates to:
  /// **'Operator'**
  String get chargingSuggestOperator;

  /// No description provided for @chargingSuggestPickTitle.
  ///
  /// In en, this message translates to:
  /// **'Pick on the map'**
  String get chargingSuggestPickTitle;

  /// No description provided for @chargingSuggestQuantity.
  ///
  /// In en, this message translates to:
  /// **'How many'**
  String get chargingSuggestQuantity;

  /// No description provided for @chargingSuggestReviewNote.
  ///
  /// In en, this message translates to:
  /// **'Nothing is published until a moderator reviews it.'**
  String get chargingSuggestReviewNote;

  /// No description provided for @chargingSuggestSentMessage.
  ///
  /// In en, this message translates to:
  /// **'Thanks! A moderator will review it before it appears on the map.'**
  String get chargingSuggestSentMessage;

  /// No description provided for @chargingSuggestSentTitle.
  ///
  /// In en, this message translates to:
  /// **'Suggestion sent'**
  String get chargingSuggestSentTitle;

  /// No description provided for @chargingSuggestSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in to suggest a station. Suggestions are reviewed before they appear.'**
  String get chargingSuggestSignIn;

  /// No description provided for @chargingSuggestTitle.
  ///
  /// In en, this message translates to:
  /// **'Suggest a station'**
  String get chargingSuggestTitle;

  /// No description provided for @chargingSuggestUseMyLocation.
  ///
  /// In en, this message translates to:
  /// **'I\'m at the station'**
  String get chargingSuggestUseMyLocation;

  /// No description provided for @chargingSuggestUsePoint.
  ///
  /// In en, this message translates to:
  /// **'Use this point'**
  String get chargingSuggestUsePoint;

  /// No description provided for @chargingTariffAppliesTo.
  ///
  /// In en, this message translates to:
  /// **'Applies to: {connector}'**
  String chargingTariffAppliesTo(String connector);

  /// No description provided for @chargingTariffNotCurrent.
  ///
  /// In en, this message translates to:
  /// **'Not current'**
  String get chargingTariffNotCurrent;

  /// No description provided for @chargingTariffUnnamed.
  ///
  /// In en, this message translates to:
  /// **'Tariff'**
  String get chargingTariffUnnamed;

  /// No description provided for @chargingTaxExcluded.
  ///
  /// In en, this message translates to:
  /// **'Taxes not included'**
  String get chargingTaxExcluded;

  /// No description provided for @chargingTaxExcludedPct.
  ///
  /// In en, this message translates to:
  /// **'Taxes not included ({percent}%)'**
  String chargingTaxExcludedPct(String percent);

  /// No description provided for @chargingTaxIncluded.
  ///
  /// In en, this message translates to:
  /// **'Taxes included'**
  String get chargingTaxIncluded;

  /// No description provided for @chargingTaxIncludedPct.
  ///
  /// In en, this message translates to:
  /// **'Taxes included ({percent}%)'**
  String chargingTaxIncludedPct(String percent);

  /// No description provided for @chargingTaxUnknown.
  ///
  /// In en, this message translates to:
  /// **'Taxes: not stated'**
  String get chargingTaxUnknown;

  /// No description provided for @chargingTitle.
  ///
  /// In en, this message translates to:
  /// **'Charging stations'**
  String get chargingTitle;

  /// No description provided for @chargingToday.
  ///
  /// In en, this message translates to:
  /// **'today'**
  String get chargingToday;

  /// No description provided for @chargingTruncatedHint.
  ///
  /// In en, this message translates to:
  /// **'Many stations match here. Zoom in or add filters to see them all.'**
  String get chargingTruncatedHint;

  /// No description provided for @chargingUnassignedConnectors.
  ///
  /// In en, this message translates to:
  /// **'Connectors'**
  String get chargingUnassignedConnectors;

  /// No description provided for @chargingUnassignedConnectorsHelp.
  ///
  /// In en, this message translates to:
  /// **'The source does not say which charger each connector belongs to.'**
  String get chargingUnassignedConnectorsHelp;

  /// No description provided for @chargingUsageCostNote.
  ///
  /// In en, this message translates to:
  /// **'Shown as published; not verified or converted.'**
  String get chargingUsageCostNote;

  /// No description provided for @chargingUsageCostTitle.
  ///
  /// In en, this message translates to:
  /// **'Price as published by the source'**
  String get chargingUsageCostTitle;

  /// No description provided for @chargingUseMyLocation.
  ///
  /// In en, this message translates to:
  /// **'Use my location'**
  String get chargingUseMyLocation;

  /// No description provided for @chargingValidFrom.
  ///
  /// In en, this message translates to:
  /// **'From {date}'**
  String chargingValidFrom(String date);

  /// No description provided for @chargingValidTo.
  ///
  /// In en, this message translates to:
  /// **'until {date}'**
  String chargingValidTo(String date);

  /// No description provided for @chargingViewList.
  ///
  /// In en, this message translates to:
  /// **'List'**
  String get chargingViewList;

  /// No description provided for @chargingViewMap.
  ///
  /// In en, this message translates to:
  /// **'Map'**
  String get chargingViewMap;

  /// No description provided for @chargingWaited.
  ///
  /// In en, this message translates to:
  /// **'waited {time}'**
  String chargingWaited(String time);

  /// No description provided for @chargingWebsite.
  ///
  /// In en, this message translates to:
  /// **'Website'**
  String get chargingWebsite;

  /// No description provided for @chargingWholeStation.
  ///
  /// In en, this message translates to:
  /// **'The whole station'**
  String get chargingWholeStation;

  /// No description provided for @chargingWidenSearch.
  ///
  /// In en, this message translates to:
  /// **'Search within 100 km'**
  String get chargingWidenSearch;

  /// No description provided for @commonAdLabel.
  ///
  /// In en, this message translates to:
  /// **'Ad'**
  String get commonAdLabel;

  /// No description provided for @commonApply.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get commonApply;

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

  /// No description provided for @commonClearSearch.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get commonClearSearch;

  /// No description provided for @commonClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get commonClose;

  /// No description provided for @commonCompareAdd.
  ///
  /// In en, this message translates to:
  /// **'Add to compare'**
  String get commonCompareAdd;

  /// No description provided for @commonCompareAddedSnack.
  ///
  /// In en, this message translates to:
  /// **'Added to comparison'**
  String get commonCompareAddedSnack;

  /// No description provided for @commonCompareClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get commonCompareClear;

  /// No description provided for @commonCompareFull.
  ///
  /// In en, this message translates to:
  /// **'You can compare up to {max} cars. Remove one first.'**
  String commonCompareFull(int max);

  /// No description provided for @commonCompareInTray.
  ///
  /// In en, this message translates to:
  /// **'In comparison'**
  String get commonCompareInTray;

  /// No description provided for @commonCompareNeedTwo.
  ///
  /// In en, this message translates to:
  /// **'Choose at least two cars to compare.'**
  String get commonCompareNeedTwo;

  /// No description provided for @commonCompareNow.
  ///
  /// In en, this message translates to:
  /// **'Compare'**
  String get commonCompareNow;

  /// No description provided for @commonCompareRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove from comparison'**
  String get commonCompareRemove;

  /// No description provided for @commonCompareTrayCount.
  ///
  /// In en, this message translates to:
  /// **'{count} of {max} selected'**
  String commonCompareTrayCount(int count, int max);

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

  /// Explains the demo badge (isDemo=true records).
  ///
  /// In en, this message translates to:
  /// **'Sample data for testing — not real information.'**
  String get commonDemoDescription;

  /// Label for isDemo=true records.
  ///
  /// In en, this message translates to:
  /// **'Demo data'**
  String get commonDemoLabel;

  /// No description provided for @commonDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get commonDone;

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

  /// No description provided for @commonFavoriteAdd.
  ///
  /// In en, this message translates to:
  /// **'Add to favorites'**
  String get commonFavoriteAdd;

  /// No description provided for @commonFavoriteAdded.
  ///
  /// In en, this message translates to:
  /// **'Added to favorites'**
  String get commonFavoriteAdded;

  /// No description provided for @commonFavoriteFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t update favorites. Please try again.'**
  String get commonFavoriteFailed;

  /// No description provided for @commonFavoriteLocalOnly.
  ///
  /// In en, this message translates to:
  /// **'Saved on this device. Sign in to sync across devices.'**
  String get commonFavoriteLocalOnly;

  /// No description provided for @commonFavoriteRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove from favorites'**
  String get commonFavoriteRemove;

  /// No description provided for @commonFavoriteRemoved.
  ///
  /// In en, this message translates to:
  /// **'Removed from favorites'**
  String get commonFavoriteRemoved;

  /// No description provided for @commonFilters.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get commonFilters;

  /// No description provided for @commonFiltersActive.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 filter on} other{{count} filters on}}'**
  String commonFiltersActive(int count);

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

  /// No description provided for @commonImageCredit.
  ///
  /// In en, this message translates to:
  /// **'Image: {credit}'**
  String commonImageCredit(String credit);

  /// No description provided for @commonImageUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Image not available'**
  String get commonImageUnavailable;

  /// No description provided for @commonJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get commonJustNow;

  /// No description provided for @commonLastUpdated.
  ///
  /// In en, this message translates to:
  /// **'Last updated {time}'**
  String commonLastUpdated(String time);

  /// No description provided for @commonLastUpdatedUnknown.
  ///
  /// In en, this message translates to:
  /// **'Last update: not available'**
  String get commonLastUpdatedUnknown;

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

  /// No description provided for @commonMayBeOutdated.
  ///
  /// In en, this message translates to:
  /// **'May be out of date'**
  String get commonMayBeOutdated;

  /// No description provided for @commonMeasuredBy.
  ///
  /// In en, this message translates to:
  /// **'Measured: {cycle}'**
  String commonMeasuredBy(String cycle);

  /// No description provided for @commonMinutesAgo.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 minute ago} other{{count} minutes ago}}'**
  String commonMinutesAgo(int count);

  /// No description provided for @commonMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get commonMore;

  /// No description provided for @commonMoreInfo.
  ///
  /// In en, this message translates to:
  /// **'More information'**
  String get commonMoreInfo;

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

  /// No description provided for @commonNotSupportedOnPlatformMessage.
  ///
  /// In en, this message translates to:
  /// **'This feature works in the Android and iOS apps.'**
  String get commonNotSupportedOnPlatformMessage;

  /// No description provided for @commonNotSupportedOnPlatformTitle.
  ///
  /// In en, this message translates to:
  /// **'Not available in the web preview'**
  String get commonNotSupportedOnPlatformTitle;

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

  /// No description provided for @commonPermissionLocationMessage.
  ///
  /// In en, this message translates to:
  /// **'Your location is used only while the app is open, to show nearby stations. Allow it in the device settings or choose a place manually.'**
  String get commonPermissionLocationMessage;

  /// No description provided for @commonPermissionLocationTitle.
  ///
  /// In en, this message translates to:
  /// **'Location not allowed'**
  String get commonPermissionLocationTitle;

  /// No description provided for @commonPermissionMotionMessage.
  ///
  /// In en, this message translates to:
  /// **'Motion control is optional. You can still look around by dragging.'**
  String get commonPermissionMotionMessage;

  /// No description provided for @commonPermissionMotionTitle.
  ///
  /// In en, this message translates to:
  /// **'Motion sensors not allowed'**
  String get commonPermissionMotionTitle;

  /// No description provided for @commonPermissionNotificationsMessage.
  ///
  /// In en, this message translates to:
  /// **'Reminders need notification permission. You can allow it in the device settings.'**
  String get commonPermissionNotificationsMessage;

  /// No description provided for @commonPermissionNotificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications not allowed'**
  String get commonPermissionNotificationsTitle;

  /// No description provided for @commonPowertrainBev.
  ///
  /// In en, this message translates to:
  /// **'Electric'**
  String get commonPowertrainBev;

  /// No description provided for @commonPowertrainErev.
  ///
  /// In en, this message translates to:
  /// **'Range extender'**
  String get commonPowertrainErev;

  /// No description provided for @commonPowertrainHev.
  ///
  /// In en, this message translates to:
  /// **'Hybrid'**
  String get commonPowertrainHev;

  /// No description provided for @commonPowertrainPhev.
  ///
  /// In en, this message translates to:
  /// **'Plug-in hybrid'**
  String get commonPowertrainPhev;

  /// No description provided for @commonPriceAsOf.
  ///
  /// In en, this message translates to:
  /// **'as of {date}'**
  String commonPriceAsOf(String date);

  /// Mandatory label for prices converted from another currency (never an official local price).
  ///
  /// In en, this message translates to:
  /// **'Estimate after conversion'**
  String get commonPriceConverted;

  /// No description provided for @commonPriceDealer.
  ///
  /// In en, this message translates to:
  /// **'Dealer price'**
  String get commonPriceDealer;

  /// No description provided for @commonPriceMarketEstimate.
  ///
  /// In en, this message translates to:
  /// **'Market estimate'**
  String get commonPriceMarketEstimate;

  /// No description provided for @commonPriceNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'Price not available'**
  String get commonPriceNotAvailable;

  /// No description provided for @commonPriceOfficialMsrp.
  ///
  /// In en, this message translates to:
  /// **'Official price'**
  String get commonPriceOfficialMsrp;

  /// No description provided for @commonRangeCycleOther.
  ///
  /// In en, this message translates to:
  /// **'Other cycle'**
  String get commonRangeCycleOther;

  /// No description provided for @commonRangeElectric.
  ///
  /// In en, this message translates to:
  /// **'Electric range'**
  String get commonRangeElectric;

  /// No description provided for @commonRangeTotal.
  ///
  /// In en, this message translates to:
  /// **'Total range'**
  String get commonRangeTotal;

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

  /// No description provided for @commonReset.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get commonReset;

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

  /// No description provided for @commonSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get commonSearchHint;

  /// No description provided for @commonSeeAll.
  ///
  /// In en, this message translates to:
  /// **'See all'**
  String get commonSeeAll;

  /// No description provided for @commonSeeAllSection.
  ///
  /// In en, this message translates to:
  /// **'See all: {section}'**
  String commonSeeAllSection(String section);

  /// No description provided for @commonSelected.
  ///
  /// In en, this message translates to:
  /// **'Selected'**
  String get commonSelected;

  /// No description provided for @commonServerErrorMessage.
  ///
  /// In en, this message translates to:
  /// **'The server is currently unavailable. Please try again later.'**
  String get commonServerErrorMessage;

  /// No description provided for @commonShare.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get commonShare;

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

  /// No description provided for @commonSortBy.
  ///
  /// In en, this message translates to:
  /// **'Sort by'**
  String get commonSortBy;

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

  /// No description provided for @commonSponsoredBy.
  ///
  /// In en, this message translates to:
  /// **'Sponsored by {name}'**
  String commonSponsoredBy(String name);

  /// No description provided for @commonSponsoredDescription.
  ///
  /// In en, this message translates to:
  /// **'Paid placement. It never changes comparison results or rankings.'**
  String get commonSponsoredDescription;

  /// No description provided for @commonSponsoredLabel.
  ///
  /// In en, this message translates to:
  /// **'Sponsored'**
  String get commonSponsoredLabel;

  /// No description provided for @commonTimeoutMessage.
  ///
  /// In en, this message translates to:
  /// **'The server took too long to respond. Please try again.'**
  String get commonTimeoutMessage;

  /// No description provided for @commonTour360.
  ///
  /// In en, this message translates to:
  /// **'360° tour'**
  String get commonTour360;

  /// No description provided for @commonTour360Available.
  ///
  /// In en, this message translates to:
  /// **'Interior 360° tour available'**
  String get commonTour360Available;

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

  /// No description provided for @commonUnknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get commonUnknown;

  /// No description provided for @commonVerifiedOn.
  ///
  /// In en, this message translates to:
  /// **'Verified on {date}'**
  String commonVerifiedOn(String date);

  /// No description provided for @commonWebPreviewBanner.
  ///
  /// In en, this message translates to:
  /// **'Web preview'**
  String get commonWebPreviewBanner;

  /// No description provided for @communityAboutCar.
  ///
  /// In en, this message translates to:
  /// **'About: {car}'**
  String communityAboutCar(String car);

  /// No description provided for @communityAccept.
  ///
  /// In en, this message translates to:
  /// **'Accept answer'**
  String get communityAccept;

  /// No description provided for @communityAcceptCleared.
  ///
  /// In en, this message translates to:
  /// **'Acceptance removed'**
  String get communityAcceptCleared;

  /// No description provided for @communityAccepted.
  ///
  /// In en, this message translates to:
  /// **'Answer accepted'**
  String get communityAccepted;

  /// No description provided for @communityAcceptedAnswer.
  ///
  /// In en, this message translates to:
  /// **'Accepted answer'**
  String get communityAcceptedAnswer;

  /// No description provided for @communityAllReviews.
  ///
  /// In en, this message translates to:
  /// **'All reviews'**
  String get communityAllReviews;

  /// No description provided for @communityAnonymous.
  ///
  /// In en, this message translates to:
  /// **'User'**
  String get communityAnonymous;

  /// No description provided for @communityAnswerCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No answers} =1{1 answer} other{{count} answers}}'**
  String communityAnswerCount(int count);

  /// No description provided for @communityAnswerHint.
  ///
  /// In en, this message translates to:
  /// **'Write your answer…'**
  String get communityAnswerHint;

  /// No description provided for @communityAnswerPosted.
  ///
  /// In en, this message translates to:
  /// **'Your answer is posted'**
  String get communityAnswerPosted;

  /// No description provided for @communityAnswered.
  ///
  /// In en, this message translates to:
  /// **'Answered'**
  String get communityAnswered;

  /// No description provided for @communityAnswersTitle.
  ///
  /// In en, this message translates to:
  /// **'Answers'**
  String get communityAnswersTitle;

  /// No description provided for @communityAnswersWithCount.
  ///
  /// In en, this message translates to:
  /// **'Answers ({count})'**
  String communityAnswersWithCount(String count);

  /// No description provided for @communityAskGeneral.
  ///
  /// In en, this message translates to:
  /// **'General question'**
  String get communityAskGeneral;

  /// No description provided for @communityAskTips.
  ///
  /// In en, this message translates to:
  /// **'Write a clear, specific question (at least 10 characters) and mention the market and trim if they matter. No links or personal data.'**
  String get communityAskTips;

  /// No description provided for @communityAskTitle.
  ///
  /// In en, this message translates to:
  /// **'Ask a question'**
  String get communityAskTitle;

  /// No description provided for @communityAskedBy.
  ///
  /// In en, this message translates to:
  /// **'Asked by {name}'**
  String communityAskedBy(String name);

  /// No description provided for @communityBeFirstToReview.
  ///
  /// In en, this message translates to:
  /// **'Be the first to review'**
  String get communityBeFirstToReview;

  /// No description provided for @communityBlockConfirm.
  ///
  /// In en, this message translates to:
  /// **'Block'**
  String get communityBlockConfirm;

  /// No description provided for @communityBlockMessage.
  ///
  /// In en, this message translates to:
  /// **'You won\'t see their reviews, comments, questions or answers any more. They won\'t be told, and you can unblock at any time.'**
  String get communityBlockMessage;

  /// No description provided for @communityBlockTitle.
  ///
  /// In en, this message translates to:
  /// **'Block {name}?'**
  String communityBlockTitle(String name);

  /// No description provided for @communityBlockUser.
  ///
  /// In en, this message translates to:
  /// **'Block this user'**
  String get communityBlockUser;

  /// No description provided for @communityBlocked.
  ///
  /// In en, this message translates to:
  /// **'{name} blocked'**
  String communityBlocked(String name);

  /// No description provided for @communityBlockedIndefinite.
  ///
  /// In en, this message translates to:
  /// **'A moderator paused posting from your account until further notice. You can still read.'**
  String get communityBlockedIndefinite;

  /// No description provided for @communityBlockedReason.
  ///
  /// In en, this message translates to:
  /// **'Reason: {reason}'**
  String communityBlockedReason(String reason);

  /// No description provided for @communityBlockedTitle.
  ///
  /// In en, this message translates to:
  /// **'Posting is paused for your account'**
  String get communityBlockedTitle;

  /// No description provided for @communityBlockedUntil.
  ///
  /// In en, this message translates to:
  /// **'A moderator paused posting from your account until {until}. You can still read.'**
  String communityBlockedUntil(String until);

  /// No description provided for @communityBlockedUsersIntro.
  ///
  /// In en, this message translates to:
  /// **'You don\'t see these users\' community posts.'**
  String get communityBlockedUsersIntro;

  /// No description provided for @communityBlockedUsersTitle.
  ///
  /// In en, this message translates to:
  /// **'Blocked users'**
  String get communityBlockedUsersTitle;

  /// No description provided for @communityCancelReply.
  ///
  /// In en, this message translates to:
  /// **'Cancel reply'**
  String get communityCancelReply;

  /// No description provided for @communityCarReviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'Owner reviews'**
  String get communityCarReviewsTitle;

  /// No description provided for @communityChooseTrim.
  ///
  /// In en, this message translates to:
  /// **'Choose a trim'**
  String get communityChooseTrim;

  /// No description provided for @communityClearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get communityClearFilters;

  /// No description provided for @communityClearRating.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get communityClearRating;

  /// No description provided for @communityCommentHint.
  ///
  /// In en, this message translates to:
  /// **'Write a comment…'**
  String get communityCommentHint;

  /// No description provided for @communityCommentPosted.
  ///
  /// In en, this message translates to:
  /// **'Your comment is posted'**
  String get communityCommentPosted;

  /// No description provided for @communityCommentsClosed.
  ///
  /// In en, this message translates to:
  /// **'Comments are closed here.'**
  String get communityCommentsClosed;

  /// No description provided for @communityCommentsTitle.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get communityCommentsTitle;

  /// No description provided for @communityCommentsWithCount.
  ///
  /// In en, this message translates to:
  /// **'Comments ({count})'**
  String communityCommentsWithCount(String count);

  /// No description provided for @communityCons.
  ///
  /// In en, this message translates to:
  /// **'Cons'**
  String get communityCons;

  /// No description provided for @communityConsHint.
  ///
  /// In en, this message translates to:
  /// **'What didn\'t you like?'**
  String get communityConsHint;

  /// No description provided for @communityCreateAccount.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get communityCreateAccount;

  /// No description provided for @communityDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get communityDelete;

  /// No description provided for @communityDeleteAnswerTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete answer?'**
  String get communityDeleteAnswerTitle;

  /// No description provided for @communityDeleteCommentTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete comment?'**
  String get communityDeleteCommentTitle;

  /// No description provided for @communityDeleteMessage.
  ///
  /// In en, this message translates to:
  /// **'This can\'t be undone.'**
  String get communityDeleteMessage;

  /// No description provided for @communityDeleteQuestionTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete question?'**
  String get communityDeleteQuestionTitle;

  /// No description provided for @communityDeleteReview.
  ///
  /// In en, this message translates to:
  /// **'Delete review'**
  String get communityDeleteReview;

  /// No description provided for @communityDeleteReviewTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete your review?'**
  String get communityDeleteReviewTitle;

  /// No description provided for @communityDeleted.
  ///
  /// In en, this message translates to:
  /// **'Deleted'**
  String get communityDeleted;

  /// No description provided for @communityDeletedUser.
  ///
  /// In en, this message translates to:
  /// **'Deleted user'**
  String get communityDeletedUser;

  /// No description provided for @communityDemoTargetNotice.
  ///
  /// In en, this message translates to:
  /// **'This is demo data for testing, not a real car or article.'**
  String get communityDemoTargetNotice;

  /// No description provided for @communityDimAfterSales.
  ///
  /// In en, this message translates to:
  /// **'After-sales service'**
  String get communityDimAfterSales;

  /// No description provided for @communityDimBuildQuality.
  ///
  /// In en, this message translates to:
  /// **'Build quality'**
  String get communityDimBuildQuality;

  /// No description provided for @communityDimCharging.
  ///
  /// In en, this message translates to:
  /// **'Charging'**
  String get communityDimCharging;

  /// No description provided for @communityDimComfort.
  ///
  /// In en, this message translates to:
  /// **'Comfort'**
  String get communityDimComfort;

  /// No description provided for @communityDimRange.
  ///
  /// In en, this message translates to:
  /// **'Real-world range'**
  String get communityDimRange;

  /// No description provided for @communityDimReliability.
  ///
  /// In en, this message translates to:
  /// **'Reliability'**
  String get communityDimReliability;

  /// No description provided for @communityDimTechnology.
  ///
  /// In en, this message translates to:
  /// **'Technology'**
  String get communityDimTechnology;

  /// No description provided for @communityDimValue.
  ///
  /// In en, this message translates to:
  /// **'Value for money'**
  String get communityDimValue;

  /// No description provided for @communityDimensionScore.
  ///
  /// In en, this message translates to:
  /// **'{dimension}: {score} out of 5'**
  String communityDimensionScore(String dimension, int score);

  /// No description provided for @communityDimensionValue.
  ///
  /// In en, this message translates to:
  /// **'{value} out of 5, {count} ratings'**
  String communityDimensionValue(String value, int count);

  /// No description provided for @communityDimensionsHint.
  ///
  /// In en, this message translates to:
  /// **'Optional: rate specific aspects'**
  String get communityDimensionsHint;

  /// No description provided for @communityDimensionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Ratings by aspect'**
  String get communityDimensionsTitle;

  /// No description provided for @communityDistributionRow.
  ///
  /// In en, this message translates to:
  /// **'{stars} stars: {count}'**
  String communityDistributionRow(int stars, int count);

  /// No description provided for @communityDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get communityDone;

  /// No description provided for @communityEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get communityEdit;

  /// No description provided for @communityEditAnswer.
  ///
  /// In en, this message translates to:
  /// **'Edit answer'**
  String get communityEditAnswer;

  /// No description provided for @communityEditComment.
  ///
  /// In en, this message translates to:
  /// **'Edit comment'**
  String get communityEditComment;

  /// No description provided for @communityEditMyReview.
  ///
  /// In en, this message translates to:
  /// **'Edit my review'**
  String get communityEditMyReview;

  /// No description provided for @communityEditQuestion.
  ///
  /// In en, this message translates to:
  /// **'Edit question'**
  String get communityEditQuestion;

  /// No description provided for @communityEditRemoderated.
  ///
  /// In en, this message translates to:
  /// **'After editing, your review goes back to review before it appears again.'**
  String get communityEditRemoderated;

  /// No description provided for @communityEditReviewTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit your review'**
  String get communityEditReviewTitle;

  /// No description provided for @communityEdited.
  ///
  /// In en, this message translates to:
  /// **'edited'**
  String get communityEdited;

  /// No description provided for @communityErrEmailNotVerified.
  ///
  /// In en, this message translates to:
  /// **'Verify your e-mail before posting.'**
  String get communityErrEmailNotVerified;

  /// No description provided for @communityErrRateLimited.
  ///
  /// In en, this message translates to:
  /// **'You\'ve posted a lot in a short time. Please try again later.'**
  String get communityErrRateLimited;

  /// No description provided for @communityErrRateLimitedMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes, plural, =1{You\'ve posted a lot in a short time. Try again in a minute.} other{You\'ve posted a lot in a short time. Try again in {minutes} minutes.}}'**
  String communityErrRateLimitedMinutes(int minutes);

  /// No description provided for @communityErrReportDuplicate.
  ///
  /// In en, this message translates to:
  /// **'You already reported this; your report is being reviewed.'**
  String get communityErrReportDuplicate;

  /// No description provided for @communityErrSelfReport.
  ///
  /// In en, this message translates to:
  /// **'You can\'t report your own post.'**
  String get communityErrSelfReport;

  /// No description provided for @communityErrSelfVote.
  ///
  /// In en, this message translates to:
  /// **'You can\'t vote on your own post.'**
  String get communityErrSelfVote;

  /// No description provided for @communityErrSignInAgain.
  ///
  /// In en, this message translates to:
  /// **'Your session ended. Please sign in again.'**
  String get communityErrSignInAgain;

  /// No description provided for @communityFieldRequired.
  ///
  /// In en, this message translates to:
  /// **'This field is required.'**
  String get communityFieldRequired;

  /// No description provided for @communityFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get communityFilterAll;

  /// No description provided for @communityFilterAnswered.
  ///
  /// In en, this message translates to:
  /// **'Answered'**
  String get communityFilterAnswered;

  /// No description provided for @communityFilterUnanswered.
  ///
  /// In en, this message translates to:
  /// **'Unanswered'**
  String get communityFilterUnanswered;

  /// No description provided for @communityFormHasErrors.
  ///
  /// In en, this message translates to:
  /// **'Please fix the highlighted fields.'**
  String get communityFormHasErrors;

  /// No description provided for @communityGeneralQuestion.
  ///
  /// In en, this message translates to:
  /// **'General question'**
  String get communityGeneralQuestion;

  /// No description provided for @communityHelpful.
  ///
  /// In en, this message translates to:
  /// **'Helpful'**
  String get communityHelpful;

  /// No description provided for @communityHelpfulCount.
  ///
  /// In en, this message translates to:
  /// **'Helpful ({count})'**
  String communityHelpfulCount(String count);

  /// No description provided for @communityJoinTitle.
  ///
  /// In en, this message translates to:
  /// **'Join the conversation'**
  String get communityJoinTitle;

  /// No description provided for @communityLoadMore.
  ///
  /// In en, this message translates to:
  /// **'Load more'**
  String get communityLoadMore;

  /// No description provided for @communityLoadMoreAnswers.
  ///
  /// In en, this message translates to:
  /// **'More answers'**
  String get communityLoadMoreAnswers;

  /// No description provided for @communityLoadMoreComments.
  ///
  /// In en, this message translates to:
  /// **'More comments'**
  String get communityLoadMoreComments;

  /// No description provided for @communityLoadMoreQuestions.
  ///
  /// In en, this message translates to:
  /// **'More questions'**
  String get communityLoadMoreQuestions;

  /// No description provided for @communityLoadMoreReviews.
  ///
  /// In en, this message translates to:
  /// **'More reviews'**
  String get communityLoadMoreReviews;

  /// No description provided for @communityMonthsUnit.
  ///
  /// In en, this message translates to:
  /// **'months'**
  String get communityMonthsUnit;

  /// No description provided for @communityMoreActions.
  ///
  /// In en, this message translates to:
  /// **'More actions'**
  String get communityMoreActions;

  /// No description provided for @communityNewAccountNote.
  ///
  /// In en, this message translates to:
  /// **'Your account is new: your posts are reviewed before they appear, and links aren\'t allowed for the first few days.'**
  String get communityNewAccountNote;

  /// No description provided for @communityNoAnswersMessage.
  ///
  /// In en, this message translates to:
  /// **'Know the answer? Share what you\'ve experienced.'**
  String get communityNoAnswersMessage;

  /// No description provided for @communityNoAnswersMineMessage.
  ///
  /// In en, this message translates to:
  /// **'Answers will appear here when they arrive.'**
  String get communityNoAnswersMineMessage;

  /// No description provided for @communityNoAnswersTitle.
  ///
  /// In en, this message translates to:
  /// **'No answers yet'**
  String get communityNoAnswersTitle;

  /// No description provided for @communityNoAnswersYet.
  ///
  /// In en, this message translates to:
  /// **'No answers yet'**
  String get communityNoAnswersYet;

  /// No description provided for @communityNoBlockedMessage.
  ///
  /// In en, this message translates to:
  /// **'You can block anyone from the actions menu next to their post.'**
  String get communityNoBlockedMessage;

  /// No description provided for @communityNoBlockedTitle.
  ///
  /// In en, this message translates to:
  /// **'No blocked users'**
  String get communityNoBlockedTitle;

  /// No description provided for @communityNoCommentsMessage.
  ///
  /// In en, this message translates to:
  /// **'Start the conversation with the first comment.'**
  String get communityNoCommentsMessage;

  /// No description provided for @communityNoCommentsTitle.
  ///
  /// In en, this message translates to:
  /// **'No comments yet'**
  String get communityNoCommentsTitle;

  /// No description provided for @communityNoFilteredReviewsMessage.
  ///
  /// In en, this message translates to:
  /// **'Try removing some filters.'**
  String get communityNoFilteredReviewsMessage;

  /// No description provided for @communityNoFilteredReviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'No matching reviews'**
  String get communityNoFilteredReviewsTitle;

  /// No description provided for @communityNoMatchingQuestionsMessage.
  ///
  /// In en, this message translates to:
  /// **'Try other words or change the filter — or ask your question.'**
  String get communityNoMatchingQuestionsMessage;

  /// No description provided for @communityNoMatchingQuestionsTitle.
  ///
  /// In en, this message translates to:
  /// **'No matching questions'**
  String get communityNoMatchingQuestionsTitle;

  /// No description provided for @communityNoQuestionsMessage.
  ///
  /// In en, this message translates to:
  /// **'Ask owners and enthusiasts about charging, range and servicing.'**
  String get communityNoQuestionsMessage;

  /// No description provided for @communityNoQuestionsTitle.
  ///
  /// In en, this message translates to:
  /// **'No questions yet'**
  String get communityNoQuestionsTitle;

  /// No description provided for @communityNoReviewsMessage.
  ///
  /// In en, this message translates to:
  /// **'No owner has published a review of this trim yet.'**
  String get communityNoReviewsMessage;

  /// No description provided for @communityNoReviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'No owner reviews yet'**
  String get communityNoReviewsTitle;

  /// No description provided for @communityNoTrimsMessage.
  ///
  /// In en, this message translates to:
  /// **'This car has no trims listed in your current market, so reviews can\'t be shown or written here.'**
  String get communityNoTrimsMessage;

  /// No description provided for @communityNoTrimsTitle.
  ///
  /// In en, this message translates to:
  /// **'No trims listed'**
  String get communityNoTrimsTitle;

  /// No description provided for @communityNotAnsweredYet.
  ///
  /// In en, this message translates to:
  /// **'Awaiting an accepted answer'**
  String get communityNotAnsweredYet;

  /// No description provided for @communityNotHelpful.
  ///
  /// In en, this message translates to:
  /// **'Not helpful'**
  String get communityNotHelpful;

  /// No description provided for @communityOnArticle.
  ///
  /// In en, this message translates to:
  /// **'Comments on: {title}. Open the article'**
  String communityOnArticle(String title);

  /// No description provided for @communityOnArticleLabel.
  ///
  /// In en, this message translates to:
  /// **'Comments on'**
  String get communityOnArticleLabel;

  /// No description provided for @communityOptional.
  ///
  /// In en, this message translates to:
  /// **'optional'**
  String get communityOptional;

  /// No description provided for @communityOverallRating.
  ///
  /// In en, this message translates to:
  /// **'Overall rating'**
  String get communityOverallRating;

  /// No description provided for @communityOwnedMonths.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{Owned under a month} =1{Owned 1 month} other{Owned {count} months}}'**
  String communityOwnedMonths(int count);

  /// No description provided for @communityOwnedYears.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Owned 1 year} other{Owned {count} years}}'**
  String communityOwnedYears(int count);

  /// No description provided for @communityOwnedYearsMonths.
  ///
  /// In en, this message translates to:
  /// **'Owned {years} yr {months} mo'**
  String communityOwnedYearsMonths(int years, int months);

  /// No description provided for @communityOwnershipHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. 8'**
  String get communityOwnershipHint;

  /// No description provided for @communityOwnershipInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a number of months from 0 to 600.'**
  String get communityOwnershipInvalid;

  /// No description provided for @communityOwnershipLabel.
  ///
  /// In en, this message translates to:
  /// **'How long you\'ve owned it'**
  String get communityOwnershipLabel;

  /// No description provided for @communityPostAnswer.
  ///
  /// In en, this message translates to:
  /// **'Post answer'**
  String get communityPostAnswer;

  /// No description provided for @communityPostQuestion.
  ///
  /// In en, this message translates to:
  /// **'Post question'**
  String get communityPostQuestion;

  /// No description provided for @communityPostedPending.
  ///
  /// In en, this message translates to:
  /// **'Sent — it will appear to others after review.'**
  String get communityPostedPending;

  /// No description provided for @communityPros.
  ///
  /// In en, this message translates to:
  /// **'Pros'**
  String get communityPros;

  /// No description provided for @communityProsHint.
  ///
  /// In en, this message translates to:
  /// **'What did you like?'**
  String get communityProsHint;

  /// No description provided for @communityQuestionBodyHint.
  ///
  /// In en, this message translates to:
  /// **'Add anything that helps answer it: usage, charger type…'**
  String get communityQuestionBodyHint;

  /// No description provided for @communityQuestionBodyLabel.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get communityQuestionBodyLabel;

  /// No description provided for @communityQuestionPosted.
  ///
  /// In en, this message translates to:
  /// **'Your question is posted'**
  String get communityQuestionPosted;

  /// No description provided for @communityQuestionTitle.
  ///
  /// In en, this message translates to:
  /// **'Question'**
  String get communityQuestionTitle;

  /// No description provided for @communityQuestionTitleHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. How long does home charging take from 20 to 80%?'**
  String get communityQuestionTitleHint;

  /// No description provided for @communityQuestionTitleLabel.
  ///
  /// In en, this message translates to:
  /// **'Your question'**
  String get communityQuestionTitleLabel;

  /// No description provided for @communityQuestionUnavailableMessage.
  ///
  /// In en, this message translates to:
  /// **'It may have been removed or is still being reviewed.'**
  String get communityQuestionUnavailableMessage;

  /// No description provided for @communityQuestionUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Question not available'**
  String get communityQuestionUnavailableTitle;

  /// No description provided for @communityQuestionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Questions & answers'**
  String get communityQuestionsTitle;

  /// No description provided for @communityRating1.
  ///
  /// In en, this message translates to:
  /// **'Poor'**
  String get communityRating1;

  /// No description provided for @communityRating2.
  ///
  /// In en, this message translates to:
  /// **'Fair'**
  String get communityRating2;

  /// No description provided for @communityRating3.
  ///
  /// In en, this message translates to:
  /// **'Good'**
  String get communityRating3;

  /// No description provided for @communityRating4.
  ///
  /// In en, this message translates to:
  /// **'Very good'**
  String get communityRating4;

  /// No description provided for @communityRating5.
  ///
  /// In en, this message translates to:
  /// **'Excellent'**
  String get communityRating5;

  /// No description provided for @communityRatingRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a rating from 1 to 5 stars.'**
  String get communityRatingRequired;

  /// No description provided for @communityReply.
  ///
  /// In en, this message translates to:
  /// **'Reply'**
  String get communityReply;

  /// No description provided for @communityReplyHint.
  ///
  /// In en, this message translates to:
  /// **'Write a reply…'**
  String get communityReplyHint;

  /// No description provided for @communityReplyPosted.
  ///
  /// In en, this message translates to:
  /// **'Your reply is posted'**
  String get communityReplyPosted;

  /// No description provided for @communityReplyingTo.
  ///
  /// In en, this message translates to:
  /// **'Replying to {name}'**
  String communityReplyingTo(String name);

  /// No description provided for @communityReport.
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get communityReport;

  /// No description provided for @communityReportDetails.
  ///
  /// In en, this message translates to:
  /// **'Details (required)'**
  String get communityReportDetails;

  /// No description provided for @communityReportDetailsOptional.
  ///
  /// In en, this message translates to:
  /// **'More details (optional)'**
  String get communityReportDetailsOptional;

  /// No description provided for @communityReportDetailsRequired.
  ///
  /// In en, this message translates to:
  /// **'Add a few words to explain.'**
  String get communityReportDetailsRequired;

  /// No description provided for @communityReportIntro.
  ///
  /// In en, this message translates to:
  /// **'Choose a reason. Moderators review reports; the author won\'t see your name.'**
  String get communityReportIntro;

  /// No description provided for @communityReportSend.
  ///
  /// In en, this message translates to:
  /// **'Send report'**
  String get communityReportSend;

  /// No description provided for @communityReportSent.
  ///
  /// In en, this message translates to:
  /// **'Thanks — your report reached the moderators.'**
  String get communityReportSent;

  /// No description provided for @communityReportTitle.
  ///
  /// In en, this message translates to:
  /// **'Report content'**
  String get communityReportTitle;

  /// No description provided for @communityReportUserTitle.
  ///
  /// In en, this message translates to:
  /// **'Report a user'**
  String get communityReportUserTitle;

  /// No description provided for @communityReviewBodyHelper.
  ///
  /// In en, this message translates to:
  /// **'At least 20 characters. Write about your own experience only, with no one\'s personal data.'**
  String get communityReviewBodyHelper;

  /// No description provided for @communityReviewBodyHint.
  ///
  /// In en, this message translates to:
  /// **'How do you use the car? What range do you really get? How are charging and servicing?'**
  String get communityReviewBodyHint;

  /// No description provided for @communityReviewBodyLabel.
  ///
  /// In en, this message translates to:
  /// **'Your experience'**
  String get communityReviewBodyLabel;

  /// No description provided for @communityReviewCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No reviews} =1{1 review} other{{count} reviews}}'**
  String communityReviewCount(int count);

  /// No description provided for @communityReviewExistsMessage.
  ///
  /// In en, this message translates to:
  /// **'Each owner can write one review per trim. Do you want to edit your existing review?'**
  String get communityReviewExistsMessage;

  /// No description provided for @communityReviewExistsTitle.
  ///
  /// In en, this message translates to:
  /// **'You already reviewed this trim'**
  String get communityReviewExistsTitle;

  /// No description provided for @communityReviewGuidelines.
  ///
  /// In en, this message translates to:
  /// **'Be specific and honest; no links, ads or personal data.'**
  String get communityReviewGuidelines;

  /// No description provided for @communityReviewModerated.
  ///
  /// In en, this message translates to:
  /// **'Moderators check every review before it\'s published.'**
  String get communityReviewModerated;

  /// No description provided for @communityReviewSubmittedMessage.
  ///
  /// In en, this message translates to:
  /// **'Thank you! Your review will appear to others after moderators check it. You can see and edit it on the reviews page.'**
  String get communityReviewSubmittedMessage;

  /// No description provided for @communityReviewSubmittedTitle.
  ///
  /// In en, this message translates to:
  /// **'Review received'**
  String get communityReviewSubmittedTitle;

  /// No description provided for @communityReviewTitleHint.
  ///
  /// In en, this message translates to:
  /// **'Your experience in one line'**
  String get communityReviewTitleHint;

  /// No description provided for @communityReviewTitleLabel.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get communityReviewTitleLabel;

  /// No description provided for @communityReviewsDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'Reviews are owners\' personal opinions and experiences, checked by moderators before publishing — not official data or certified measurements.'**
  String get communityReviewsDisclaimer;

  /// No description provided for @communitySave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get communitySave;

  /// No description provided for @communitySaveReview.
  ///
  /// In en, this message translates to:
  /// **'Save and resubmit'**
  String get communitySaveReview;

  /// No description provided for @communitySearchQuestions.
  ///
  /// In en, this message translates to:
  /// **'Search questions'**
  String get communitySearchQuestions;

  /// No description provided for @communitySend.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get communitySend;

  /// No description provided for @communityShowAllQuestions.
  ///
  /// In en, this message translates to:
  /// **'Show all questions'**
  String get communityShowAllQuestions;

  /// No description provided for @communityShowLess.
  ///
  /// In en, this message translates to:
  /// **'Show less'**
  String get communityShowLess;

  /// No description provided for @communityShowMore.
  ///
  /// In en, this message translates to:
  /// **'Show more'**
  String get communityShowMore;

  /// No description provided for @communitySignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get communitySignIn;

  /// No description provided for @communitySignInToAnswer.
  ///
  /// In en, this message translates to:
  /// **'Sign in to add an answer.'**
  String get communitySignInToAnswer;

  /// No description provided for @communitySignInToAsk.
  ///
  /// In en, this message translates to:
  /// **'Sign in to ask the community a question.'**
  String get communitySignInToAsk;

  /// No description provided for @communitySignInToComment.
  ///
  /// In en, this message translates to:
  /// **'Sign in to comment or reply.'**
  String get communitySignInToComment;

  /// No description provided for @communitySignInToParticipate.
  ///
  /// In en, this message translates to:
  /// **'Anyone can read. Sign in to take part in the community.'**
  String get communitySignInToParticipate;

  /// No description provided for @communitySignInToReport.
  ///
  /// In en, this message translates to:
  /// **'Sign in to report content.'**
  String get communitySignInToReport;

  /// No description provided for @communitySignInToReview.
  ///
  /// In en, this message translates to:
  /// **'Sign in to write your owner review of this car.'**
  String get communitySignInToReview;

  /// No description provided for @communitySignInToVote.
  ///
  /// In en, this message translates to:
  /// **'Sign in to mark posts as helpful.'**
  String get communitySignInToVote;

  /// No description provided for @communitySortActive.
  ///
  /// In en, this message translates to:
  /// **'Most active'**
  String get communitySortActive;

  /// No description provided for @communitySortHelpful.
  ///
  /// In en, this message translates to:
  /// **'Most helpful'**
  String get communitySortHelpful;

  /// No description provided for @communitySortNewest.
  ///
  /// In en, this message translates to:
  /// **'Newest'**
  String get communitySortNewest;

  /// No description provided for @communitySortOldest.
  ///
  /// In en, this message translates to:
  /// **'Oldest'**
  String get communitySortOldest;

  /// No description provided for @communitySortRatingHigh.
  ///
  /// In en, this message translates to:
  /// **'Highest rating'**
  String get communitySortRatingHigh;

  /// No description provided for @communitySortRatingLow.
  ///
  /// In en, this message translates to:
  /// **'Lowest rating'**
  String get communitySortRatingLow;

  /// No description provided for @communitySortRecent.
  ///
  /// In en, this message translates to:
  /// **'Most recent'**
  String get communitySortRecent;

  /// No description provided for @communitySortTop.
  ///
  /// In en, this message translates to:
  /// **'Most helpful'**
  String get communitySortTop;

  /// No description provided for @communitySortVotes.
  ///
  /// In en, this message translates to:
  /// **'Most votes'**
  String get communitySortVotes;

  /// No description provided for @communityStarOption.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 star} other{{count} stars}}'**
  String communityStarOption(int count);

  /// No description provided for @communityStarsSemantics.
  ///
  /// In en, this message translates to:
  /// **'{rating} out of 5 stars'**
  String communityStarsSemantics(String rating);

  /// No description provided for @communityStatusHidden.
  ///
  /// In en, this message translates to:
  /// **'Hidden by moderators'**
  String get communityStatusHidden;

  /// No description provided for @communityStatusHiddenHint.
  ///
  /// In en, this message translates to:
  /// **'It\'s no longer visible to others (for example after reports). Moderators can restore it.'**
  String get communityStatusHiddenHint;

  /// No description provided for @communityStatusPending.
  ///
  /// In en, this message translates to:
  /// **'Awaiting review'**
  String get communityStatusPending;

  /// No description provided for @communityStatusPendingHint.
  ///
  /// In en, this message translates to:
  /// **'Only you can see this until a moderator approves it.'**
  String get communityStatusPendingHint;

  /// No description provided for @communityStatusPendingReviewHint.
  ///
  /// In en, this message translates to:
  /// **'Moderators check every review before it\'s published. Only you can see it for now.'**
  String get communityStatusPendingReviewHint;

  /// No description provided for @communityStatusRejected.
  ///
  /// In en, this message translates to:
  /// **'Not approved'**
  String get communityStatusRejected;

  /// No description provided for @communityStatusRejectedHint.
  ///
  /// In en, this message translates to:
  /// **'It doesn\'t follow the community guidelines, so only you can see it. You can edit or delete it.'**
  String get communityStatusRejectedHint;

  /// No description provided for @communityStatusUnknownTitle.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t check your account status'**
  String get communityStatusUnknownTitle;

  /// No description provided for @communitySubmitReview.
  ///
  /// In en, this message translates to:
  /// **'Submit for review'**
  String get communitySubmitReview;

  /// No description provided for @communityTapToRate.
  ///
  /// In en, this message translates to:
  /// **'Tap the stars to rate'**
  String get communityTapToRate;

  /// No description provided for @communityTooLong.
  ///
  /// In en, this message translates to:
  /// **'At most {max} characters.'**
  String communityTooLong(int max);

  /// No description provided for @communityTooShort.
  ///
  /// In en, this message translates to:
  /// **'Write at least {min} characters.'**
  String communityTooShort(int min);

  /// No description provided for @communityTrimLabel.
  ///
  /// In en, this message translates to:
  /// **'Trim'**
  String get communityTrimLabel;

  /// No description provided for @communityTrimSemantics.
  ///
  /// In en, this message translates to:
  /// **'Trim: {trim}. Tap to change'**
  String communityTrimSemantics(String trim);

  /// No description provided for @communityUnaccept.
  ///
  /// In en, this message translates to:
  /// **'Remove acceptance'**
  String get communityUnaccept;

  /// No description provided for @communityUnblock.
  ///
  /// In en, this message translates to:
  /// **'Unblock'**
  String get communityUnblock;

  /// No description provided for @communityUnblocked.
  ///
  /// In en, this message translates to:
  /// **'{name} unblocked'**
  String communityUnblocked(String name);

  /// No description provided for @communityUndo.
  ///
  /// In en, this message translates to:
  /// **'Undo'**
  String get communityUndo;

  /// No description provided for @communityVerifiedAlready.
  ///
  /// In en, this message translates to:
  /// **'I\'ve verified it'**
  String get communityVerifiedAlready;

  /// No description provided for @communityVerifiedOnly.
  ///
  /// In en, this message translates to:
  /// **'Verified owners only'**
  String get communityVerifiedOnly;

  /// No description provided for @communityVerifiedOwner.
  ///
  /// In en, this message translates to:
  /// **'Verified owner'**
  String get communityVerifiedOwner;

  /// No description provided for @communityVerifiedOwnerCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 verified owner} other{{count} verified owners}}'**
  String communityVerifiedOwnerCount(int count);

  /// No description provided for @communityVerifiedOwnerExplainer.
  ///
  /// In en, this message translates to:
  /// **'The \"Verified owner\" badge can\'t be chosen: it appears only after our team actually verifies that you own the car.'**
  String get communityVerifiedOwnerExplainer;

  /// No description provided for @communityVerifiedOwnerHint.
  ///
  /// In en, this message translates to:
  /// **'Our team verified that the author owns this car.'**
  String get communityVerifiedOwnerHint;

  /// No description provided for @communityVerifyEmailAction.
  ///
  /// In en, this message translates to:
  /// **'Verify e-mail'**
  String get communityVerifyEmailAction;

  /// No description provided for @communityVerifyEmailMessage.
  ///
  /// In en, this message translates to:
  /// **'To post in the community, {email} must be verified. Open the message we sent or request a new one.'**
  String communityVerifyEmailMessage(String email);

  /// No description provided for @communityVerifyEmailTitle.
  ///
  /// In en, this message translates to:
  /// **'Verify your e-mail first'**
  String get communityVerifyEmailTitle;

  /// No description provided for @communityViewAllComments.
  ///
  /// In en, this message translates to:
  /// **'View all comments'**
  String get communityViewAllComments;

  /// No description provided for @communityViewMoreReplies.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{View 1 more reply} other{View {count} more replies}}'**
  String communityViewMoreReplies(int count);

  /// No description provided for @communityVoteDownSemantics.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{Not helpful, no votes} =1{Not helpful, 1 vote} other{Not helpful, {count} votes}}'**
  String communityVoteDownSemantics(int count);

  /// No description provided for @communityVoteUpSemantics.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{Helpful, no votes} =1{Helpful, 1 vote} other{Helpful, {count} votes}}'**
  String communityVoteUpSemantics(int count);

  /// No description provided for @communityWriteReviewTitle.
  ///
  /// In en, this message translates to:
  /// **'Write a review'**
  String get communityWriteReviewTitle;

  /// No description provided for @communityYou.
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get communityYou;

  /// No description provided for @communityYourAnswer.
  ///
  /// In en, this message translates to:
  /// **'Your answer'**
  String get communityYourAnswer;

  /// No description provided for @communityYourReview.
  ///
  /// In en, this message translates to:
  /// **'Your review'**
  String get communityYourReview;

  /// No description provided for @compareAboutRow.
  ///
  /// In en, this message translates to:
  /// **'About “{label}”'**
  String compareAboutRow(String label);

  /// No description provided for @compareAddCarCount.
  ///
  /// In en, this message translates to:
  /// **'Add a car ({count} of {max})'**
  String compareAddCarCount(int count, int max);

  /// No description provided for @compareAddCarHint.
  ///
  /// In en, this message translates to:
  /// **'Brand, model, year, trim and market'**
  String get compareAddCarHint;

  /// No description provided for @compareAddCarSlot.
  ///
  /// In en, this message translates to:
  /// **'Add car {number}'**
  String compareAddCarSlot(int number);

  /// No description provided for @compareAlreadySaved.
  ///
  /// In en, this message translates to:
  /// **'This comparison is already saved in your account'**
  String get compareAlreadySaved;

  /// No description provided for @compareAlternativesCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{+1 other value} other{+{count} other values}}'**
  String compareAlternativesCount(int count);

  /// No description provided for @compareAlternativesExplainer.
  ///
  /// In en, this message translates to:
  /// **'Values on other cycles, charge windows or wheel sizes are listed for reference and never mixed into the comparison.'**
  String get compareAlternativesExplainer;

  /// No description provided for @compareAvailabilityAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get compareAvailabilityAvailable;

  /// No description provided for @compareAvailabilityComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming soon'**
  String get compareAvailabilityComingSoon;

  /// No description provided for @compareAvailabilityDiscontinued.
  ///
  /// In en, this message translates to:
  /// **'Discontinued'**
  String get compareAvailabilityDiscontinued;

  /// No description provided for @compareAvailabilityUnknown.
  ///
  /// In en, this message translates to:
  /// **'Availability not available'**
  String get compareAvailabilityUnknown;

  /// No description provided for @compareBest.
  ///
  /// In en, this message translates to:
  /// **'Best'**
  String get compareBest;

  /// No description provided for @compareBestInRow.
  ///
  /// In en, this message translates to:
  /// **'Best in this row'**
  String get compareBestInRow;

  /// No description provided for @compareBodyCoupe.
  ///
  /// In en, this message translates to:
  /// **'Coupe'**
  String get compareBodyCoupe;

  /// No description provided for @compareBodyCrossover.
  ///
  /// In en, this message translates to:
  /// **'Crossover'**
  String get compareBodyCrossover;

  /// No description provided for @compareBodyHatchback.
  ///
  /// In en, this message translates to:
  /// **'Hatchback'**
  String get compareBodyHatchback;

  /// No description provided for @compareBodyMpv.
  ///
  /// In en, this message translates to:
  /// **'MPV'**
  String get compareBodyMpv;

  /// No description provided for @compareBodyPickup.
  ///
  /// In en, this message translates to:
  /// **'Pickup'**
  String get compareBodyPickup;

  /// No description provided for @compareBodySedan.
  ///
  /// In en, this message translates to:
  /// **'Sedan'**
  String get compareBodySedan;

  /// No description provided for @compareBodySuv.
  ///
  /// In en, this message translates to:
  /// **'SUV'**
  String get compareBodySuv;

  /// No description provided for @compareBodyVan.
  ///
  /// In en, this message translates to:
  /// **'Van'**
  String get compareBodyVan;

  /// No description provided for @compareBodyWagon.
  ///
  /// In en, this message translates to:
  /// **'Wagon'**
  String get compareBodyWagon;

  /// No description provided for @compareCarActions.
  ///
  /// In en, this message translates to:
  /// **'Options for {car}'**
  String compareCarActions(String car);

  /// No description provided for @compareCarNumbered.
  ///
  /// In en, this message translates to:
  /// **'Car {number}: {car}'**
  String compareCarNumbered(int number, String car);

  /// No description provided for @compareChangeCar.
  ///
  /// In en, this message translates to:
  /// **'Change trim, year or market'**
  String get compareChangeCar;

  /// No description provided for @compareChargerPower.
  ///
  /// In en, this message translates to:
  /// **'{power} charger'**
  String compareChargerPower(String power);

  /// No description provided for @compareComparedOn.
  ///
  /// In en, this message translates to:
  /// **'Compared on: {basis}'**
  String compareComparedOn(String basis);

  /// No description provided for @compareConvertedEstimate.
  ///
  /// In en, this message translates to:
  /// **'Estimate after conversion'**
  String get compareConvertedEstimate;

  /// No description provided for @compareCopiedToTray.
  ///
  /// In en, this message translates to:
  /// **'{count} cars copied to Compare'**
  String compareCopiedToTray(String count);

  /// No description provided for @compareCurrentAc.
  ///
  /// In en, this message translates to:
  /// **'AC'**
  String get compareCurrentAc;

  /// No description provided for @compareCurrentDc.
  ///
  /// In en, this message translates to:
  /// **'DC'**
  String get compareCurrentDc;

  /// No description provided for @compareDecidedRows.
  ///
  /// In en, this message translates to:
  /// **'Rows with a winner: {decided} of {total}'**
  String compareDecidedRows(String decided, String total);

  /// No description provided for @compareDeleteSaved.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get compareDeleteSaved;

  /// No description provided for @compareDeleteSavedMessage.
  ///
  /// In en, this message translates to:
  /// **'“{title}” will be removed from your account. Links you shared will stop working.'**
  String compareDeleteSavedMessage(String title);

  /// No description provided for @compareDeleteSavedTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete this comparison?'**
  String get compareDeleteSavedTitle;

  /// No description provided for @compareDeleted.
  ///
  /// In en, this message translates to:
  /// **'Comparison deleted'**
  String get compareDeleted;

  /// No description provided for @compareDerived.
  ///
  /// In en, this message translates to:
  /// **'Calculated from another published value'**
  String get compareDerived;

  /// No description provided for @compareDetailsAlternatives.
  ///
  /// In en, this message translates to:
  /// **'Other published values'**
  String get compareDetailsAlternatives;

  /// No description provided for @compareDetailsBasis.
  ///
  /// In en, this message translates to:
  /// **'Measured on'**
  String get compareDetailsBasis;

  /// No description provided for @compareDetailsCar.
  ///
  /// In en, this message translates to:
  /// **'Car'**
  String get compareDetailsCar;

  /// No description provided for @compareDetailsConditions.
  ///
  /// In en, this message translates to:
  /// **'Test conditions'**
  String get compareDetailsConditions;

  /// No description provided for @compareDetailsDerivation.
  ///
  /// In en, this message translates to:
  /// **'How it was obtained'**
  String get compareDetailsDerivation;

  /// No description provided for @compareDetailsDocumentDate.
  ///
  /// In en, this message translates to:
  /// **'Document date'**
  String get compareDetailsDocumentDate;

  /// No description provided for @compareDetailsNote.
  ///
  /// In en, this message translates to:
  /// **'Note'**
  String get compareDetailsNote;

  /// No description provided for @compareDetailsPublished.
  ///
  /// In en, this message translates to:
  /// **'Published value'**
  String get compareDetailsPublished;

  /// No description provided for @compareDetailsValue.
  ///
  /// In en, this message translates to:
  /// **'Value'**
  String get compareDetailsValue;

  /// No description provided for @compareDifferencesOnly.
  ///
  /// In en, this message translates to:
  /// **'Differences only'**
  String get compareDifferencesOnly;

  /// No description provided for @compareDifferencesOnlyHint.
  ///
  /// In en, this message translates to:
  /// **'Hide rows where every car has the same value'**
  String get compareDifferencesOnlyHint;

  /// No description provided for @compareDirectionHigher.
  ///
  /// In en, this message translates to:
  /// **'Higher is better'**
  String get compareDirectionHigher;

  /// No description provided for @compareDirectionLower.
  ///
  /// In en, this message translates to:
  /// **'Lower is better'**
  String get compareDirectionLower;

  /// No description provided for @compareDirectionNone.
  ///
  /// In en, this message translates to:
  /// **'No “better” value — depends on your needs'**
  String get compareDirectionNone;

  /// No description provided for @compareDisclosureFallback.
  ///
  /// In en, this message translates to:
  /// **'Results are computed from catalog data only. Ads and sponsorships never change them.'**
  String get compareDisclosureFallback;

  /// No description provided for @compareEditCars.
  ///
  /// In en, this message translates to:
  /// **'Cars ({count})'**
  String compareEditCars(int count);

  /// No description provided for @compareEditCarsTitle.
  ///
  /// In en, this message translates to:
  /// **'Cars in this comparison'**
  String get compareEditCarsTitle;

  /// No description provided for @compareEditInCompare.
  ///
  /// In en, this message translates to:
  /// **'Edit in Compare'**
  String get compareEditInCompare;

  /// No description provided for @compareFactorAc.
  ///
  /// In en, this message translates to:
  /// **'AC charging'**
  String get compareFactorAc;

  /// No description provided for @compareFactorDc.
  ///
  /// In en, this message translates to:
  /// **'DC fast charging'**
  String get compareFactorDc;

  /// No description provided for @compareFactorEfficiency.
  ///
  /// In en, this message translates to:
  /// **'Energy efficiency'**
  String get compareFactorEfficiency;

  /// No description provided for @compareFactorPerformance.
  ///
  /// In en, this message translates to:
  /// **'Acceleration'**
  String get compareFactorPerformance;

  /// No description provided for @compareFactorPrice.
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get compareFactorPrice;

  /// No description provided for @compareFactorRange.
  ///
  /// In en, this message translates to:
  /// **'Electric range'**
  String get compareFactorRange;

  /// No description provided for @compareFactorSpace.
  ///
  /// In en, this message translates to:
  /// **'Trunk space'**
  String get compareFactorSpace;

  /// No description provided for @compareFavoriteSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 car} other{{count} cars}}'**
  String compareFavoriteSubtitle(int count);

  /// No description provided for @compareFeaturedTitle.
  ///
  /// In en, this message translates to:
  /// **'Curated comparisons'**
  String get compareFeaturedTitle;

  /// No description provided for @compareGeneratedAt.
  ///
  /// In en, this message translates to:
  /// **'Calculated {time}'**
  String compareGeneratedAt(String time);

  /// No description provided for @compareGoToCompare.
  ///
  /// In en, this message translates to:
  /// **'Start a new comparison'**
  String get compareGoToCompare;

  /// No description provided for @compareHeaderSpec.
  ///
  /// In en, this message translates to:
  /// **'Specification'**
  String get compareHeaderSpec;

  /// No description provided for @compareIntroMessage.
  ///
  /// In en, this message translates to:
  /// **'Pick each car by model year, trim and market. Figures are compared only when they were measured the same way.'**
  String get compareIntroMessage;

  /// No description provided for @compareIntroRuleCycles.
  ///
  /// In en, this message translates to:
  /// **'Ranges are compared on the same test cycle only (WLTP, EPA, CLTC or NEDC), never converted.'**
  String get compareIntroRuleCycles;

  /// No description provided for @compareIntroRuleMandatory.
  ///
  /// In en, this message translates to:
  /// **'Year, trim and market are required for every car.'**
  String get compareIntroRuleMandatory;

  /// No description provided for @compareIntroRuleMissing.
  ///
  /// In en, this message translates to:
  /// **'A missing value is shown as “Not available”, never as 0 or a win.'**
  String get compareIntroRuleMissing;

  /// No description provided for @compareIntroTitle.
  ///
  /// In en, this message translates to:
  /// **'Compare 2 to 4 cars side by side'**
  String get compareIntroTitle;

  /// No description provided for @compareKindCurated.
  ///
  /// In en, this message translates to:
  /// **'Curated by the editors'**
  String get compareKindCurated;

  /// No description provided for @compareKindMine.
  ///
  /// In en, this message translates to:
  /// **'Saved in your account'**
  String get compareKindMine;

  /// No description provided for @compareKindSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved comparison'**
  String get compareKindSaved;

  /// No description provided for @compareKindShared.
  ///
  /// In en, this message translates to:
  /// **'Shared link'**
  String get compareKindShared;

  /// No description provided for @compareLegendBest.
  ///
  /// In en, this message translates to:
  /// **'Shown only when every value is available and measured the same way.'**
  String get compareLegendBest;

  /// No description provided for @compareLegendButton.
  ///
  /// In en, this message translates to:
  /// **'What do the labels mean?'**
  String get compareLegendButton;

  /// No description provided for @compareLegendTitle.
  ///
  /// In en, this message translates to:
  /// **'How cars are compared'**
  String get compareLegendTitle;

  /// No description provided for @compareLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading the comparison…'**
  String get compareLoading;

  /// No description provided for @compareMissingRows.
  ///
  /// In en, this message translates to:
  /// **'Missing data: {count}'**
  String compareMissingRows(String count);

  /// No description provided for @compareModeChargeDepleting.
  ///
  /// In en, this message translates to:
  /// **'Charge depleting'**
  String get compareModeChargeDepleting;

  /// No description provided for @compareModeChargeSustaining.
  ///
  /// In en, this message translates to:
  /// **'Charge sustaining'**
  String get compareModeChargeSustaining;

  /// No description provided for @compareModeCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get compareModeCity;

  /// No description provided for @compareModeCombined.
  ///
  /// In en, this message translates to:
  /// **'Combined'**
  String get compareModeCombined;

  /// No description provided for @compareModeHighway.
  ///
  /// In en, this message translates to:
  /// **'Highway'**
  String get compareModeHighway;

  /// No description provided for @compareModeWeighted.
  ///
  /// In en, this message translates to:
  /// **'Weighted'**
  String get compareModeWeighted;

  /// No description provided for @compareMoveDown.
  ///
  /// In en, this message translates to:
  /// **'Move down'**
  String get compareMoveDown;

  /// No description provided for @compareMoveUp.
  ///
  /// In en, this message translates to:
  /// **'Move up'**
  String get compareMoveUp;

  /// No description provided for @compareNo.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get compareNo;

  /// No description provided for @compareNoDifferencesMessage.
  ///
  /// In en, this message translates to:
  /// **'These cars show the same values in this view. Turn off “Differences only” to see every row.'**
  String get compareNoDifferencesMessage;

  /// No description provided for @compareNoRowsMessage.
  ///
  /// In en, this message translates to:
  /// **'There is no data for this view yet.'**
  String get compareNoRowsMessage;

  /// No description provided for @compareNoRowsTitle.
  ///
  /// In en, this message translates to:
  /// **'No rows to show'**
  String get compareNoRowsTitle;

  /// No description provided for @compareNotApplicable.
  ///
  /// In en, this message translates to:
  /// **'Not applicable'**
  String get compareNotApplicable;

  /// No description provided for @compareNotComparableRows.
  ///
  /// In en, this message translates to:
  /// **'Not comparable: {count}'**
  String compareNotComparableRows(String count);

  /// No description provided for @compareOpenCar.
  ///
  /// In en, this message translates to:
  /// **'Open car page'**
  String get compareOpenCar;

  /// No description provided for @compareOpenSource.
  ///
  /// In en, this message translates to:
  /// **'Open source'**
  String get compareOpenSource;

  /// No description provided for @compareOriginalValue.
  ///
  /// In en, this message translates to:
  /// **'Published as {value}'**
  String compareOriginalValue(String value);

  /// No description provided for @compareOutcomeTie.
  ///
  /// In en, this message translates to:
  /// **'Equal — no winner'**
  String get compareOutcomeTie;

  /// No description provided for @comparePickerAdded.
  ///
  /// In en, this message translates to:
  /// **'{car} added to the comparison'**
  String comparePickerAdded(String car);

  /// No description provided for @comparePickerAllMarkets.
  ///
  /// In en, this message translates to:
  /// **'Include trims from other markets'**
  String get comparePickerAllMarkets;

  /// No description provided for @comparePickerAllMarketsHint.
  ///
  /// In en, this message translates to:
  /// **'Useful to compare the same car across countries. Prices stay in each market\'s currency.'**
  String get comparePickerAllMarketsHint;

  /// No description provided for @comparePickerAlreadyIn.
  ///
  /// In en, this message translates to:
  /// **'This trim and market are already in the comparison'**
  String get comparePickerAlreadyIn;

  /// No description provided for @comparePickerBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get comparePickerBack;

  /// No description provided for @comparePickerBrowseMarket.
  ///
  /// In en, this message translates to:
  /// **'Browse cars sold in'**
  String get comparePickerBrowseMarket;

  /// No description provided for @comparePickerChooseBrand.
  ///
  /// In en, this message translates to:
  /// **'Choose the brand'**
  String get comparePickerChooseBrand;

  /// No description provided for @comparePickerChooseMarket.
  ///
  /// In en, this message translates to:
  /// **'Choose the market'**
  String get comparePickerChooseMarket;

  /// No description provided for @comparePickerChooseModel.
  ///
  /// In en, this message translates to:
  /// **'Choose the model'**
  String get comparePickerChooseModel;

  /// No description provided for @comparePickerChooseTrim.
  ///
  /// In en, this message translates to:
  /// **'Choose the trim'**
  String get comparePickerChooseTrim;

  /// No description provided for @comparePickerChooseYear.
  ///
  /// In en, this message translates to:
  /// **'Choose the model year'**
  String get comparePickerChooseYear;

  /// No description provided for @comparePickerCurrency.
  ///
  /// In en, this message translates to:
  /// **'Prices in {currency}'**
  String comparePickerCurrency(String currency);

  /// No description provided for @comparePickerEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'No published cars match in this market yet. Try including other markets or go back.'**
  String get comparePickerEmptyMessage;

  /// No description provided for @comparePickerEmptyMessageAll.
  ///
  /// In en, this message translates to:
  /// **'No published cars match yet. Go back and choose again.'**
  String get comparePickerEmptyMessageAll;

  /// No description provided for @comparePickerEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Nothing to choose here'**
  String get comparePickerEmptyTitle;

  /// No description provided for @comparePickerMarketHint.
  ///
  /// In en, this message translates to:
  /// **'Price, availability and charging inlets are taken from this market.'**
  String get comparePickerMarketHint;

  /// No description provided for @comparePickerNoMatch.
  ///
  /// In en, this message translates to:
  /// **'No match for your search'**
  String get comparePickerNoMatch;

  /// No description provided for @comparePickerProgress.
  ///
  /// In en, this message translates to:
  /// **'Step {step} of {total}'**
  String comparePickerProgress(int step, int total);

  /// No description provided for @comparePickerReplaceTitle.
  ///
  /// In en, this message translates to:
  /// **'Change car'**
  String get comparePickerReplaceTitle;

  /// No description provided for @comparePickerReplaced.
  ///
  /// In en, this message translates to:
  /// **'Replaced with {car}'**
  String comparePickerReplaced(String car);

  /// No description provided for @comparePickerSearchBrand.
  ///
  /// In en, this message translates to:
  /// **'Search brands'**
  String get comparePickerSearchBrand;

  /// No description provided for @comparePickerSearchModel.
  ///
  /// In en, this message translates to:
  /// **'Search models'**
  String get comparePickerSearchModel;

  /// No description provided for @comparePickerShowAllMarkets.
  ///
  /// In en, this message translates to:
  /// **'Include other markets'**
  String get comparePickerShowAllMarkets;

  /// No description provided for @comparePickerSoldIn.
  ///
  /// In en, this message translates to:
  /// **'Listed in: {markets}'**
  String comparePickerSoldIn(String markets);

  /// No description provided for @comparePickerStepBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get comparePickerStepBrand;

  /// No description provided for @comparePickerStepCurrent.
  ///
  /// In en, this message translates to:
  /// **'current step'**
  String get comparePickerStepCurrent;

  /// No description provided for @comparePickerStepDone.
  ///
  /// In en, this message translates to:
  /// **'chosen'**
  String get comparePickerStepDone;

  /// No description provided for @comparePickerStepEditHint.
  ///
  /// In en, this message translates to:
  /// **'Change this choice'**
  String get comparePickerStepEditHint;

  /// No description provided for @comparePickerStepMarket.
  ///
  /// In en, this message translates to:
  /// **'Market'**
  String get comparePickerStepMarket;

  /// No description provided for @comparePickerStepModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get comparePickerStepModel;

  /// No description provided for @comparePickerStepTodo.
  ///
  /// In en, this message translates to:
  /// **'not chosen yet'**
  String get comparePickerStepTodo;

  /// No description provided for @comparePickerStepTrim.
  ///
  /// In en, this message translates to:
  /// **'Trim'**
  String get comparePickerStepTrim;

  /// No description provided for @comparePickerStepYear.
  ///
  /// In en, this message translates to:
  /// **'Year'**
  String get comparePickerStepYear;

  /// No description provided for @comparePickerTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose a car'**
  String get comparePickerTitle;

  /// No description provided for @comparePickerTrimCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 trim} other{{formatted} trims}}'**
  String comparePickerTrimCount(int count, String formatted);

  /// No description provided for @compareRecBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get compareRecBack;

  /// No description provided for @compareRecBasis.
  ///
  /// In en, this message translates to:
  /// **'Ranges and consumption compared on {cycle}; prices in {currency}.'**
  String compareRecBasis(String cycle, String currency);

  /// No description provided for @compareRecBasisPeak.
  ///
  /// In en, this message translates to:
  /// **'peak'**
  String get compareRecBasisPeak;

  /// No description provided for @compareRecBodyTypes.
  ///
  /// In en, this message translates to:
  /// **'Body types'**
  String get compareRecBodyTypes;

  /// No description provided for @compareRecBodyTypesAny.
  ///
  /// In en, this message translates to:
  /// **'Any body type'**
  String get compareRecBodyTypesAny;

  /// No description provided for @compareRecBodyTypesSome.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 body type selected} other{{count} body types selected}}'**
  String compareRecBodyTypesSome(int count);

  /// No description provided for @compareRecBreakdown.
  ///
  /// In en, this message translates to:
  /// **'How the score was calculated'**
  String get compareRecBreakdown;

  /// No description provided for @compareRecBudgetError.
  ///
  /// In en, this message translates to:
  /// **'Enter a budget greater than zero'**
  String get compareRecBudgetError;

  /// No description provided for @compareRecBudgetHelper.
  ///
  /// In en, this message translates to:
  /// **'Prices in {market} ({currency}). Prices in other currencies are never converted.'**
  String compareRecBudgetHelper(String market, String currency);

  /// No description provided for @compareRecBudgetLabel.
  ///
  /// In en, this message translates to:
  /// **'Maximum price ({currency})'**
  String compareRecBudgetLabel(String currency);

  /// No description provided for @compareRecBudgetMessage.
  ///
  /// In en, this message translates to:
  /// **'We only consider cars whose current local price is within your budget.'**
  String get compareRecBudgetMessage;

  /// No description provided for @compareRecBudgetTitle.
  ///
  /// In en, this message translates to:
  /// **'What is your budget?'**
  String get compareRecBudgetTitle;

  /// No description provided for @compareRecCycleMismatch.
  ///
  /// In en, this message translates to:
  /// **'measured on a different test cycle'**
  String get compareRecCycleMismatch;

  /// No description provided for @compareRecDailyKm.
  ///
  /// In en, this message translates to:
  /// **'Daily distance'**
  String get compareRecDailyKm;

  /// No description provided for @compareRecDecrease.
  ///
  /// In en, this message translates to:
  /// **'Decrease {label}'**
  String compareRecDecrease(String label);

  /// No description provided for @compareRecEditAnswers.
  ///
  /// In en, this message translates to:
  /// **'Edit answers'**
  String get compareRecEditAnswers;

  /// No description provided for @compareRecExcludedBody.
  ///
  /// In en, this message translates to:
  /// **'Other body type: {count}'**
  String compareRecExcludedBody(String count);

  /// No description provided for @compareRecExcludedBudget.
  ///
  /// In en, this message translates to:
  /// **'Over budget: {count}'**
  String compareRecExcludedBudget(String count);

  /// No description provided for @compareRecExcludedPowertrain.
  ///
  /// In en, this message translates to:
  /// **'Other powertrain: {count}'**
  String compareRecExcludedPowertrain(String count);

  /// No description provided for @compareRecExcludedSeats.
  ///
  /// In en, this message translates to:
  /// **'Too few seats: {count}'**
  String compareRecExcludedSeats(String count);

  /// No description provided for @compareRecExcludedTitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 car did not fit} other{{formatted} cars did not fit}}'**
  String compareRecExcludedTitle(int count, String formatted);

  /// No description provided for @compareRecHomeCharging.
  ///
  /// In en, this message translates to:
  /// **'Can you charge at home or at work?'**
  String get compareRecHomeCharging;

  /// No description provided for @compareRecHomeChargingNo.
  ///
  /// In en, this message translates to:
  /// **'Public charging only'**
  String get compareRecHomeChargingNo;

  /// No description provided for @compareRecHomeChargingRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose whether you can charge at home'**
  String get compareRecHomeChargingRequired;

  /// No description provided for @compareRecHomeChargingYes.
  ///
  /// In en, this message translates to:
  /// **'I can charge at home'**
  String get compareRecHomeChargingYes;

  /// No description provided for @compareRecIgnoreFactor.
  ///
  /// In en, this message translates to:
  /// **'Rank without “{factor}”'**
  String compareRecIgnoreFactor(String factor);

  /// No description provided for @compareRecIncrease.
  ///
  /// In en, this message translates to:
  /// **'Increase {label}'**
  String compareRecIncrease(String label);

  /// No description provided for @compareRecInvalidTitle.
  ///
  /// In en, this message translates to:
  /// **'Some answers need changes'**
  String get compareRecInvalidTitle;

  /// No description provided for @compareRecLongTrips.
  ///
  /// In en, this message translates to:
  /// **'Long trips per month'**
  String get compareRecLongTrips;

  /// No description provided for @compareRecLongTripsHint.
  ///
  /// In en, this message translates to:
  /// **'Trips longer than one full charge'**
  String get compareRecLongTripsHint;

  /// No description provided for @compareRecMissingTitle.
  ///
  /// In en, this message translates to:
  /// **'Missing data'**
  String get compareRecMissingTitle;

  /// No description provided for @compareRecNeedsMessage.
  ///
  /// In en, this message translates to:
  /// **'Cars that do not fit are excluded, and we show how many.'**
  String get compareRecNeedsMessage;

  /// No description provided for @compareRecNeedsTitle.
  ///
  /// In en, this message translates to:
  /// **'What do you need?'**
  String get compareRecNeedsTitle;

  /// No description provided for @compareRecNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get compareRecNext;

  /// No description provided for @compareRecNoDecision.
  ///
  /// In en, this message translates to:
  /// **'No decisive recommendation'**
  String get compareRecNoDecision;

  /// No description provided for @compareRecNotRankedComparable.
  ///
  /// In en, this message translates to:
  /// **'Data not comparable'**
  String get compareRecNotRankedComparable;

  /// No description provided for @compareRecNotRankedMissing.
  ///
  /// In en, this message translates to:
  /// **'Missing data'**
  String get compareRecNotRankedMissing;

  /// No description provided for @compareRecNotRankedPrice.
  ///
  /// In en, this message translates to:
  /// **'Price not available'**
  String get compareRecNotRankedPrice;

  /// No description provided for @compareRecNotRankedSeats.
  ///
  /// In en, this message translates to:
  /// **'Seats not available'**
  String get compareRecNotRankedSeats;

  /// No description provided for @compareRecNotRankedSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Missing values are never counted as 0'**
  String get compareRecNotRankedSubtitle;

  /// No description provided for @compareRecNotRankedTitle.
  ///
  /// In en, this message translates to:
  /// **'Could not be ranked'**
  String get compareRecNotRankedTitle;

  /// No description provided for @compareRecNotesTitle.
  ///
  /// In en, this message translates to:
  /// **'Good to know'**
  String get compareRecNotesTitle;

  /// No description provided for @compareRecPoints.
  ///
  /// In en, this message translates to:
  /// **'{points} points'**
  String compareRecPoints(String points);

  /// No description provided for @compareRecPowertrainRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose at least one powertrain'**
  String get compareRecPowertrainRequired;

  /// No description provided for @compareRecPowertrains.
  ///
  /// In en, this message translates to:
  /// **'Powertrains'**
  String get compareRecPowertrains;

  /// No description provided for @compareRecPowertrainsHint.
  ///
  /// In en, this message translates to:
  /// **'Choose at least one'**
  String get compareRecPowertrainsHint;

  /// No description provided for @compareRecPrioritiesMessage.
  ///
  /// In en, this message translates to:
  /// **'Weights decide how much each factor counts. They are shown with the results.'**
  String get compareRecPrioritiesMessage;

  /// No description provided for @compareRecPrioritiesTitle.
  ///
  /// In en, this message translates to:
  /// **'What matters most?'**
  String get compareRecPrioritiesTitle;

  /// No description provided for @compareRecRank.
  ///
  /// In en, this message translates to:
  /// **'Rank {rank}'**
  String compareRecRank(int rank);

  /// No description provided for @compareRecRankedTitle.
  ///
  /// In en, this message translates to:
  /// **'Ranked cars'**
  String get compareRecRankedTitle;

  /// No description provided for @compareRecReasonFewer.
  ///
  /// In en, this message translates to:
  /// **'Only one car has complete, comparable data, so there is nothing to rank it against.'**
  String get compareRecReasonFewer;

  /// No description provided for @compareRecReasonNoCandidates.
  ///
  /// In en, this message translates to:
  /// **'No car matches your budget and needs. Try a higher budget or fewer filters.'**
  String get compareRecReasonNoCandidates;

  /// No description provided for @compareRecReasonNoComparable.
  ///
  /// In en, this message translates to:
  /// **'The matching cars lack data or their data is not comparable, so we will not guess.'**
  String get compareRecReasonNoComparable;

  /// No description provided for @compareRecReasonTooClose.
  ///
  /// In en, this message translates to:
  /// **'The top cars score too close to call one of them the best.'**
  String get compareRecReasonTooClose;

  /// No description provided for @compareRecResultsTitle.
  ///
  /// In en, this message translates to:
  /// **'Your recommendations'**
  String get compareRecResultsTitle;

  /// No description provided for @compareRecScore.
  ///
  /// In en, this message translates to:
  /// **'Match score: {score} / 100'**
  String compareRecScore(String score);

  /// No description provided for @compareRecScoreUnknown.
  ///
  /// In en, this message translates to:
  /// **'Match score: not available'**
  String get compareRecScoreUnknown;

  /// No description provided for @compareRecSeats.
  ///
  /// In en, this message translates to:
  /// **'Seats needed'**
  String get compareRecSeats;

  /// No description provided for @compareRecSentimentNegative.
  ///
  /// In en, this message translates to:
  /// **'Watch out'**
  String get compareRecSentimentNegative;

  /// No description provided for @compareRecSentimentNeutral.
  ///
  /// In en, this message translates to:
  /// **'Note'**
  String get compareRecSentimentNeutral;

  /// No description provided for @compareRecSentimentPositive.
  ///
  /// In en, this message translates to:
  /// **'Plus'**
  String get compareRecSentimentPositive;

  /// No description provided for @compareRecShowResults.
  ///
  /// In en, this message translates to:
  /// **'Show recommendations'**
  String get compareRecShowResults;

  /// No description provided for @compareRecStepBudget.
  ///
  /// In en, this message translates to:
  /// **'Budget'**
  String get compareRecStepBudget;

  /// No description provided for @compareRecStepNeeds.
  ///
  /// In en, this message translates to:
  /// **'Needs'**
  String get compareRecStepNeeds;

  /// No description provided for @compareRecStepOf.
  ///
  /// In en, this message translates to:
  /// **'Step {step} of {total}: {title}'**
  String compareRecStepOf(int step, int total, String title);

  /// No description provided for @compareRecStepPriorities.
  ///
  /// In en, this message translates to:
  /// **'Priorities'**
  String get compareRecStepPriorities;

  /// No description provided for @compareRecStepUsage.
  ///
  /// In en, this message translates to:
  /// **'Driving'**
  String get compareRecStepUsage;

  /// No description provided for @compareRecSuggestedWeights.
  ///
  /// In en, this message translates to:
  /// **'Use weights suggested from my driving'**
  String get compareRecSuggestedWeights;

  /// No description provided for @compareRecSuggestedWeightsHint.
  ///
  /// In en, this message translates to:
  /// **'Turn off to set every weight yourself (0 = ignore)'**
  String get compareRecSuggestedWeightsHint;

  /// No description provided for @compareRecSummaryBudget.
  ///
  /// In en, this message translates to:
  /// **'Up to {budget}'**
  String compareRecSummaryBudget(String budget);

  /// No description provided for @compareRecSummaryDaily.
  ///
  /// In en, this message translates to:
  /// **'{distance} a day'**
  String compareRecSummaryDaily(String distance);

  /// No description provided for @compareRecSummarySeats.
  ///
  /// In en, this message translates to:
  /// **'{seats} seats'**
  String compareRecSummarySeats(String seats);

  /// No description provided for @compareRecSummaryTrips.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No long trips} =1{1 long trip a month} other{{formatted} long trips a month}}'**
  String compareRecSummaryTrips(int count, String formatted);

  /// No description provided for @compareRecTopPick.
  ///
  /// In en, this message translates to:
  /// **'Top pick for you'**
  String get compareRecTopPick;

  /// No description provided for @compareRecUsageMessage.
  ///
  /// In en, this message translates to:
  /// **'Your daily distance and long trips decide how much range and fast charging matter.'**
  String get compareRecUsageMessage;

  /// No description provided for @compareRecUsageTitle.
  ///
  /// In en, this message translates to:
  /// **'How do you drive?'**
  String get compareRecUsageTitle;

  /// No description provided for @compareRecWeightDefault.
  ///
  /// In en, this message translates to:
  /// **'Default weight'**
  String get compareRecWeightDefault;

  /// No description provided for @compareRecWeightIgnored.
  ///
  /// In en, this message translates to:
  /// **'Ignored'**
  String get compareRecWeightIgnored;

  /// No description provided for @compareRecWeightShare.
  ///
  /// In en, this message translates to:
  /// **'weight {percent}'**
  String compareRecWeightShare(String percent);

  /// No description provided for @compareRecWeightUsage.
  ///
  /// In en, this message translates to:
  /// **'Adjusted to your driving'**
  String get compareRecWeightUsage;

  /// No description provided for @compareRecWeightUser.
  ///
  /// In en, this message translates to:
  /// **'Your choice'**
  String get compareRecWeightUser;

  /// No description provided for @compareRecWeightsAllZero.
  ///
  /// In en, this message translates to:
  /// **'At least one priority must be above 0'**
  String get compareRecWeightsAllZero;

  /// No description provided for @compareRecWeightsTitle.
  ///
  /// In en, this message translates to:
  /// **'Weights used'**
  String get compareRecWeightsTitle;

  /// No description provided for @compareRecommendCtaMessage.
  ///
  /// In en, this message translates to:
  /// **'Answer a few questions about your budget and driving to get an explained recommendation.'**
  String get compareRecommendCtaMessage;

  /// No description provided for @compareRecommendCtaTitle.
  ///
  /// In en, this message translates to:
  /// **'Not sure which car suits you?'**
  String get compareRecommendCtaTitle;

  /// No description provided for @compareRecommendationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Find the right car'**
  String get compareRecommendationsTitle;

  /// No description provided for @compareRemoveCar.
  ///
  /// In en, this message translates to:
  /// **'Remove from comparison'**
  String get compareRemoveCar;

  /// No description provided for @compareRemoved.
  ///
  /// In en, this message translates to:
  /// **'{car} removed from the comparison'**
  String compareRemoved(String car);

  /// No description provided for @compareReplaceTrayConfirm.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get compareReplaceTrayConfirm;

  /// No description provided for @compareReplaceTrayMessage.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{The car you are comparing now will be replaced by the cars of this comparison.} other{The {count} cars you are comparing now will be replaced by the cars of this comparison.}}'**
  String compareReplaceTrayMessage(int count);

  /// No description provided for @compareReplaceTrayTitle.
  ///
  /// In en, this message translates to:
  /// **'Replace your current cars?'**
  String get compareReplaceTrayTitle;

  /// No description provided for @compareRowsWon.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{Better in no row} =1{Better in 1 row} other{Better in {formatted} rows}}'**
  String compareRowsWon(int count, String formatted);

  /// No description provided for @compareRowsWonUnknown.
  ///
  /// In en, this message translates to:
  /// **'Not available'**
  String get compareRowsWonUnknown;

  /// No description provided for @compareRulesText.
  ///
  /// In en, this message translates to:
  /// **'Units are unified before comparing and the published values are kept. Ranges are compared only on the same test cycle and never converted; electric and total range are separate. DC peak and average charging power are separate rows. Charging times are compared only for the same charge window (10–80% is not 30–80%). Prices are compared only in the same currency. A bigger battery is not automatically better. A missing value is never treated as 0.'**
  String get compareRulesText;

  /// No description provided for @compareSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get compareSave;

  /// No description provided for @compareSaveGuestMessage.
  ///
  /// In en, this message translates to:
  /// **'Saving to an account needs sign-in. Without an account you can still create a share link and keep it.'**
  String get compareSaveGuestMessage;

  /// No description provided for @compareSaveGuestTitle.
  ///
  /// In en, this message translates to:
  /// **'Save this comparison'**
  String get compareSaveGuestTitle;

  /// No description provided for @compareSaveLimitReached.
  ///
  /// In en, this message translates to:
  /// **'You have reached the limit of saved comparisons. Delete an old one to save more.'**
  String get compareSaveLimitReached;

  /// No description provided for @compareSaved.
  ///
  /// In en, this message translates to:
  /// **'Comparison saved to your account'**
  String get compareSaved;

  /// No description provided for @compareSavedEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Compare cars, then tap Save to keep the comparison here.'**
  String get compareSavedEmptyMessage;

  /// No description provided for @compareSavedEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No saved comparisons yet'**
  String get compareSavedEmptyTitle;

  /// No description provided for @compareSavedGuestHint.
  ///
  /// In en, this message translates to:
  /// **'Sign in to keep comparisons in your account and open them on any device.'**
  String get compareSavedGuestHint;

  /// No description provided for @compareSavedTitle.
  ///
  /// In en, this message translates to:
  /// **'Saved comparisons'**
  String get compareSavedTitle;

  /// No description provided for @compareShare.
  ///
  /// In en, this message translates to:
  /// **'Share link'**
  String get compareShare;

  /// No description provided for @compareShareLinkInstead.
  ///
  /// In en, this message translates to:
  /// **'Create a share link instead'**
  String get compareShareLinkInstead;

  /// No description provided for @compareSharedNoResultMessage.
  ///
  /// In en, this message translates to:
  /// **'Fewer than two of its cars are still available in the catalog.'**
  String get compareSharedNoResultMessage;

  /// No description provided for @compareSharedNoResultTitle.
  ///
  /// In en, this message translates to:
  /// **'This comparison can no longer be shown'**
  String get compareSharedNoResultTitle;

  /// No description provided for @compareSharedNotFoundMessage.
  ///
  /// In en, this message translates to:
  /// **'This link is invalid, or the comparison was deleted or unpublished.'**
  String get compareSharedNotFoundMessage;

  /// No description provided for @compareSharedNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Comparison not found'**
  String get compareSharedNotFoundTitle;

  /// No description provided for @compareSharedTitle.
  ///
  /// In en, this message translates to:
  /// **'Shared comparison'**
  String get compareSharedTitle;

  /// No description provided for @compareShowAllRows.
  ///
  /// In en, this message translates to:
  /// **'Show all rows'**
  String get compareShowAllRows;

  /// No description provided for @compareSlotFacts.
  ///
  /// In en, this message translates to:
  /// **'{year} · {market}'**
  String compareSlotFacts(String year, String market);

  /// No description provided for @compareSocWindow.
  ///
  /// In en, this message translates to:
  /// **'{window} charge'**
  String compareSocWindow(String window);

  /// No description provided for @compareSomeUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Some cars are no longer available'**
  String get compareSomeUnavailable;

  /// No description provided for @compareSponsoredWarning.
  ///
  /// In en, this message translates to:
  /// **'This result was not confirmed as free of sponsorship. Treat it with caution.'**
  String get compareSponsoredWarning;

  /// No description provided for @compareStars.
  ///
  /// In en, this message translates to:
  /// **'{stars} stars'**
  String compareStars(String stars);

  /// No description provided for @compareStatusComparable.
  ///
  /// In en, this message translates to:
  /// **'Comparable'**
  String get compareStatusComparable;

  /// No description provided for @compareStatusConditions.
  ///
  /// In en, this message translates to:
  /// **'Different test conditions — no winner'**
  String get compareStatusConditions;

  /// No description provided for @compareStatusCurrency.
  ///
  /// In en, this message translates to:
  /// **'Different currencies — no winner'**
  String get compareStatusCurrency;

  /// No description provided for @compareStatusCycles.
  ///
  /// In en, this message translates to:
  /// **'Different test cycles — no winner'**
  String get compareStatusCycles;

  /// No description provided for @compareStatusMissing.
  ///
  /// In en, this message translates to:
  /// **'Missing data — no winner'**
  String get compareStatusMissing;

  /// No description provided for @compareStatusNotApplicable.
  ///
  /// In en, this message translates to:
  /// **'Not applicable to every car'**
  String get compareStatusNotApplicable;

  /// No description provided for @compareStatusSocWindow.
  ///
  /// In en, this message translates to:
  /// **'Different charge windows — no winner'**
  String get compareStatusSocWindow;

  /// No description provided for @compareStatusUnknown.
  ///
  /// In en, this message translates to:
  /// **'Not decided'**
  String get compareStatusUnknown;

  /// No description provided for @compareSummaryTitle.
  ///
  /// In en, this message translates to:
  /// **'At a glance'**
  String get compareSummaryTitle;

  /// No description provided for @compareTitle.
  ///
  /// In en, this message translates to:
  /// **'Comparisons'**
  String get compareTitle;

  /// No description provided for @compareTrayFull.
  ///
  /// In en, this message translates to:
  /// **'The comparison is full ({max} cars). Remove a car to add another.'**
  String compareTrayFull(int max);

  /// No description provided for @compareUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 car is no longer available} other{{count} cars are no longer available}}'**
  String compareUnavailableTitle(int count);

  /// No description provided for @compareUnitInch.
  ///
  /// In en, this message translates to:
  /// **'in'**
  String get compareUnitInch;

  /// No description provided for @compareUnitLitersPer100.
  ///
  /// In en, this message translates to:
  /// **'L/100 km'**
  String get compareUnitLitersPer100;

  /// No description provided for @compareValueDetailsHint.
  ///
  /// In en, this message translates to:
  /// **'Shows the source and measuring conditions'**
  String get compareValueDetailsHint;

  /// No description provided for @compareViewDetailed.
  ///
  /// In en, this message translates to:
  /// **'Detailed'**
  String get compareViewDetailed;

  /// No description provided for @compareViewLabel.
  ///
  /// In en, this message translates to:
  /// **'Comparison view'**
  String get compareViewLabel;

  /// No description provided for @compareViewSummary.
  ///
  /// In en, this message translates to:
  /// **'Summary'**
  String get compareViewSummary;

  /// No description provided for @compareWheelSize.
  ///
  /// In en, this message translates to:
  /// **'{size}-inch wheels'**
  String compareWheelSize(String size);

  /// No description provided for @compareYears.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 year} other{{count} years}}'**
  String compareYears(int count);

  /// No description provided for @compareYes.
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get compareYes;

  /// No description provided for @encyclopediaAllCategories.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get encyclopediaAllCategories;

  /// No description provided for @encyclopediaBrowseAll.
  ///
  /// In en, this message translates to:
  /// **'Browse the encyclopedia'**
  String get encyclopediaBrowseAll;

  /// No description provided for @encyclopediaClearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get encyclopediaClearFilters;

  /// No description provided for @encyclopediaEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Guides appear here after a technical specialist has reviewed them.'**
  String get encyclopediaEmptyMessage;

  /// No description provided for @encyclopediaEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No guides yet'**
  String get encyclopediaEmptyTitle;

  /// No description provided for @encyclopediaEntryTitle.
  ///
  /// In en, this message translates to:
  /// **'Encyclopedia entry'**
  String get encyclopediaEntryTitle;

  /// No description provided for @encyclopediaIntro.
  ///
  /// In en, this message translates to:
  /// **'Beginner guides to car types, connectors, batteries, range standards, home and fast charging, warranty and used-car checks.'**
  String get encyclopediaIntro;

  /// No description provided for @encyclopediaLanguageAr.
  ///
  /// In en, this message translates to:
  /// **'Arabic'**
  String get encyclopediaLanguageAr;

  /// No description provided for @encyclopediaLanguageEn.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get encyclopediaLanguageEn;

  /// No description provided for @encyclopediaNoMatchesMessage.
  ///
  /// In en, this message translates to:
  /// **'Try another word or category.'**
  String get encyclopediaNoMatchesMessage;

  /// No description provided for @encyclopediaNoMatchesTitle.
  ///
  /// In en, this message translates to:
  /// **'No matching guides'**
  String get encyclopediaNoMatchesTitle;

  /// No description provided for @encyclopediaNotFoundMessage.
  ///
  /// In en, this message translates to:
  /// **'It may have been removed or is being updated after a new technical review.'**
  String get encyclopediaNotFoundMessage;

  /// No description provided for @encyclopediaNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'This guide isn\'t available'**
  String get encyclopediaNotFoundTitle;

  /// No description provided for @encyclopediaNotReviewedExplain.
  ///
  /// In en, this message translates to:
  /// **'This guide has no technical review information.'**
  String get encyclopediaNotReviewedExplain;

  /// No description provided for @encyclopediaReadingMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes, plural, =1{1 min read} other{{formatted} min read}}'**
  String encyclopediaReadingMinutes(int minutes, String formatted);

  /// No description provided for @encyclopediaRelated.
  ///
  /// In en, this message translates to:
  /// **'Related guides'**
  String get encyclopediaRelated;

  /// No description provided for @encyclopediaReviewPolicy.
  ///
  /// In en, this message translates to:
  /// **'Only guides that passed a technical review are published. For any electrical work, use a qualified electrician.'**
  String get encyclopediaReviewPolicy;

  /// No description provided for @encyclopediaReviewed.
  ///
  /// In en, this message translates to:
  /// **'Technically reviewed'**
  String get encyclopediaReviewed;

  /// No description provided for @encyclopediaReviewedExplain.
  ///
  /// In en, this message translates to:
  /// **'A technical specialist checked this guide against a safety checklist before it was published. It is general information, not a substitute for a qualified electrician or the manufacturer.'**
  String get encyclopediaReviewedExplain;

  /// No description provided for @encyclopediaReviewedOn.
  ///
  /// In en, this message translates to:
  /// **'{label} · {date}'**
  String encyclopediaReviewedOn(String label, String date);

  /// No description provided for @encyclopediaSafetyTitle.
  ///
  /// In en, this message translates to:
  /// **'Electrical safety'**
  String get encyclopediaSafetyTitle;

  /// No description provided for @encyclopediaSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search the encyclopedia'**
  String get encyclopediaSearchHint;

  /// No description provided for @encyclopediaShownInLanguage.
  ///
  /// In en, this message translates to:
  /// **'Shown in {language}'**
  String encyclopediaShownInLanguage(String language);

  /// No description provided for @encyclopediaTitle.
  ///
  /// In en, this message translates to:
  /// **'EV encyclopedia'**
  String get encyclopediaTitle;

  /// No description provided for @favoritesBrowseCars.
  ///
  /// In en, this message translates to:
  /// **'Browse cars'**
  String get favoritesBrowseCars;

  /// No description provided for @favoritesBrowseComparisons.
  ///
  /// In en, this message translates to:
  /// **'Compare cars'**
  String get favoritesBrowseComparisons;

  /// No description provided for @favoritesBrowseNews.
  ///
  /// In en, this message translates to:
  /// **'Browse news'**
  String get favoritesBrowseNews;

  /// No description provided for @favoritesBrowseStations.
  ///
  /// In en, this message translates to:
  /// **'Find stations'**
  String get favoritesBrowseStations;

  /// No description provided for @favoritesDeleteOffline.
  ///
  /// In en, this message translates to:
  /// **'Delete offline copy'**
  String get favoritesDeleteOffline;

  /// No description provided for @favoritesDeviceOnly.
  ///
  /// In en, this message translates to:
  /// **'Favorites are saved on this device only.'**
  String get favoritesDeviceOnly;

  /// No description provided for @favoritesEmptyArticlesMessage.
  ///
  /// In en, this message translates to:
  /// **'Tap the heart on any article to find it here later.'**
  String get favoritesEmptyArticlesMessage;

  /// No description provided for @favoritesEmptyArticlesTitle.
  ///
  /// In en, this message translates to:
  /// **'No favorite articles yet'**
  String get favoritesEmptyArticlesTitle;

  /// No description provided for @favoritesEmptyCarsMessage.
  ///
  /// In en, this message translates to:
  /// **'Save models, trims and 360° tours with the heart button.'**
  String get favoritesEmptyCarsMessage;

  /// No description provided for @favoritesEmptyCarsTitle.
  ///
  /// In en, this message translates to:
  /// **'No favorite cars yet'**
  String get favoritesEmptyCarsTitle;

  /// No description provided for @favoritesEmptyComparisonsMessage.
  ///
  /// In en, this message translates to:
  /// **'Save a comparison to come back to it quickly.'**
  String get favoritesEmptyComparisonsMessage;

  /// No description provided for @favoritesEmptyComparisonsTitle.
  ///
  /// In en, this message translates to:
  /// **'No favorite comparisons yet'**
  String get favoritesEmptyComparisonsTitle;

  /// No description provided for @favoritesEmptyStationsMessage.
  ///
  /// In en, this message translates to:
  /// **'Save the stations you use often.'**
  String get favoritesEmptyStationsMessage;

  /// No description provided for @favoritesEmptyStationsTitle.
  ///
  /// In en, this message translates to:
  /// **'No favorite stations yet'**
  String get favoritesEmptyStationsTitle;

  /// No description provided for @favoritesGuestHint.
  ///
  /// In en, this message translates to:
  /// **'Saved on this device. Sign in to keep them in your account on every device.'**
  String get favoritesGuestHint;

  /// No description provided for @favoritesLocalOnly.
  ///
  /// In en, this message translates to:
  /// **'On this device only'**
  String get favoritesLocalOnly;

  /// No description provided for @favoritesRemoved.
  ///
  /// In en, this message translates to:
  /// **'Removed “{title}”'**
  String favoritesRemoved(String title);

  /// No description provided for @favoritesSavedArticlesTitle.
  ///
  /// In en, this message translates to:
  /// **'Articles'**
  String get favoritesSavedArticlesTitle;

  /// No description provided for @favoritesSavedAt.
  ///
  /// In en, this message translates to:
  /// **'Saved {time}'**
  String favoritesSavedAt(String time);

  /// No description provided for @favoritesSavedOfflineIntro.
  ///
  /// In en, this message translates to:
  /// **'Content you saved to read without a connection, with the date it was saved. It may have changed since.'**
  String get favoritesSavedOfflineIntro;

  /// No description provided for @favoritesSavedOfflineTitle.
  ///
  /// In en, this message translates to:
  /// **'Saved for offline reading'**
  String get favoritesSavedOfflineTitle;

  /// No description provided for @favoritesSavedSpecsTitle.
  ///
  /// In en, this message translates to:
  /// **'Spec sheets'**
  String get favoritesSavedSpecsTitle;

  /// No description provided for @favoritesSyncFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t sync with your account.'**
  String get favoritesSyncFailed;

  /// No description provided for @favoritesSyncing.
  ///
  /// In en, this message translates to:
  /// **'Syncing with your account…'**
  String get favoritesSyncing;

  /// No description provided for @favoritesTabArticles.
  ///
  /// In en, this message translates to:
  /// **'Articles'**
  String get favoritesTabArticles;

  /// No description provided for @favoritesTabCars.
  ///
  /// In en, this message translates to:
  /// **'Cars'**
  String get favoritesTabCars;

  /// No description provided for @favoritesTabComparisons.
  ///
  /// In en, this message translates to:
  /// **'Comparisons'**
  String get favoritesTabComparisons;

  /// No description provided for @favoritesTabStations.
  ///
  /// In en, this message translates to:
  /// **'Stations'**
  String get favoritesTabStations;

  /// No description provided for @favoritesTitle.
  ///
  /// In en, this message translates to:
  /// **'Favorites'**
  String get favoritesTitle;

  /// No description provided for @favoritesUnavailable.
  ///
  /// In en, this message translates to:
  /// **'No longer available'**
  String get favoritesUnavailable;

  /// No description provided for @favoritesUndo.
  ///
  /// In en, this message translates to:
  /// **'Undo'**
  String get favoritesUndo;

  /// No description provided for @garageAddButton.
  ///
  /// In en, this message translates to:
  /// **'Add to my garage'**
  String get garageAddButton;

  /// No description provided for @garageAddFirst.
  ///
  /// In en, this message translates to:
  /// **'Add my first car'**
  String get garageAddFirst;

  /// No description provided for @garageAddLog.
  ///
  /// In en, this message translates to:
  /// **'Add a charging session'**
  String get garageAddLog;

  /// No description provided for @garageAddReminder.
  ///
  /// In en, this message translates to:
  /// **'Add a reminder'**
  String get garageAddReminder;

  /// No description provided for @garageAddTitle.
  ///
  /// In en, this message translates to:
  /// **'Add a car'**
  String get garageAddTitle;

  /// No description provided for @garageAdded.
  ///
  /// In en, this message translates to:
  /// **'Car added to your garage.'**
  String get garageAdded;

  /// No description provided for @garageBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get garageBack;

  /// No description provided for @garageCarSection.
  ///
  /// In en, this message translates to:
  /// **'Car'**
  String get garageCarSection;

  /// No description provided for @garageCarSectionHint.
  ///
  /// In en, this message translates to:
  /// **'Pick the exact trim from the catalog, so specs and compatibility are right.'**
  String get garageCarSectionHint;

  /// No description provided for @garageChangeCar.
  ///
  /// In en, this message translates to:
  /// **'Tap to change'**
  String get garageChangeCar;

  /// No description provided for @garageChooseCar.
  ///
  /// In en, this message translates to:
  /// **'Choose brand, model, year and trim'**
  String get garageChooseCar;

  /// No description provided for @garageClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get garageClear;

  /// No description provided for @garageCount.
  ///
  /// In en, this message translates to:
  /// **'{count} of {max} cars'**
  String garageCount(int count, int max);

  /// No description provided for @garageCurrentOdometer.
  ///
  /// In en, this message translates to:
  /// **'Current odometer'**
  String get garageCurrentOdometer;

  /// No description provided for @garageCurrentOdometerHint.
  ///
  /// In en, this message translates to:
  /// **'Optional. It also updates automatically from your charging log entries.'**
  String get garageCurrentOdometerHint;

  /// No description provided for @garageDelete.
  ///
  /// In en, this message translates to:
  /// **'Remove from garage'**
  String get garageDelete;

  /// No description provided for @garageDeleteConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'Its charging log entries and reminders will be deleted too. This cannot be undone.'**
  String get garageDeleteConfirmMessage;

  /// No description provided for @garageDeleteConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove {name}?'**
  String garageDeleteConfirmTitle(String name);

  /// No description provided for @garageDeleted.
  ///
  /// In en, this message translates to:
  /// **'Car removed.'**
  String get garageDeleted;

  /// No description provided for @garageDetailsSection.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get garageDetailsSection;

  /// No description provided for @garageEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit car'**
  String get garageEditTitle;

  /// No description provided for @garageEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Add your car by choosing its brand, model, model year and trim. You can save up to 20 cars.'**
  String get garageEmptyMessage;

  /// No description provided for @garageEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Your garage is empty'**
  String get garageEmptyTitle;

  /// No description provided for @garageErrorCurrentBelowInitial.
  ///
  /// In en, this message translates to:
  /// **'The current reading cannot be lower than the reading at purchase.'**
  String get garageErrorCurrentBelowInitial;

  /// No description provided for @garageErrorNegative.
  ///
  /// In en, this message translates to:
  /// **'Cannot be negative.'**
  String get garageErrorNegative;

  /// No description provided for @garageErrorNumber.
  ///
  /// In en, this message translates to:
  /// **'Enter a number.'**
  String get garageErrorNumber;

  /// No description provided for @garageErrorPickCar.
  ///
  /// In en, this message translates to:
  /// **'Choose the car first.'**
  String get garageErrorPickCar;

  /// No description provided for @garageGuestMessage.
  ///
  /// In en, this message translates to:
  /// **'Sign in to save your cars with their exact trim and market, and use them in the charging log, reminders and calculators.'**
  String get garageGuestMessage;

  /// No description provided for @garageInitialOdometer.
  ///
  /// In en, this message translates to:
  /// **'Odometer at purchase'**
  String get garageInitialOdometer;

  /// No description provided for @garageInitialOdometerHint.
  ///
  /// In en, this message translates to:
  /// **'Optional. Used as the starting point of distance reports.'**
  String get garageInitialOdometerHint;

  /// No description provided for @garageLimitReached.
  ///
  /// In en, this message translates to:
  /// **'You can save up to {max} cars. Remove one to add another.'**
  String garageLimitReached(int max);

  /// No description provided for @garageLogsCount.
  ///
  /// In en, this message translates to:
  /// **'Charging sessions'**
  String get garageLogsCount;

  /// No description provided for @garageMakePrimary.
  ///
  /// In en, this message translates to:
  /// **'Make it my primary car'**
  String get garageMakePrimary;

  /// No description provided for @garageMarket.
  ///
  /// In en, this message translates to:
  /// **'Market'**
  String get garageMarket;

  /// No description provided for @garageMarketHint.
  ///
  /// In en, this message translates to:
  /// **'The country where the car is used. Prices, currency and compatibility follow this market.'**
  String get garageMarketHint;

  /// No description provided for @garageModelYear.
  ///
  /// In en, this message translates to:
  /// **'Model year'**
  String get garageModelYear;

  /// No description provided for @garageNickname.
  ///
  /// In en, this message translates to:
  /// **'Nickname'**
  String get garageNickname;

  /// No description provided for @garageNicknameHint.
  ///
  /// In en, this message translates to:
  /// **'Optional, e.g. \"Family car\".'**
  String get garageNicknameHint;

  /// No description provided for @garageNotListedExplain.
  ///
  /// In en, this message translates to:
  /// **'This trim has no record in {market}. Local prices and charger compatibility for {market} are therefore not available for it.'**
  String garageNotListedExplain(String market);

  /// No description provided for @garageNotListedShort.
  ///
  /// In en, this message translates to:
  /// **'Not sold in this market'**
  String get garageNotListedShort;

  /// No description provided for @garageNotes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get garageNotes;

  /// No description provided for @garageOdometer.
  ///
  /// In en, this message translates to:
  /// **'Odometer'**
  String get garageOdometer;

  /// No description provided for @garageOpenCalculators.
  ///
  /// In en, this message translates to:
  /// **'Calculators'**
  String get garageOpenCalculators;

  /// No description provided for @garageOpenLogs.
  ///
  /// In en, this message translates to:
  /// **'Charging log of this car'**
  String get garageOpenLogs;

  /// No description provided for @garageOpenSpecs.
  ///
  /// In en, this message translates to:
  /// **'Full specifications'**
  String get garageOpenSpecs;

  /// No description provided for @garageOptional.
  ///
  /// In en, this message translates to:
  /// **'Optional'**
  String get garageOptional;

  /// No description provided for @garagePickerAllMarkets.
  ///
  /// In en, this message translates to:
  /// **'Show trims from all markets'**
  String get garagePickerAllMarkets;

  /// No description provided for @garagePickerAllMarketsHint.
  ///
  /// In en, this message translates to:
  /// **'For imported cars not sold in your market.'**
  String get garagePickerAllMarketsHint;

  /// No description provided for @garagePickerEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing to choose here yet'**
  String get garagePickerEmpty;

  /// No description provided for @garagePickerProgress.
  ///
  /// In en, this message translates to:
  /// **'Step {step} of {total}'**
  String garagePickerProgress(int step, int total);

  /// No description provided for @garagePickerSearchBrand.
  ///
  /// In en, this message translates to:
  /// **'Search brands'**
  String get garagePickerSearchBrand;

  /// No description provided for @garagePickerSearchModel.
  ///
  /// In en, this message translates to:
  /// **'Search models'**
  String get garagePickerSearchModel;

  /// No description provided for @garagePickerStepBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get garagePickerStepBrand;

  /// No description provided for @garagePickerStepModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get garagePickerStepModel;

  /// No description provided for @garagePickerStepTrim.
  ///
  /// In en, this message translates to:
  /// **'Trim'**
  String get garagePickerStepTrim;

  /// No description provided for @garagePickerStepYear.
  ///
  /// In en, this message translates to:
  /// **'Year'**
  String get garagePickerStepYear;

  /// No description provided for @garagePickerTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose your car'**
  String get garagePickerTitle;

  /// No description provided for @garagePrimary.
  ///
  /// In en, this message translates to:
  /// **'Primary'**
  String get garagePrimary;

  /// No description provided for @garagePrimarySet.
  ///
  /// In en, this message translates to:
  /// **'Primary car updated.'**
  String get garagePrimarySet;

  /// No description provided for @garagePrimarySwitch.
  ///
  /// In en, this message translates to:
  /// **'Primary car'**
  String get garagePrimarySwitch;

  /// No description provided for @garagePrimarySwitchHint.
  ///
  /// In en, this message translates to:
  /// **'Used by default in calculators, reports and trip planning.'**
  String get garagePrimarySwitchHint;

  /// No description provided for @garagePurchaseDate.
  ///
  /// In en, this message translates to:
  /// **'Purchase date'**
  String get garagePurchaseDate;

  /// No description provided for @garageRemindersCount.
  ///
  /// In en, this message translates to:
  /// **'Open reminders'**
  String get garageRemindersCount;

  /// No description provided for @garageSaved.
  ///
  /// In en, this message translates to:
  /// **'Changes saved.'**
  String get garageSaved;

  /// No description provided for @garageShortcutsSection.
  ///
  /// In en, this message translates to:
  /// **'Use this car'**
  String get garageShortcutsSection;

  /// No description provided for @garageTitle.
  ///
  /// In en, this message translates to:
  /// **'My garage'**
  String get garageTitle;

  /// No description provided for @garageTrim.
  ///
  /// In en, this message translates to:
  /// **'Trim'**
  String get garageTrim;

  /// No description provided for @garageVehicleTitle.
  ///
  /// In en, this message translates to:
  /// **'My car'**
  String get garageVehicleTitle;

  /// No description provided for @homeAllTours.
  ///
  /// In en, this message translates to:
  /// **'All 360° tours'**
  String get homeAllTours;

  /// No description provided for @homeChangePlace.
  ///
  /// In en, this message translates to:
  /// **'Change'**
  String get homeChangePlace;

  /// No description provided for @homeChargingGuides.
  ///
  /// In en, this message translates to:
  /// **'Charging & maintenance guides'**
  String get homeChargingGuides;

  /// No description provided for @homeChooseCity.
  ///
  /// In en, this message translates to:
  /// **'Choose a city'**
  String get homeChooseCity;

  /// No description provided for @homeEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Nothing has been published for your country and language yet. Pull to refresh later.'**
  String get homeEmptyMessage;

  /// No description provided for @homeEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Content is on its way'**
  String get homeEmptyTitle;

  /// No description provided for @homeExploreBrands.
  ///
  /// In en, this message translates to:
  /// **'Brands'**
  String get homeExploreBrands;

  /// No description provided for @homeExploreCalculators.
  ///
  /// In en, this message translates to:
  /// **'Calculators'**
  String get homeExploreCalculators;

  /// No description provided for @homeExploreEncyclopedia.
  ///
  /// In en, this message translates to:
  /// **'EV encyclopedia'**
  String get homeExploreEncyclopedia;

  /// No description provided for @homeExploreNews.
  ///
  /// In en, this message translates to:
  /// **'All news'**
  String get homeExploreNews;

  /// No description provided for @homeExploreServices.
  ///
  /// In en, this message translates to:
  /// **'Services directory'**
  String get homeExploreServices;

  /// No description provided for @homeExploreTitle.
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get homeExploreTitle;

  /// No description provided for @homeExploreTours.
  ///
  /// In en, this message translates to:
  /// **'360° tours'**
  String get homeExploreTours;

  /// No description provided for @homeFeaturedComparisons.
  ///
  /// In en, this message translates to:
  /// **'Featured comparisons'**
  String get homeFeaturedComparisons;

  /// No description provided for @homeForYou.
  ///
  /// In en, this message translates to:
  /// **'For you'**
  String get homeForYou;

  /// No description provided for @homeInteriorTours.
  ///
  /// In en, this message translates to:
  /// **'360° interior tours'**
  String get homeInteriorTours;

  /// No description provided for @homeLatestNews.
  ///
  /// In en, this message translates to:
  /// **'Latest news'**
  String get homeLatestNews;

  /// No description provided for @homeNearbyAround.
  ///
  /// In en, this message translates to:
  /// **'Around: {place}'**
  String homeNearbyAround(String place);

  /// No description provided for @homeNearbyEmpty.
  ///
  /// In en, this message translates to:
  /// **'No published stations within 25 km of this place yet.'**
  String get homeNearbyEmpty;

  /// No description provided for @homeNearbyPromptMessage.
  ///
  /// In en, this message translates to:
  /// **'Allow location access or choose a city. Your location is only used for this search and is never stored.'**
  String get homeNearbyPromptMessage;

  /// No description provided for @homeNearbyPromptTitle.
  ///
  /// In en, this message translates to:
  /// **'See charging stations near you'**
  String get homeNearbyPromptTitle;

  /// No description provided for @homeNearbyStations.
  ///
  /// In en, this message translates to:
  /// **'Charging stations nearby'**
  String get homeNearbyStations;

  /// No description provided for @homeNewCars.
  ///
  /// In en, this message translates to:
  /// **'New cars'**
  String get homeNewCars;

  /// No description provided for @homeRefreshFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t refresh. Showing the last loaded content.'**
  String get homeRefreshFailed;

  /// No description provided for @homeReviews.
  ///
  /// In en, this message translates to:
  /// **'Reviews'**
  String get homeReviews;

  /// No description provided for @homeSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search news, cars, stations…'**
  String get homeSearchHint;

  /// No description provided for @homeSectionUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This section couldn\'t load right now.'**
  String get homeSectionUnavailable;

  /// No description provided for @homeTitle.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get homeTitle;

  /// No description provided for @homeTopStory.
  ///
  /// In en, this message translates to:
  /// **'Top story'**
  String get homeTopStory;

  /// No description provided for @homeToursIntro.
  ///
  /// In en, this message translates to:
  /// **'Step inside the cabin and look around, seat by seat.'**
  String get homeToursIntro;

  /// No description provided for @homeUseMyLocation.
  ///
  /// In en, this message translates to:
  /// **'Use my location'**
  String get homeUseMyLocation;

  /// No description provided for @newsAllMarkets.
  ///
  /// In en, this message translates to:
  /// **'News from all markets'**
  String get newsAllMarkets;

  /// No description provided for @newsAllMarketsHint.
  ///
  /// In en, this message translates to:
  /// **'Off: only news for {market} and news for every market.'**
  String newsAllMarketsHint(String market);

  /// No description provided for @newsArticleTitle.
  ///
  /// In en, this message translates to:
  /// **'Article'**
  String get newsArticleTitle;

  /// No description provided for @newsArticlesInCategory.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 article} other{{count} articles}}'**
  String newsArticlesInCategory(int count);

  /// No description provided for @newsBackToTop.
  ///
  /// In en, this message translates to:
  /// **'Back to top'**
  String get newsBackToTop;

  /// No description provided for @newsBrowseAll.
  ///
  /// In en, this message translates to:
  /// **'Browse all news'**
  String get newsBrowseAll;

  /// No description provided for @newsByAuthor.
  ///
  /// In en, this message translates to:
  /// **'By {name}'**
  String newsByAuthor(String name);

  /// No description provided for @newsCategoriesLabel.
  ///
  /// In en, this message translates to:
  /// **'News categories'**
  String get newsCategoriesLabel;

  /// No description provided for @newsCategoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get newsCategoryTitle;

  /// No description provided for @newsClearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get newsClearFilters;

  /// No description provided for @newsComments.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get newsComments;

  /// No description provided for @newsCorrectionKindClarification.
  ///
  /// In en, this message translates to:
  /// **'Clarification'**
  String get newsCorrectionKindClarification;

  /// No description provided for @newsCorrectionKindCorrection.
  ///
  /// In en, this message translates to:
  /// **'Correction'**
  String get newsCorrectionKindCorrection;

  /// No description provided for @newsCorrectionKindUpdate.
  ///
  /// In en, this message translates to:
  /// **'Update'**
  String get newsCorrectionKindUpdate;

  /// No description provided for @newsCorrectionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Corrections and updates'**
  String get newsCorrectionsTitle;

  /// No description provided for @newsCoverCaption.
  ///
  /// In en, this message translates to:
  /// **'Cover image'**
  String get newsCoverCaption;

  /// No description provided for @newsEmptyFilteredMessage.
  ///
  /// In en, this message translates to:
  /// **'No articles match these filters.'**
  String get newsEmptyFilteredMessage;

  /// No description provided for @newsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Nothing has been published here yet. Check back later.'**
  String get newsEmptyMessage;

  /// No description provided for @newsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No articles yet'**
  String get newsEmptyTitle;

  /// No description provided for @newsEndOfFeed.
  ///
  /// In en, this message translates to:
  /// **'You\'re all caught up'**
  String get newsEndOfFeed;

  /// No description provided for @newsEventDate.
  ///
  /// In en, this message translates to:
  /// **'Event date: {date}'**
  String newsEventDate(String date);

  /// No description provided for @newsExternalLinkInsecure.
  ///
  /// In en, this message translates to:
  /// **'This link is not encrypted (http).'**
  String get newsExternalLinkInsecure;

  /// No description provided for @newsExternalLinkMessage.
  ///
  /// In en, this message translates to:
  /// **'You\'re leaving EV Car News to open {host}.'**
  String newsExternalLinkMessage(String host);

  /// No description provided for @newsExternalLinkTitle.
  ///
  /// In en, this message translates to:
  /// **'Open an external link?'**
  String get newsExternalLinkTitle;

  /// No description provided for @newsFallbackNotice.
  ///
  /// In en, this message translates to:
  /// **'Not available in {requested} yet, so it is shown in {served}.'**
  String newsFallbackNotice(String requested, String served);

  /// No description provided for @newsFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get newsFilterAll;

  /// No description provided for @newsFilterSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved offline'**
  String get newsFilterSaved;

  /// No description provided for @newsFiltersTitle.
  ///
  /// In en, this message translates to:
  /// **'Filter news'**
  String get newsFiltersTitle;

  /// No description provided for @newsFontLarger.
  ///
  /// In en, this message translates to:
  /// **'Larger text'**
  String get newsFontLarger;

  /// No description provided for @newsFontScaleValue.
  ///
  /// In en, this message translates to:
  /// **'Text size {percent}'**
  String newsFontScaleValue(String percent);

  /// No description provided for @newsFontSize.
  ///
  /// In en, this message translates to:
  /// **'Text size'**
  String get newsFontSize;

  /// No description provided for @newsFontSmaller.
  ///
  /// In en, this message translates to:
  /// **'Smaller text'**
  String get newsFontSmaller;

  /// No description provided for @newsImageLicense.
  ///
  /// In en, this message translates to:
  /// **'Licence'**
  String get newsImageLicense;

  /// No description provided for @newsImageOpen.
  ///
  /// In en, this message translates to:
  /// **'Open image'**
  String get newsImageOpen;

  /// No description provided for @newsImageSource.
  ///
  /// In en, this message translates to:
  /// **'Image source'**
  String get newsImageSource;

  /// No description provided for @newsImageViewerHint.
  ///
  /// In en, this message translates to:
  /// **'Pinch or double-tap to zoom.'**
  String get newsImageViewerHint;

  /// No description provided for @newsLanguageAr.
  ///
  /// In en, this message translates to:
  /// **'Arabic'**
  String get newsLanguageAr;

  /// No description provided for @newsLanguageEn.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get newsLanguageEn;

  /// No description provided for @newsLineSpacing.
  ///
  /// In en, this message translates to:
  /// **'Line spacing'**
  String get newsLineSpacing;

  /// No description provided for @newsLineSpacingComfortable.
  ///
  /// In en, this message translates to:
  /// **'Comfortable'**
  String get newsLineSpacingComfortable;

  /// No description provided for @newsLineSpacingCompact.
  ///
  /// In en, this message translates to:
  /// **'Compact'**
  String get newsLineSpacingCompact;

  /// No description provided for @newsLineSpacingRelaxed.
  ///
  /// In en, this message translates to:
  /// **'Relaxed'**
  String get newsLineSpacingRelaxed;

  /// No description provided for @newsListTitle.
  ///
  /// In en, this message translates to:
  /// **'News'**
  String get newsListTitle;

  /// No description provided for @newsLoadMoreFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load more articles.'**
  String get newsLoadMoreFailed;

  /// No description provided for @newsLoadingMore.
  ///
  /// In en, this message translates to:
  /// **'Loading more articles'**
  String get newsLoadingMore;

  /// No description provided for @newsMachineTranslated.
  ///
  /// In en, this message translates to:
  /// **'Machine translation reviewed by an editor.'**
  String get newsMachineTranslated;

  /// No description provided for @newsMarketMismatch.
  ///
  /// In en, this message translates to:
  /// **'This article is aimed at other markets; details may not apply in {market}.'**
  String newsMarketMismatch(String market);

  /// No description provided for @newsNotFoundMessage.
  ///
  /// In en, this message translates to:
  /// **'It may have been removed or is not published yet.'**
  String get newsNotFoundMessage;

  /// No description provided for @newsNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Article not available'**
  String get newsNotFoundTitle;

  /// No description provided for @newsOfflineNoCopyMessage.
  ///
  /// In en, this message translates to:
  /// **'This article isn\'t saved on your device. Connect to the internet to read it.'**
  String get newsOfflineNoCopyMessage;

  /// No description provided for @newsOnlyMyLanguage.
  ///
  /// In en, this message translates to:
  /// **'Only articles in my language'**
  String get newsOnlyMyLanguage;

  /// No description provided for @newsOnlyMyLanguageHint.
  ///
  /// In en, this message translates to:
  /// **'Off: articles not translated yet are shown in their original language, with a label.'**
  String get newsOnlyMyLanguageHint;

  /// No description provided for @newsOpenLink.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get newsOpenLink;

  /// No description provided for @newsOpenSaved.
  ///
  /// In en, this message translates to:
  /// **'Open saved articles'**
  String get newsOpenSaved;

  /// No description provided for @newsPublishedOn.
  ///
  /// In en, this message translates to:
  /// **'Published {date}'**
  String newsPublishedOn(String date);

  /// No description provided for @newsReaderPreview.
  ///
  /// In en, this message translates to:
  /// **'This is how article text will look while you read.'**
  String get newsReaderPreview;

  /// No description provided for @newsReaderSettings.
  ///
  /// In en, this message translates to:
  /// **'Reading settings'**
  String get newsReaderSettings;

  /// No description provided for @newsReaderTheme.
  ///
  /// In en, this message translates to:
  /// **'Reading theme'**
  String get newsReaderTheme;

  /// No description provided for @newsReaderThemeApp.
  ///
  /// In en, this message translates to:
  /// **'Like the app'**
  String get newsReaderThemeApp;

  /// No description provided for @newsReaderThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get newsReaderThemeDark;

  /// No description provided for @newsReaderThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get newsReaderThemeLight;

  /// No description provided for @newsReadingTime.
  ///
  /// In en, this message translates to:
  /// **'{minutes, plural, =1{1 min read} other{{minutes} min read}}'**
  String newsReadingTime(int minutes);

  /// No description provided for @newsRelatedArticlesTitle.
  ///
  /// In en, this message translates to:
  /// **'Related articles'**
  String get newsRelatedArticlesTitle;

  /// No description provided for @newsRelatedCarsTitle.
  ///
  /// In en, this message translates to:
  /// **'Cars in this article'**
  String get newsRelatedCarsTitle;

  /// No description provided for @newsRemoveSaved.
  ///
  /// In en, this message translates to:
  /// **'Remove from saved'**
  String get newsRemoveSaved;

  /// No description provided for @newsRemoveSavedConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'It will no longer be available without internet.'**
  String get newsRemoveSavedConfirmMessage;

  /// No description provided for @newsRemoveSavedConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove this article?'**
  String get newsRemoveSavedConfirmTitle;

  /// No description provided for @newsRemovedSnack.
  ///
  /// In en, this message translates to:
  /// **'Removed from saved articles.'**
  String get newsRemovedSnack;

  /// No description provided for @newsSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t save the article. Please try again.'**
  String get newsSaveFailed;

  /// No description provided for @newsSaveOffline.
  ///
  /// In en, this message translates to:
  /// **'Save for offline reading'**
  String get newsSaveOffline;

  /// No description provided for @newsSavedCopyNotice.
  ///
  /// In en, this message translates to:
  /// **'Offline copy saved {time}. It may have changed since.'**
  String newsSavedCopyNotice(String time);

  /// No description provided for @newsSavedCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 article on this device} other{{count} articles on this device}}'**
  String newsSavedCount(int count);

  /// No description provided for @newsSavedEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Open an article and tap the download button to read it later without internet.'**
  String get newsSavedEmptyMessage;

  /// No description provided for @newsSavedEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No saved articles'**
  String get newsSavedEmptyTitle;

  /// No description provided for @newsSavedImagesPartial.
  ///
  /// In en, this message translates to:
  /// **'Some images weren\'t saved'**
  String get newsSavedImagesPartial;

  /// No description provided for @newsSavedOfflineState.
  ///
  /// In en, this message translates to:
  /// **'Saved for offline reading'**
  String get newsSavedOfflineState;

  /// No description provided for @newsSavedOn.
  ///
  /// In en, this message translates to:
  /// **'Saved {date}'**
  String newsSavedOn(String date);

  /// No description provided for @newsSavedSnack.
  ///
  /// In en, this message translates to:
  /// **'Saved. You can read it without internet.'**
  String get newsSavedSnack;

  /// No description provided for @newsSavedSnackPartial.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Saved, but 1 image couldn\'t be downloaded.} other{Saved, but {count} images couldn\'t be downloaded.}}'**
  String newsSavedSnackPartial(int count);

  /// No description provided for @newsSavingOffline.
  ///
  /// In en, this message translates to:
  /// **'Saving for offline reading…'**
  String get newsSavingOffline;

  /// No description provided for @newsSearch.
  ///
  /// In en, this message translates to:
  /// **'Search news'**
  String get newsSearch;

  /// No description provided for @newsShownInLanguage.
  ///
  /// In en, this message translates to:
  /// **'In {language}'**
  String newsShownInLanguage(String language);

  /// No description provided for @newsSortLatest.
  ///
  /// In en, this message translates to:
  /// **'Latest'**
  String get newsSortLatest;

  /// No description provided for @newsSortOldest.
  ///
  /// In en, this message translates to:
  /// **'Oldest'**
  String get newsSortOldest;

  /// No description provided for @newsSortPopular.
  ///
  /// In en, this message translates to:
  /// **'Most read'**
  String get newsSortPopular;

  /// No description provided for @newsSourceOpen.
  ///
  /// In en, this message translates to:
  /// **'Open the original source'**
  String get newsSourceOpen;

  /// No description provided for @newsSourceTitle.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get newsSourceTitle;

  /// No description provided for @newsTagHeader.
  ///
  /// In en, this message translates to:
  /// **'#{name}'**
  String newsTagHeader(String name);

  /// No description provided for @newsTagTitle.
  ///
  /// In en, this message translates to:
  /// **'Topic'**
  String get newsTagTitle;

  /// No description provided for @newsTagsTitle.
  ///
  /// In en, this message translates to:
  /// **'Topics'**
  String get newsTagsTitle;

  /// No description provided for @newsTypeAny.
  ///
  /// In en, this message translates to:
  /// **'All types'**
  String get newsTypeAny;

  /// No description provided for @newsTypeBuyingGuide.
  ///
  /// In en, this message translates to:
  /// **'Buying guides'**
  String get newsTypeBuyingGuide;

  /// No description provided for @newsTypeExplainer.
  ///
  /// In en, this message translates to:
  /// **'Explainers'**
  String get newsTypeExplainer;

  /// No description provided for @newsTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Content type'**
  String get newsTypeLabel;

  /// No description provided for @newsTypeNews.
  ///
  /// In en, this message translates to:
  /// **'News'**
  String get newsTypeNews;

  /// No description provided for @newsTypeOpinion.
  ///
  /// In en, this message translates to:
  /// **'Opinion'**
  String get newsTypeOpinion;

  /// No description provided for @newsTypeReview.
  ///
  /// In en, this message translates to:
  /// **'Reviews'**
  String get newsTypeReview;

  /// No description provided for @newsTypeTestDrive.
  ///
  /// In en, this message translates to:
  /// **'Test drives'**
  String get newsTypeTestDrive;

  /// No description provided for @newsUpdatedOn.
  ///
  /// In en, this message translates to:
  /// **'Updated {date}'**
  String newsUpdatedOn(String date);

  /// No description provided for @newsVehicleBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get newsVehicleBrand;

  /// No description provided for @newsVehicleModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get newsVehicleModel;

  /// No description provided for @newsVehicleModelYear.
  ///
  /// In en, this message translates to:
  /// **'Model year {year}'**
  String newsVehicleModelYear(String year);

  /// No description provided for @newsVideoGeneric.
  ///
  /// In en, this message translates to:
  /// **'the video site'**
  String get newsVideoGeneric;

  /// No description provided for @newsVideoOpensIn.
  ///
  /// In en, this message translates to:
  /// **'Opens in {provider}'**
  String newsVideoOpensIn(String provider);

  /// No description provided for @newsVideoPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Nothing is loaded from {provider} until you tap.'**
  String newsVideoPrivacy(String provider);

  /// No description provided for @newsWatchVideo.
  ///
  /// In en, this message translates to:
  /// **'Watch the video'**
  String get newsWatchVideo;

  /// No description provided for @notificationsActions.
  ///
  /// In en, this message translates to:
  /// **'More actions'**
  String get notificationsActions;

  /// No description provided for @notificationsChannelEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get notificationsChannelEmail;

  /// No description provided for @notificationsChannelEmailUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Not available yet.'**
  String get notificationsChannelEmailUnavailable;

  /// No description provided for @notificationsChannelInApp.
  ///
  /// In en, this message translates to:
  /// **'In the app'**
  String get notificationsChannelInApp;

  /// No description provided for @notificationsChannelInAppHint.
  ///
  /// In en, this message translates to:
  /// **'Always on: every notification is kept in this list.'**
  String get notificationsChannelInAppHint;

  /// No description provided for @notificationsChannelPush.
  ///
  /// In en, this message translates to:
  /// **'Push notifications'**
  String get notificationsChannelPush;

  /// No description provided for @notificationsChannelsSection.
  ///
  /// In en, this message translates to:
  /// **'How to reach me'**
  String get notificationsChannelsSection;

  /// No description provided for @notificationsChooseTopics.
  ///
  /// In en, this message translates to:
  /// **'Choose what to follow'**
  String get notificationsChooseTopics;

  /// No description provided for @notificationsDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get notificationsDelete;

  /// No description provided for @notificationsDeleted.
  ///
  /// In en, this message translates to:
  /// **'Notification deleted.'**
  String get notificationsDeleted;

  /// No description provided for @notificationsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Follow brands, models or news categories to hear when something new is published.'**
  String get notificationsEmptyMessage;

  /// No description provided for @notificationsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No notifications yet'**
  String get notificationsEmptyTitle;

  /// No description provided for @notificationsEmptyUnreadTitle.
  ///
  /// In en, this message translates to:
  /// **'You are all caught up'**
  String get notificationsEmptyUnreadTitle;

  /// No description provided for @notificationsFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get notificationsFilterAll;

  /// No description provided for @notificationsFilterUnread.
  ///
  /// In en, this message translates to:
  /// **'Unread'**
  String get notificationsFilterUnread;

  /// No description provided for @notificationsFollowBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get notificationsFollowBrand;

  /// No description provided for @notificationsFollowCategory.
  ///
  /// In en, this message translates to:
  /// **'News category'**
  String get notificationsFollowCategory;

  /// No description provided for @notificationsFollowMarket.
  ///
  /// In en, this message translates to:
  /// **'Market'**
  String get notificationsFollowMarket;

  /// No description provided for @notificationsFollowModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get notificationsFollowModel;

  /// No description provided for @notificationsFollowed.
  ///
  /// In en, this message translates to:
  /// **'Following {name}.'**
  String notificationsFollowed(String name);

  /// No description provided for @notificationsGuestMessage.
  ///
  /// In en, this message translates to:
  /// **'Sign in to get news about the brands, models and topics you follow.'**
  String get notificationsGuestMessage;

  /// No description provided for @notificationsLoadMore.
  ///
  /// In en, this message translates to:
  /// **'Load more'**
  String get notificationsLoadMore;

  /// No description provided for @notificationsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all as read'**
  String get notificationsMarkAllRead;

  /// No description provided for @notificationsMarkRead.
  ///
  /// In en, this message translates to:
  /// **'Mark as read'**
  String get notificationsMarkRead;

  /// No description provided for @notificationsMarkUnread.
  ///
  /// In en, this message translates to:
  /// **'Mark as unread'**
  String get notificationsMarkUnread;

  /// No description provided for @notificationsNew.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get notificationsNew;

  /// No description provided for @notificationsPreferencesTitle.
  ///
  /// In en, this message translates to:
  /// **'Notification preferences'**
  String get notificationsPreferencesTitle;

  /// No description provided for @notificationsPushActive.
  ///
  /// In en, this message translates to:
  /// **'Active on your registered devices.'**
  String get notificationsPushActive;

  /// No description provided for @notificationsPushDisabled.
  ///
  /// In en, this message translates to:
  /// **'Turned off by you.'**
  String get notificationsPushDisabled;

  /// No description provided for @notificationsPushNoDevice.
  ///
  /// In en, this message translates to:
  /// **'No device registered for push yet.'**
  String get notificationsPushNoDevice;

  /// No description provided for @notificationsPushNotConfigured.
  ///
  /// In en, this message translates to:
  /// **'Not available: the push service is not set up on the server yet. Notifications still appear in the app.'**
  String get notificationsPushNotConfigured;

  /// No description provided for @notificationsQuietChange.
  ///
  /// In en, this message translates to:
  /// **'Change times'**
  String get notificationsQuietChange;

  /// No description provided for @notificationsQuietEnabled.
  ///
  /// In en, this message translates to:
  /// **'Quiet hours'**
  String get notificationsQuietEnabled;

  /// No description provided for @notificationsQuietEnd.
  ///
  /// In en, this message translates to:
  /// **'Quiet until'**
  String get notificationsQuietEnd;

  /// No description provided for @notificationsQuietHint.
  ///
  /// In en, this message translates to:
  /// **'Push notifications wait until quiet hours end; they still appear in the app.'**
  String get notificationsQuietHint;

  /// No description provided for @notificationsQuietOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get notificationsQuietOff;

  /// No description provided for @notificationsQuietRange.
  ///
  /// In en, this message translates to:
  /// **'{start} – {end} ({zone})'**
  String notificationsQuietRange(String start, String end, String zone);

  /// No description provided for @notificationsQuietSection.
  ///
  /// In en, this message translates to:
  /// **'Quiet hours'**
  String get notificationsQuietSection;

  /// No description provided for @notificationsQuietStart.
  ///
  /// In en, this message translates to:
  /// **'Quiet from'**
  String get notificationsQuietStart;

  /// No description provided for @notificationsReminderNote.
  ///
  /// In en, this message translates to:
  /// **'Reminder alerts on this phone are set in Reminders.'**
  String get notificationsReminderNote;

  /// No description provided for @notificationsResume.
  ///
  /// In en, this message translates to:
  /// **'Resume notifications'**
  String get notificationsResume;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @notificationsTopicBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get notificationsTopicBrand;

  /// No description provided for @notificationsTopicCategory.
  ///
  /// In en, this message translates to:
  /// **'News category'**
  String get notificationsTopicCategory;

  /// No description provided for @notificationsTopicInMarket.
  ///
  /// In en, this message translates to:
  /// **'in {market}'**
  String notificationsTopicInMarket(String market);

  /// No description provided for @notificationsTopicMarket.
  ///
  /// In en, this message translates to:
  /// **'Market'**
  String get notificationsTopicMarket;

  /// No description provided for @notificationsTopicModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get notificationsTopicModel;

  /// No description provided for @notificationsTopicPriceAlert.
  ///
  /// In en, this message translates to:
  /// **'Price alert'**
  String get notificationsTopicPriceAlert;

  /// No description provided for @notificationsTopicStation.
  ///
  /// In en, this message translates to:
  /// **'Station'**
  String get notificationsTopicStation;

  /// No description provided for @notificationsTopicVariant.
  ///
  /// In en, this message translates to:
  /// **'Trim'**
  String get notificationsTopicVariant;

  /// No description provided for @notificationsTopicsEmpty.
  ///
  /// In en, this message translates to:
  /// **'You do not follow anything yet'**
  String get notificationsTopicsEmpty;

  /// No description provided for @notificationsTopicsHint.
  ///
  /// In en, this message translates to:
  /// **'News published about these is sent to you once, in your language.'**
  String get notificationsTopicsHint;

  /// No description provided for @notificationsTopicsSection.
  ///
  /// In en, this message translates to:
  /// **'Topics I follow'**
  String get notificationsTopicsSection;

  /// No description provided for @notificationsTypeCampaigns.
  ///
  /// In en, this message translates to:
  /// **'Announcements'**
  String get notificationsTypeCampaigns;

  /// No description provided for @notificationsTypeCommunity.
  ///
  /// In en, this message translates to:
  /// **'Community replies'**
  String get notificationsTypeCommunity;

  /// No description provided for @notificationsTypeNews.
  ///
  /// In en, this message translates to:
  /// **'News about what I follow'**
  String get notificationsTypeNews;

  /// No description provided for @notificationsTypePriceAlerts.
  ///
  /// In en, this message translates to:
  /// **'Price alerts'**
  String get notificationsTypePriceAlerts;

  /// No description provided for @notificationsTypeReminders.
  ///
  /// In en, this message translates to:
  /// **'Reminders'**
  String get notificationsTypeReminders;

  /// No description provided for @notificationsTypeStations.
  ///
  /// In en, this message translates to:
  /// **'Charging station alerts'**
  String get notificationsTypeStations;

  /// No description provided for @notificationsTypesHint.
  ///
  /// In en, this message translates to:
  /// **'Turning any type on resumes notifications.'**
  String get notificationsTypesHint;

  /// No description provided for @notificationsTypesSection.
  ///
  /// In en, this message translates to:
  /// **'What to notify me about'**
  String get notificationsTypesSection;

  /// No description provided for @notificationsUnfollow.
  ///
  /// In en, this message translates to:
  /// **'Stop following {name}'**
  String notificationsUnfollow(String name);

  /// No description provided for @notificationsUnsubscribeAll.
  ///
  /// In en, this message translates to:
  /// **'Unsubscribe from all'**
  String get notificationsUnsubscribeAll;

  /// No description provided for @notificationsUnsubscribeAllConfirm.
  ///
  /// In en, this message translates to:
  /// **'Unsubscribe from all notifications?'**
  String get notificationsUnsubscribeAllConfirm;

  /// No description provided for @notificationsUnsubscribeAllMessage.
  ///
  /// In en, this message translates to:
  /// **'You will not receive any notifications until you turn a type back on.'**
  String get notificationsUnsubscribeAllMessage;

  /// No description provided for @notificationsUnsubscribedAll.
  ///
  /// In en, this message translates to:
  /// **'You unsubscribed from all notifications. Nothing new will be sent until you resume.'**
  String get notificationsUnsubscribedAll;

  /// No description provided for @remindersAlertHint.
  ///
  /// In en, this message translates to:
  /// **'How early to be reminded.'**
  String get remindersAlertHint;

  /// No description provided for @remindersAlertSection.
  ///
  /// In en, this message translates to:
  /// **'Alert'**
  String get remindersAlertSection;

  /// No description provided for @remindersAlreadyCompleted.
  ///
  /// In en, this message translates to:
  /// **'This reminder is completed.'**
  String get remindersAlreadyCompleted;

  /// No description provided for @remindersCar.
  ///
  /// In en, this message translates to:
  /// **'Car'**
  String get remindersCar;

  /// No description provided for @remindersCarHint.
  ///
  /// In en, this message translates to:
  /// **'Needed for reminders by odometer.'**
  String get remindersCarHint;

  /// No description provided for @remindersChannelDescription.
  ///
  /// In en, this message translates to:
  /// **'Maintenance, insurance, licence and tyre reminders you created.'**
  String get remindersChannelDescription;

  /// No description provided for @remindersChannelName.
  ///
  /// In en, this message translates to:
  /// **'Car reminders'**
  String get remindersChannelName;

  /// No description provided for @remindersCompleteMessage.
  ///
  /// In en, this message translates to:
  /// **'The reminder moves to completed.'**
  String get remindersCompleteMessage;

  /// No description provided for @remindersCompleteRepeats.
  ///
  /// In en, this message translates to:
  /// **'This reminder repeats: the next one will be created automatically.'**
  String get remindersCompleteRepeats;

  /// No description provided for @remindersCompleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Mark as done?'**
  String get remindersCompleteTitle;

  /// No description provided for @remindersCompleted.
  ///
  /// In en, this message translates to:
  /// **'Done.'**
  String get remindersCompleted;

  /// No description provided for @remindersCompletedNext.
  ///
  /// In en, this message translates to:
  /// **'Done. Next one: {due}'**
  String remindersCompletedNext(String due);

  /// No description provided for @remindersDaysLate.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, =1{1 day late} other{{days} days late}}'**
  String remindersDaysLate(int days);

  /// No description provided for @remindersDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete reminder'**
  String get remindersDelete;

  /// No description provided for @remindersDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this reminder?'**
  String get remindersDeleteConfirm;

  /// No description provided for @remindersDeleteMessage.
  ///
  /// In en, this message translates to:
  /// **'Its phone notification will be cancelled too.'**
  String get remindersDeleteMessage;

  /// No description provided for @remindersDeleted.
  ///
  /// In en, this message translates to:
  /// **'Reminder deleted.'**
  String get remindersDeleted;

  /// No description provided for @remindersDeviceNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notify me on this phone'**
  String get remindersDeviceNotifications;

  /// No description provided for @remindersDeviceNotificationsOff.
  ///
  /// In en, this message translates to:
  /// **'Off. Reminders still appear here with their status.'**
  String get remindersDeviceNotificationsOff;

  /// No description provided for @remindersDeviceNotificationsOn.
  ///
  /// In en, this message translates to:
  /// **'You will get a notification on each reminder\'s alert day.'**
  String get remindersDeviceNotificationsOn;

  /// No description provided for @remindersDueAtKm.
  ///
  /// In en, this message translates to:
  /// **'at {km}'**
  String remindersDueAtKm(String km);

  /// No description provided for @remindersDueDate.
  ///
  /// In en, this message translates to:
  /// **'Due date'**
  String get remindersDueDate;

  /// No description provided for @remindersDueKm.
  ///
  /// In en, this message translates to:
  /// **'Due at odometer'**
  String get remindersDueKm;

  /// No description provided for @remindersDueKmNeedsCar.
  ///
  /// In en, this message translates to:
  /// **'Choose a car to use the odometer.'**
  String get remindersDueKmNeedsCar;

  /// No description provided for @remindersDueOn.
  ///
  /// In en, this message translates to:
  /// **'Due {date}'**
  String remindersDueOn(String date);

  /// No description provided for @remindersEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit reminder'**
  String get remindersEditTitle;

  /// No description provided for @remindersEmptyCompletedTitle.
  ///
  /// In en, this message translates to:
  /// **'No completed reminders yet'**
  String get remindersEmptyCompletedTitle;

  /// No description provided for @remindersEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Add a reminder for maintenance, insurance, licence renewal or tyres — by date, by odometer, or both.'**
  String get remindersEmptyMessage;

  /// No description provided for @remindersEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No reminders'**
  String get remindersEmptyTitle;

  /// No description provided for @remindersEnableAction.
  ///
  /// In en, this message translates to:
  /// **'Turn on'**
  String get remindersEnableAction;

  /// No description provided for @remindersEnableHint.
  ///
  /// In en, this message translates to:
  /// **'Turn on phone notifications to be alerted on time.'**
  String get remindersEnableHint;

  /// No description provided for @remindersErrorDue.
  ///
  /// In en, this message translates to:
  /// **'Enter a due date or an odometer reading.'**
  String get remindersErrorDue;

  /// No description provided for @remindersErrorRange.
  ///
  /// In en, this message translates to:
  /// **'Must be between {min} and {max}.'**
  String remindersErrorRange(int min, int max);

  /// No description provided for @remindersErrorTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter a title.'**
  String get remindersErrorTitle;

  /// No description provided for @remindersErrorVehicleForKm.
  ///
  /// In en, this message translates to:
  /// **'Choose a car for odometer reminders.'**
  String get remindersErrorVehicleForKm;

  /// No description provided for @remindersErrorWhole.
  ///
  /// In en, this message translates to:
  /// **'Enter a whole number.'**
  String get remindersErrorWhole;

  /// No description provided for @remindersEveryKm.
  ///
  /// In en, this message translates to:
  /// **'Every {km}'**
  String remindersEveryKm(String km);

  /// No description provided for @remindersEveryMonths.
  ///
  /// In en, this message translates to:
  /// **'{months, plural, =1{Every month} other{Every {months} months}}'**
  String remindersEveryMonths(int months);

  /// No description provided for @remindersFilterCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get remindersFilterCompleted;

  /// No description provided for @remindersFilterOpen.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get remindersFilterOpen;

  /// No description provided for @remindersGuestMessage.
  ///
  /// In en, this message translates to:
  /// **'Sign in to keep maintenance, insurance and licence reminders for your cars.'**
  String get remindersGuestMessage;

  /// No description provided for @remindersInDays.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, =0{Today} =1{Tomorrow} other{In {days} days}}'**
  String remindersInDays(int days);

  /// No description provided for @remindersInKm.
  ///
  /// In en, this message translates to:
  /// **'In {km}'**
  String remindersInKm(String km);

  /// No description provided for @remindersKmLate.
  ///
  /// In en, this message translates to:
  /// **'{km} over'**
  String remindersKmLate(String km);

  /// No description provided for @remindersMarkDone.
  ///
  /// In en, this message translates to:
  /// **'Mark as done'**
  String get remindersMarkDone;

  /// No description provided for @remindersNewTitle.
  ///
  /// In en, this message translates to:
  /// **'New reminder'**
  String get remindersNewTitle;

  /// No description provided for @remindersNoCar.
  ///
  /// In en, this message translates to:
  /// **'No specific car'**
  String get remindersNoCar;

  /// No description provided for @remindersNotes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get remindersNotes;

  /// No description provided for @remindersNotificationsUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Phone notifications are not available here. Reminders still appear in this list.'**
  String get remindersNotificationsUnsupported;

  /// No description provided for @remindersNotifyDays.
  ///
  /// In en, this message translates to:
  /// **'Days before'**
  String get remindersNotifyDays;

  /// No description provided for @remindersNotifyKm.
  ///
  /// In en, this message translates to:
  /// **'Km before'**
  String get remindersNotifyKm;

  /// No description provided for @remindersOdometerNow.
  ///
  /// In en, this message translates to:
  /// **'Odometer now'**
  String get remindersOdometerNow;

  /// No description provided for @remindersOdometerNowHint.
  ///
  /// In en, this message translates to:
  /// **'Optional. Used to schedule the next reminder by distance.'**
  String get remindersOdometerNowHint;

  /// No description provided for @remindersPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Notifications are blocked for this app. Allow them in your phone settings to get alerts; your reminders still show here.'**
  String get remindersPermissionDenied;

  /// No description provided for @remindersRepeatKm.
  ///
  /// In en, this message translates to:
  /// **'Repeat every'**
  String get remindersRepeatKm;

  /// No description provided for @remindersRepeatMonths.
  ///
  /// In en, this message translates to:
  /// **'Repeat every (months)'**
  String get remindersRepeatMonths;

  /// No description provided for @remindersSaved.
  ///
  /// In en, this message translates to:
  /// **'Reminder saved.'**
  String get remindersSaved;

  /// No description provided for @remindersStatusCompleted.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get remindersStatusCompleted;

  /// No description provided for @remindersStatusDueSoon.
  ///
  /// In en, this message translates to:
  /// **'Due soon'**
  String get remindersStatusDueSoon;

  /// No description provided for @remindersStatusOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get remindersStatusOverdue;

  /// No description provided for @remindersStatusUpcoming.
  ///
  /// In en, this message translates to:
  /// **'Upcoming'**
  String get remindersStatusUpcoming;

  /// No description provided for @remindersTitle.
  ///
  /// In en, this message translates to:
  /// **'Reminders'**
  String get remindersTitle;

  /// No description provided for @remindersTitleField.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get remindersTitleField;

  /// No description provided for @remindersTypeCustom.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get remindersTypeCustom;

  /// No description provided for @remindersTypeInsurance.
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get remindersTypeInsurance;

  /// No description provided for @remindersTypeLicence.
  ///
  /// In en, this message translates to:
  /// **'Licence'**
  String get remindersTypeLicence;

  /// No description provided for @remindersTypeMaintenance.
  ///
  /// In en, this message translates to:
  /// **'Maintenance'**
  String get remindersTypeMaintenance;

  /// No description provided for @remindersTypeTyres.
  ///
  /// In en, this message translates to:
  /// **'Tyres'**
  String get remindersTypeTyres;

  /// No description provided for @remindersWhatSection.
  ///
  /// In en, this message translates to:
  /// **'What'**
  String get remindersWhatSection;

  /// No description provided for @remindersWhenHint.
  ///
  /// In en, this message translates to:
  /// **'Enter a date, an odometer reading, or both.'**
  String get remindersWhenHint;

  /// No description provided for @remindersWhenSection.
  ///
  /// In en, this message translates to:
  /// **'When'**
  String get remindersWhenSection;

  /// No description provided for @searchAllGroups.
  ///
  /// In en, this message translates to:
  /// **'All results'**
  String get searchAllGroups;

  /// No description provided for @searchAlsoMatched.
  ///
  /// In en, this message translates to:
  /// **'Also matched: {terms}'**
  String searchAlsoMatched(String terms);

  /// No description provided for @searchBrowseBrands.
  ///
  /// In en, this message translates to:
  /// **'Brands'**
  String get searchBrowseBrands;

  /// No description provided for @searchBrowseEncyclopedia.
  ///
  /// In en, this message translates to:
  /// **'Encyclopedia'**
  String get searchBrowseEncyclopedia;

  /// No description provided for @searchBrowseServices.
  ///
  /// In en, this message translates to:
  /// **'Services'**
  String get searchBrowseServices;

  /// No description provided for @searchClearRecent.
  ///
  /// In en, this message translates to:
  /// **'Clear all'**
  String get searchClearRecent;

  /// No description provided for @searchClearRecentMessage.
  ///
  /// In en, this message translates to:
  /// **'They are stored on this device only.'**
  String get searchClearRecentMessage;

  /// No description provided for @searchClearRecentTitle.
  ///
  /// In en, this message translates to:
  /// **'Clear recent searches?'**
  String get searchClearRecentTitle;

  /// No description provided for @searchContactVerified.
  ///
  /// In en, this message translates to:
  /// **'Contact verified'**
  String get searchContactVerified;

  /// No description provided for @searchFor.
  ///
  /// In en, this message translates to:
  /// **'Search for “{query}”'**
  String searchFor(String query);

  /// No description provided for @searchGroupArticles.
  ///
  /// In en, this message translates to:
  /// **'News & articles'**
  String get searchGroupArticles;

  /// No description provided for @searchGroupBrands.
  ///
  /// In en, this message translates to:
  /// **'Brands'**
  String get searchGroupBrands;

  /// No description provided for @searchGroupEncyclopedia.
  ///
  /// In en, this message translates to:
  /// **'Encyclopedia'**
  String get searchGroupEncyclopedia;

  /// No description provided for @searchGroupModels.
  ///
  /// In en, this message translates to:
  /// **'Models'**
  String get searchGroupModels;

  /// No description provided for @searchGroupServices.
  ///
  /// In en, this message translates to:
  /// **'Services'**
  String get searchGroupServices;

  /// No description provided for @searchGroupStations.
  ///
  /// In en, this message translates to:
  /// **'Charging stations'**
  String get searchGroupStations;

  /// No description provided for @searchGroupVariants.
  ///
  /// In en, this message translates to:
  /// **'Trims'**
  String get searchGroupVariants;

  /// No description provided for @searchHint.
  ///
  /// In en, this message translates to:
  /// **'Search in Arabic or English'**
  String get searchHint;

  /// No description provided for @searchInvalidQuery.
  ///
  /// In en, this message translates to:
  /// **'Type at least one letter or number.'**
  String get searchInvalidQuery;

  /// No description provided for @searchLoadMoreFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load more results.'**
  String get searchLoadMoreFailed;

  /// No description provided for @searchMatchedSpelling.
  ///
  /// In en, this message translates to:
  /// **'Matched another spelling'**
  String get searchMatchedSpelling;

  /// No description provided for @searchNoResultsMessage.
  ///
  /// In en, this message translates to:
  /// **'Nothing matched “{query}”. Check the spelling or try a shorter word.'**
  String searchNoResultsMessage(String query);

  /// No description provided for @searchNoResultsTitle.
  ///
  /// In en, this message translates to:
  /// **'No results'**
  String get searchNoResultsTitle;

  /// No description provided for @searchRecentPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Recent searches stay on this device and are never sent to your account.'**
  String get searchRecentPrivacy;

  /// No description provided for @searchRecentTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent searches'**
  String get searchRecentTitle;

  /// No description provided for @searchRemoveRecent.
  ///
  /// In en, this message translates to:
  /// **'Remove “{query}”'**
  String searchRemoveRecent(String query);

  /// No description provided for @searchResultCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No results} =1{1 result} other{{formatted} results}}'**
  String searchResultCount(int count, String formatted);

  /// No description provided for @searchReviewed.
  ///
  /// In en, this message translates to:
  /// **'Technically reviewed'**
  String get searchReviewed;

  /// No description provided for @searchSeeAllCount.
  ///
  /// In en, this message translates to:
  /// **'See all {count}'**
  String searchSeeAllCount(String count);

  /// No description provided for @searchShownInArabic.
  ///
  /// In en, this message translates to:
  /// **'Shown in Arabic'**
  String get searchShownInArabic;

  /// No description provided for @searchShownInEnglish.
  ///
  /// In en, this message translates to:
  /// **'Shown in English'**
  String get searchShownInEnglish;

  /// No description provided for @searchStartMessage.
  ///
  /// In en, this message translates to:
  /// **'News, brands, models, trims, charging stations, the encyclopedia and services. Alternative spellings like “تسلا” or “Tesla” both work.'**
  String get searchStartMessage;

  /// No description provided for @searchStartTitle.
  ///
  /// In en, this message translates to:
  /// **'Search everything'**
  String get searchStartTitle;

  /// No description provided for @searchTitle.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get searchTitle;

  /// No description provided for @searchTypeArticle.
  ///
  /// In en, this message translates to:
  /// **'Article'**
  String get searchTypeArticle;

  /// No description provided for @searchTypeBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get searchTypeBrand;

  /// No description provided for @searchTypeEncyclopedia.
  ///
  /// In en, this message translates to:
  /// **'Encyclopedia'**
  String get searchTypeEncyclopedia;

  /// No description provided for @searchTypeModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get searchTypeModel;

  /// No description provided for @searchTypeQuery.
  ///
  /// In en, this message translates to:
  /// **'Search suggestion'**
  String get searchTypeQuery;

  /// No description provided for @searchTypeService.
  ///
  /// In en, this message translates to:
  /// **'Service'**
  String get searchTypeService;

  /// No description provided for @searchTypeStation.
  ///
  /// In en, this message translates to:
  /// **'Station'**
  String get searchTypeStation;

  /// No description provided for @searchTypeVariant.
  ///
  /// In en, this message translates to:
  /// **'Trim'**
  String get searchTypeVariant;

  /// No description provided for @servicesDirectoryAddress.
  ///
  /// In en, this message translates to:
  /// **'Address'**
  String get servicesDirectoryAddress;

  /// No description provided for @servicesDirectoryAllTypes.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get servicesDirectoryAllTypes;

  /// No description provided for @servicesDirectoryAlwaysOpen.
  ///
  /// In en, this message translates to:
  /// **'Open 24/7'**
  String get servicesDirectoryAlwaysOpen;

  /// No description provided for @servicesDirectoryAnyCity.
  ///
  /// In en, this message translates to:
  /// **'Any city'**
  String get servicesDirectoryAnyCity;

  /// No description provided for @servicesDirectoryBrandsTitle.
  ///
  /// In en, this message translates to:
  /// **'Brands served'**
  String get servicesDirectoryBrandsTitle;

  /// No description provided for @servicesDirectoryBrowseAll.
  ///
  /// In en, this message translates to:
  /// **'Browse the directory'**
  String get servicesDirectoryBrowseAll;

  /// No description provided for @servicesDirectoryCall.
  ///
  /// In en, this message translates to:
  /// **'Call'**
  String get servicesDirectoryCall;

  /// No description provided for @servicesDirectoryCheckBeforeVisit.
  ///
  /// In en, this message translates to:
  /// **'Call ahead to confirm before you visit.'**
  String get servicesDirectoryCheckBeforeVisit;

  /// No description provided for @servicesDirectoryChooseCity.
  ///
  /// In en, this message translates to:
  /// **'Choose a city'**
  String get servicesDirectoryChooseCity;

  /// No description provided for @servicesDirectoryCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get servicesDirectoryCity;

  /// No description provided for @servicesDirectoryCityField.
  ///
  /// In en, this message translates to:
  /// **'City name'**
  String get servicesDirectoryCityField;

  /// No description provided for @servicesDirectoryClosedDay.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get servicesDirectoryClosedDay;

  /// No description provided for @servicesDirectoryClosedNow.
  ///
  /// In en, this message translates to:
  /// **'Closed now'**
  String get servicesDirectoryClosedNow;

  /// No description provided for @servicesDirectoryContactTitle.
  ///
  /// In en, this message translates to:
  /// **'Contact'**
  String get servicesDirectoryContactTitle;

  /// No description provided for @servicesDirectoryDayFri.
  ///
  /// In en, this message translates to:
  /// **'Friday'**
  String get servicesDirectoryDayFri;

  /// No description provided for @servicesDirectoryDayMon.
  ///
  /// In en, this message translates to:
  /// **'Monday'**
  String get servicesDirectoryDayMon;

  /// No description provided for @servicesDirectoryDaySat.
  ///
  /// In en, this message translates to:
  /// **'Saturday'**
  String get servicesDirectoryDaySat;

  /// No description provided for @servicesDirectoryDaySun.
  ///
  /// In en, this message translates to:
  /// **'Sunday'**
  String get servicesDirectoryDaySun;

  /// No description provided for @servicesDirectoryDayThu.
  ///
  /// In en, this message translates to:
  /// **'Thursday'**
  String get servicesDirectoryDayThu;

  /// No description provided for @servicesDirectoryDayTue.
  ///
  /// In en, this message translates to:
  /// **'Tuesday'**
  String get servicesDirectoryDayTue;

  /// No description provided for @servicesDirectoryDayWed.
  ///
  /// In en, this message translates to:
  /// **'Wednesday'**
  String get servicesDirectoryDayWed;

  /// No description provided for @servicesDirectoryDemoNoContact.
  ///
  /// In en, this message translates to:
  /// **'Demo listing: contact actions are disabled.'**
  String get servicesDirectoryDemoNoContact;

  /// No description provided for @servicesDirectoryDirections.
  ///
  /// In en, this message translates to:
  /// **'Directions'**
  String get servicesDirectoryDirections;

  /// No description provided for @servicesDirectoryDistance.
  ///
  /// In en, this message translates to:
  /// **'Distance'**
  String get servicesDirectoryDistance;

  /// No description provided for @servicesDirectoryDistanceAway.
  ///
  /// In en, this message translates to:
  /// **'{distance} away'**
  String servicesDirectoryDistanceAway(String distance);

  /// No description provided for @servicesDirectoryEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get servicesDirectoryEmail;

  /// No description provided for @servicesDirectoryEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Nothing has been published for your country yet.'**
  String get servicesDirectoryEmptyMessage;

  /// No description provided for @servicesDirectoryEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No providers yet'**
  String get servicesDirectoryEmptyTitle;

  /// No description provided for @servicesDirectoryHoursNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'Opening hours not available.'**
  String get servicesDirectoryHoursNotAvailable;

  /// No description provided for @servicesDirectoryHoursTitle.
  ///
  /// In en, this message translates to:
  /// **'Opening hours'**
  String get servicesDirectoryHoursTitle;

  /// No description provided for @servicesDirectoryHoursUnknown.
  ///
  /// In en, this message translates to:
  /// **'Hours not available'**
  String get servicesDirectoryHoursUnknown;

  /// No description provided for @servicesDirectoryHoursUnknownDay.
  ///
  /// In en, this message translates to:
  /// **'Not available'**
  String get servicesDirectoryHoursUnknownDay;

  /// No description provided for @servicesDirectoryIntro.
  ///
  /// In en, this message translates to:
  /// **'Service centres, dealers, charger installers and emergency services. Contact details show when they were last verified.'**
  String get servicesDirectoryIntro;

  /// No description provided for @servicesDirectoryLocationDenied.
  ///
  /// In en, this message translates to:
  /// **'Location access was not allowed. You can choose a city instead.'**
  String get servicesDirectoryLocationDenied;

  /// No description provided for @servicesDirectoryLocationDeniedForever.
  ///
  /// In en, this message translates to:
  /// **'Location access is off for this app. Turn it on in Settings, or choose a city.'**
  String get servicesDirectoryLocationDeniedForever;

  /// No description provided for @servicesDirectoryLocationServiceOff.
  ///
  /// In en, this message translates to:
  /// **'Location services are off on this device. Turn them on, or choose a city.'**
  String get servicesDirectoryLocationServiceOff;

  /// No description provided for @servicesDirectoryLocationTitle.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get servicesDirectoryLocationTitle;

  /// No description provided for @servicesDirectoryLocationUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t get your location. You can choose a city instead.'**
  String get servicesDirectoryLocationUnavailable;

  /// No description provided for @servicesDirectoryNearMe.
  ///
  /// In en, this message translates to:
  /// **'Near me'**
  String get servicesDirectoryNearMe;

  /// No description provided for @servicesDirectoryNoContact.
  ///
  /// In en, this message translates to:
  /// **'No contact details published.'**
  String get servicesDirectoryNoContact;

  /// No description provided for @servicesDirectoryNoMatchesMessage.
  ///
  /// In en, this message translates to:
  /// **'Try another type or city, or turn off “Open now”.'**
  String get servicesDirectoryNoMatchesMessage;

  /// No description provided for @servicesDirectoryNoMatchesTitle.
  ///
  /// In en, this message translates to:
  /// **'No matching providers'**
  String get servicesDirectoryNoMatchesTitle;

  /// No description provided for @servicesDirectoryNotFoundMessage.
  ///
  /// In en, this message translates to:
  /// **'It may have been removed from the directory. Browse other providers near you.'**
  String get servicesDirectoryNotFoundMessage;

  /// No description provided for @servicesDirectoryNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'This provider isn\'t listed anymore'**
  String get servicesDirectoryNotFoundTitle;

  /// No description provided for @servicesDirectoryNotVerified.
  ///
  /// In en, this message translates to:
  /// **'Contact details not verified'**
  String get servicesDirectoryNotVerified;

  /// No description provided for @servicesDirectoryOpenNow.
  ///
  /// In en, this message translates to:
  /// **'Open now'**
  String get servicesDirectoryOpenNow;

  /// No description provided for @servicesDirectoryOrderDistance.
  ///
  /// In en, this message translates to:
  /// **'Nearest first. Sponsorship never changes this order.'**
  String get servicesDirectoryOrderDistance;

  /// No description provided for @servicesDirectoryOrderVerified.
  ///
  /// In en, this message translates to:
  /// **'Ordered by verified contact details first, then name. Sponsorship never changes this order.'**
  String get servicesDirectoryOrderVerified;

  /// No description provided for @servicesDirectoryPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get servicesDirectoryPhone;

  /// No description provided for @servicesDirectoryProviderTitle.
  ///
  /// In en, this message translates to:
  /// **'Service provider'**
  String get servicesDirectoryProviderTitle;

  /// No description provided for @servicesDirectoryResults.
  ///
  /// In en, this message translates to:
  /// **'Directory'**
  String get servicesDirectoryResults;

  /// No description provided for @servicesDirectorySearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search by name'**
  String get servicesDirectorySearchHint;

  /// No description provided for @servicesDirectoryServicesTitle.
  ///
  /// In en, this message translates to:
  /// **'Services'**
  String get servicesDirectoryServicesTitle;

  /// No description provided for @servicesDirectorySponsoredDetailNote.
  ///
  /// In en, this message translates to:
  /// **'This listing is sponsored. Sponsorship does not mean the provider is recommended or verified.'**
  String get servicesDirectorySponsoredDetailNote;

  /// No description provided for @servicesDirectorySponsoredSlotNote.
  ///
  /// In en, this message translates to:
  /// **'Paid placements, shown separately. They keep their normal place in the directory below.'**
  String get servicesDirectorySponsoredSlotNote;

  /// No description provided for @servicesDirectorySponsoredSlotTitle.
  ///
  /// In en, this message translates to:
  /// **'Sponsored listings'**
  String get servicesDirectorySponsoredSlotTitle;

  /// No description provided for @servicesDirectoryTimezone.
  ///
  /// In en, this message translates to:
  /// **'Times in {zone}'**
  String servicesDirectoryTimezone(String zone);

  /// No description provided for @servicesDirectoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Services directory'**
  String get servicesDirectoryTitle;

  /// No description provided for @servicesDirectoryTruncated.
  ///
  /// In en, this message translates to:
  /// **'Many results: narrow the search to see the most relevant.'**
  String get servicesDirectoryTruncated;

  /// No description provided for @servicesDirectoryTypeBattery.
  ///
  /// In en, this message translates to:
  /// **'Battery services'**
  String get servicesDirectoryTypeBattery;

  /// No description provided for @servicesDirectoryTypeChargerInstaller.
  ///
  /// In en, this message translates to:
  /// **'Charger installers'**
  String get servicesDirectoryTypeChargerInstaller;

  /// No description provided for @servicesDirectoryTypeDealer.
  ///
  /// In en, this message translates to:
  /// **'Dealers'**
  String get servicesDirectoryTypeDealer;

  /// No description provided for @servicesDirectoryTypeEmergency.
  ///
  /// In en, this message translates to:
  /// **'Emergency'**
  String get servicesDirectoryTypeEmergency;

  /// No description provided for @servicesDirectoryTypeOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get servicesDirectoryTypeOther;

  /// No description provided for @servicesDirectoryTypeServiceCenter.
  ///
  /// In en, this message translates to:
  /// **'Service centres'**
  String get servicesDirectoryTypeServiceCenter;

  /// No description provided for @servicesDirectoryVerified.
  ///
  /// In en, this message translates to:
  /// **'Contact verified'**
  String get servicesDirectoryVerified;

  /// No description provided for @servicesDirectoryVerifiedLongAgo.
  ///
  /// In en, this message translates to:
  /// **'Verified over a year ago'**
  String get servicesDirectoryVerifiedLongAgo;

  /// No description provided for @servicesDirectoryVerifiedOn.
  ///
  /// In en, this message translates to:
  /// **'Verified on {date}'**
  String servicesDirectoryVerifiedOn(String date);

  /// No description provided for @servicesDirectoryVerifiedStale.
  ///
  /// In en, this message translates to:
  /// **'Last verified {date} (over a year ago)'**
  String servicesDirectoryVerifiedStale(String date);

  /// No description provided for @servicesDirectoryWebsite.
  ///
  /// In en, this message translates to:
  /// **'Website'**
  String get servicesDirectoryWebsite;

  /// No description provided for @servicesDirectoryWhatsApp.
  ///
  /// In en, this message translates to:
  /// **'WhatsApp'**
  String get servicesDirectoryWhatsApp;

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

  /// No description provided for @toursAbout.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get toursAbout;

  /// No description provided for @toursAttributionTitle.
  ///
  /// In en, this message translates to:
  /// **'Photo credits & licence'**
  String get toursAttributionTitle;

  /// No description provided for @toursBrowseCars.
  ///
  /// In en, this message translates to:
  /// **'Browse cars'**
  String get toursBrowseCars;

  /// No description provided for @toursCar.
  ///
  /// In en, this message translates to:
  /// **'Car'**
  String get toursCar;

  /// No description provided for @toursCredit.
  ///
  /// In en, this message translates to:
  /// **'© {credit}'**
  String toursCredit(String credit);

  /// No description provided for @toursDemoFallback.
  ///
  /// In en, this message translates to:
  /// **'Demo — not a real car interior'**
  String get toursDemoFallback;

  /// No description provided for @toursDetails.
  ///
  /// In en, this message translates to:
  /// **'Tour details'**
  String get toursDetails;

  /// No description provided for @toursDragHint.
  ///
  /// In en, this message translates to:
  /// **'Drag to look around · pinch to zoom'**
  String get toursDragHint;

  /// No description provided for @toursDriveLhd.
  ///
  /// In en, this message translates to:
  /// **'Left-hand drive'**
  String get toursDriveLhd;

  /// No description provided for @toursDriveRhd.
  ///
  /// In en, this message translates to:
  /// **'Right-hand drive'**
  String get toursDriveRhd;

  /// No description provided for @toursDriveUnknown.
  ///
  /// In en, this message translates to:
  /// **'Drive side: not available'**
  String get toursDriveUnknown;

  /// No description provided for @toursFullscreenEnter.
  ///
  /// In en, this message translates to:
  /// **'Full screen'**
  String get toursFullscreenEnter;

  /// No description provided for @toursFullscreenExit.
  ///
  /// In en, this message translates to:
  /// **'Exit full screen'**
  String get toursFullscreenExit;

  /// No description provided for @toursGoBack.
  ///
  /// In en, this message translates to:
  /// **'Go back'**
  String get toursGoBack;

  /// No description provided for @toursHdFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load high quality. Showing the preview.'**
  String get toursHdFailed;

  /// No description provided for @toursHotspotImage.
  ///
  /// In en, this message translates to:
  /// **'Detail photo'**
  String get toursHotspotImage;

  /// No description provided for @toursHotspotInfo.
  ///
  /// In en, this message translates to:
  /// **'Information'**
  String get toursHotspotInfo;

  /// No description provided for @toursHotspotScene.
  ///
  /// In en, this message translates to:
  /// **'Go to another seat'**
  String get toursHotspotScene;

  /// No description provided for @toursHotspotSpec.
  ///
  /// In en, this message translates to:
  /// **'Specification'**
  String get toursHotspotSpec;

  /// No description provided for @toursHotspotVideo.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get toursHotspotVideo;

  /// No description provided for @toursImageZoomHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the photo to zoom'**
  String get toursImageZoomHint;

  /// No description provided for @toursImageZoomTitle.
  ///
  /// In en, this message translates to:
  /// **'Detail photo'**
  String get toursImageZoomTitle;

  /// No description provided for @toursInfo.
  ///
  /// In en, this message translates to:
  /// **'About this tour'**
  String get toursInfo;

  /// No description provided for @toursInterior.
  ///
  /// In en, this message translates to:
  /// **'Interior: {color}'**
  String toursInterior(String color);

  /// No description provided for @toursLicense.
  ///
  /// In en, this message translates to:
  /// **'Licence: {license}'**
  String toursLicense(String license);

  /// No description provided for @toursLicenseCc0.
  ///
  /// In en, this message translates to:
  /// **'CC0 (public domain)'**
  String get toursLicenseCc0;

  /// No description provided for @toursLicenseCcBy.
  ///
  /// In en, this message translates to:
  /// **'CC BY'**
  String get toursLicenseCcBy;

  /// No description provided for @toursLicenseCcBySa.
  ///
  /// In en, this message translates to:
  /// **'CC BY-SA'**
  String get toursLicenseCcBySa;

  /// No description provided for @toursLicenseCommissioned.
  ///
  /// In en, this message translates to:
  /// **'Commissioned'**
  String get toursLicenseCommissioned;

  /// No description provided for @toursLicenseLicensed.
  ///
  /// In en, this message translates to:
  /// **'Licensed'**
  String get toursLicenseLicensed;

  /// No description provided for @toursLicenseOther.
  ///
  /// In en, this message translates to:
  /// **'Other licence'**
  String get toursLicenseOther;

  /// No description provided for @toursLicenseOwned.
  ///
  /// In en, this message translates to:
  /// **'Owned'**
  String get toursLicenseOwned;

  /// No description provided for @toursLicensePermission.
  ///
  /// In en, this message translates to:
  /// **'Used with permission'**
  String get toursLicensePermission;

  /// No description provided for @toursLicensePressKit.
  ///
  /// In en, this message translates to:
  /// **'Press kit'**
  String get toursLicensePressKit;

  /// No description provided for @toursLicenseTerms.
  ///
  /// In en, this message translates to:
  /// **'Licence terms'**
  String get toursLicenseTerms;

  /// No description provided for @toursListEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'We only publish tours made from licensed photos of the exact trim. New tours will appear here as soon as they are ready.'**
  String get toursListEmptyMessage;

  /// No description provided for @toursListEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No 360° tours yet'**
  String get toursListEmptyTitle;

  /// No description provided for @toursListIntro.
  ///
  /// In en, this message translates to:
  /// **'Sit inside the car and look around, seat by seat. Every tour is made from licensed interior photos of the stated trim.'**
  String get toursListIntro;

  /// No description provided for @toursListTitle.
  ///
  /// In en, this message translates to:
  /// **'360° interior tours'**
  String get toursListTitle;

  /// No description provided for @toursLoadFailedMessage.
  ///
  /// In en, this message translates to:
  /// **'Check your connection and try again. You can also browse the regular photos.'**
  String get toursLoadFailedMessage;

  /// No description provided for @toursLoadFailedTitle.
  ///
  /// In en, this message translates to:
  /// **'The 360° view couldn\'t be loaded'**
  String get toursLoadFailedTitle;

  /// No description provided for @toursLoadMoreFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load more tours.'**
  String get toursLoadMoreFailed;

  /// No description provided for @toursLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading the 360° view…'**
  String get toursLoading;

  /// No description provided for @toursLoadingHd.
  ///
  /// In en, this message translates to:
  /// **'Loading high quality… {percent}'**
  String toursLoadingHd(String percent);

  /// No description provided for @toursLoadingHdUnknown.
  ///
  /// In en, this message translates to:
  /// **'Loading high quality…'**
  String get toursLoadingHdUnknown;

  /// No description provided for @toursMarket.
  ///
  /// In en, this message translates to:
  /// **'Market: {market}'**
  String toursMarket(String market);

  /// No description provided for @toursMarketMismatch.
  ///
  /// In en, this message translates to:
  /// **'This tour was made for the {market} market, not the market you selected.'**
  String toursMarketMismatch(String market);

  /// No description provided for @toursModelYear.
  ///
  /// In en, this message translates to:
  /// **'Model year {year}'**
  String toursModelYear(String year);

  /// No description provided for @toursMotionEnabled.
  ///
  /// In en, this message translates to:
  /// **'Motion control on. Move your phone to look around.'**
  String get toursMotionEnabled;

  /// No description provided for @toursMotionOff.
  ///
  /// In en, this message translates to:
  /// **'Look around by moving the phone'**
  String get toursMotionOff;

  /// No description provided for @toursMotionOn.
  ///
  /// In en, this message translates to:
  /// **'Turn off motion control'**
  String get toursMotionOn;

  /// No description provided for @toursMotionUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Motion control isn\'t available on this device. Drag to look around.'**
  String get toursMotionUnavailable;

  /// No description provided for @toursNoImageMessage.
  ///
  /// In en, this message translates to:
  /// **'Its images are larger than this device can display.'**
  String get toursNoImageMessage;

  /// No description provided for @toursNoImageTitle.
  ///
  /// In en, this message translates to:
  /// **'This tour can\'t be shown on this device'**
  String get toursNoImageTitle;

  /// No description provided for @toursOpen.
  ///
  /// In en, this message translates to:
  /// **'Open 360° tour'**
  String get toursOpen;

  /// No description provided for @toursOpenGallery.
  ///
  /// In en, this message translates to:
  /// **'Open photo gallery'**
  String get toursOpenGallery;

  /// No description provided for @toursPoints.
  ///
  /// In en, this message translates to:
  /// **'Points of interest'**
  String get toursPoints;

  /// No description provided for @toursPointsEmpty.
  ///
  /// In en, this message translates to:
  /// **'This view has no points of interest.'**
  String get toursPointsEmpty;

  /// No description provided for @toursPublished.
  ///
  /// In en, this message translates to:
  /// **'Published {date}'**
  String toursPublished(String date);

  /// No description provided for @toursQualityHd.
  ///
  /// In en, this message translates to:
  /// **'HD'**
  String get toursQualityHd;

  /// No description provided for @toursQualityHdSemantics.
  ///
  /// In en, this message translates to:
  /// **'Showing high quality'**
  String get toursQualityHdSemantics;

  /// No description provided for @toursQualityPreview.
  ///
  /// In en, this message translates to:
  /// **'Preview'**
  String get toursQualityPreview;

  /// No description provided for @toursQualityPreviewSemantics.
  ///
  /// In en, this message translates to:
  /// **'Showing a low-resolution preview'**
  String get toursQualityPreviewSemantics;

  /// No description provided for @toursReferenceBadge.
  ///
  /// In en, this message translates to:
  /// **'Similar trim'**
  String get toursReferenceBadge;

  /// No description provided for @toursReferenceBody.
  ///
  /// In en, this message translates to:
  /// **'These photos show the {trim} trim, not exactly the selected one.'**
  String toursReferenceBody(String trim);

  /// No description provided for @toursReferenceTitle.
  ///
  /// In en, this message translates to:
  /// **'Photographed in a similar trim'**
  String get toursReferenceTitle;

  /// No description provided for @toursResetView.
  ///
  /// In en, this message translates to:
  /// **'Reset view'**
  String get toursResetView;

  /// No description provided for @toursSceneCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 view} other{{count} views}}'**
  String toursSceneCount(int count);

  /// No description provided for @toursSeatCargo.
  ///
  /// In en, this message translates to:
  /// **'Cargo area'**
  String get toursSeatCargo;

  /// No description provided for @toursSeatDriver.
  ///
  /// In en, this message translates to:
  /// **'Driver seat'**
  String get toursSeatDriver;

  /// No description provided for @toursSeatFrontPassenger.
  ///
  /// In en, this message translates to:
  /// **'Front passenger'**
  String get toursSeatFrontPassenger;

  /// No description provided for @toursSeatOther.
  ///
  /// In en, this message translates to:
  /// **'Other view'**
  String get toursSeatOther;

  /// No description provided for @toursSeatPicker.
  ///
  /// In en, this message translates to:
  /// **'Choose a seat'**
  String get toursSeatPicker;

  /// No description provided for @toursSeatRear.
  ///
  /// In en, this message translates to:
  /// **'Rear seats'**
  String get toursSeatRear;

  /// No description provided for @toursSeatThirdRow.
  ///
  /// In en, this message translates to:
  /// **'Third row'**
  String get toursSeatThirdRow;

  /// No description provided for @toursSourceLink.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get toursSourceLink;

  /// No description provided for @toursSpecOpen.
  ///
  /// In en, this message translates to:
  /// **'See all specifications'**
  String get toursSpecOpen;

  /// No description provided for @toursStillPreview.
  ///
  /// In en, this message translates to:
  /// **'Still preview (not the 360° tour)'**
  String get toursStillPreview;

  /// No description provided for @toursTrim.
  ///
  /// In en, this message translates to:
  /// **'Trim: {trim}'**
  String toursTrim(String trim);

  /// No description provided for @toursUnavailableMessage.
  ///
  /// In en, this message translates to:
  /// **'There is no licensed 360° interior for this tour. You can browse the regular photos instead.'**
  String get toursUnavailableMessage;

  /// No description provided for @toursUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Tour not available for this trim'**
  String get toursUnavailableTitle;

  /// No description provided for @toursVideoBlocked.
  ///
  /// In en, this message translates to:
  /// **'This video link isn\'t allowed.'**
  String get toursVideoBlocked;

  /// No description provided for @toursVideoOpen.
  ///
  /// In en, this message translates to:
  /// **'Watch video'**
  String get toursVideoOpen;

  /// No description provided for @toursVideoProvider.
  ///
  /// In en, this message translates to:
  /// **'Opens on {provider}'**
  String toursVideoProvider(String provider);

  /// No description provided for @toursVideoSelf.
  ///
  /// In en, this message translates to:
  /// **'EV Car News'**
  String get toursVideoSelf;

  /// No description provided for @toursViewCar.
  ///
  /// In en, this message translates to:
  /// **'View car page'**
  String get toursViewCar;

  /// No description provided for @toursViewerSemantics.
  ///
  /// In en, this message translates to:
  /// **'360° view of {car}. Drag to look around, or use the buttons.'**
  String toursViewerSemantics(String car);

  /// No description provided for @toursViewerTitle.
  ///
  /// In en, this message translates to:
  /// **'360° interior tour'**
  String get toursViewerTitle;

  /// No description provided for @toursWebPreviewMessage.
  ///
  /// In en, this message translates to:
  /// **'The 360° viewer runs in the Android and iOS apps. The image below is only a still preview, not the tour.'**
  String get toursWebPreviewMessage;

  /// No description provided for @toursWebglMessage.
  ///
  /// In en, this message translates to:
  /// **'3D graphics (WebGL) aren\'t available on this device. You can browse the regular photos instead.'**
  String get toursWebglMessage;

  /// No description provided for @toursWebglTitle.
  ///
  /// In en, this message translates to:
  /// **'This device can\'t display 360° views'**
  String get toursWebglTitle;

  /// No description provided for @toursZoomIn.
  ///
  /// In en, this message translates to:
  /// **'Zoom in'**
  String get toursZoomIn;

  /// No description provided for @toursZoomOut.
  ///
  /// In en, this message translates to:
  /// **'Zoom out'**
  String get toursZoomOut;

  /// No description provided for @tripsAccess.
  ///
  /// In en, this message translates to:
  /// **'Access'**
  String get tripsAccess;

  /// No description provided for @tripsAlternative.
  ///
  /// In en, this message translates to:
  /// **'Alternative station'**
  String get tripsAlternative;

  /// No description provided for @tripsArrivalSoc.
  ///
  /// In en, this message translates to:
  /// **'Battery on arrival'**
  String get tripsArrivalSoc;

  /// No description provided for @tripsAssumptions.
  ///
  /// In en, this message translates to:
  /// **'Assumptions'**
  String get tripsAssumptions;

  /// No description provided for @tripsAssumptionsEdit.
  ///
  /// In en, this message translates to:
  /// **'Assumptions'**
  String get tripsAssumptionsEdit;

  /// No description provided for @tripsAssumptionsEditHint.
  ///
  /// In en, this message translates to:
  /// **'Optional: leave empty to use the catalog and defaults shown in the result.'**
  String get tripsAssumptionsEditHint;

  /// No description provided for @tripsAtKm.
  ///
  /// In en, this message translates to:
  /// **'At'**
  String get tripsAtKm;

  /// No description provided for @tripsAvailabilityUnknown.
  ///
  /// In en, this message translates to:
  /// **'Availability unknown'**
  String get tripsAvailabilityUnknown;

  /// No description provided for @tripsAvailableNow.
  ///
  /// In en, this message translates to:
  /// **'Available now (not at arrival)'**
  String get tripsAvailableNow;

  /// No description provided for @tripsBatterySection.
  ///
  /// In en, this message translates to:
  /// **'Battery'**
  String get tripsBatterySection;

  /// No description provided for @tripsCar.
  ///
  /// In en, this message translates to:
  /// **'Car'**
  String get tripsCar;

  /// No description provided for @tripsChargeEnergy.
  ///
  /// In en, this message translates to:
  /// **'Energy to charge'**
  String get tripsChargeEnergy;

  /// No description provided for @tripsChargeFromTo.
  ///
  /// In en, this message translates to:
  /// **'Charge'**
  String get tripsChargeFromTo;

  /// No description provided for @tripsChargeTime.
  ///
  /// In en, this message translates to:
  /// **'Charging'**
  String get tripsChargeTime;

  /// No description provided for @tripsChargeTimeUnknown.
  ///
  /// In en, this message translates to:
  /// **'No plan: the charging time at the stations cannot be estimated.'**
  String get tripsChargeTimeUnknown;

  /// No description provided for @tripsChargeTo.
  ///
  /// In en, this message translates to:
  /// **'Charge up to'**
  String get tripsChargeTo;

  /// No description provided for @tripsChargeToHint.
  ///
  /// In en, this message translates to:
  /// **'Empty = 80%.'**
  String get tripsChargeToHint;

  /// No description provided for @tripsChoose.
  ///
  /// In en, this message translates to:
  /// **'Choose'**
  String get tripsChoose;

  /// No description provided for @tripsClosedAtEta.
  ///
  /// In en, this message translates to:
  /// **'Closed at arrival'**
  String get tripsClosedAtEta;

  /// No description provided for @tripsConsumptionHint.
  ///
  /// In en, this message translates to:
  /// **'Overrides the catalog value.'**
  String get tripsConsumptionHint;

  /// No description provided for @tripsCost.
  ///
  /// In en, this message translates to:
  /// **'Approximate cost'**
  String get tripsCost;

  /// No description provided for @tripsCostNotCalculated.
  ///
  /// In en, this message translates to:
  /// **'Enter a price to calculate'**
  String get tripsCostNotCalculated;

  /// No description provided for @tripsCurrentSoc.
  ///
  /// In en, this message translates to:
  /// **'Battery now'**
  String get tripsCurrentSoc;

  /// No description provided for @tripsDeleteSaved.
  ///
  /// In en, this message translates to:
  /// **'Delete saved trip'**
  String get tripsDeleteSaved;

  /// No description provided for @tripsDepartureSection.
  ///
  /// In en, this message translates to:
  /// **'Departure'**
  String get tripsDepartureSection;

  /// No description provided for @tripsDetour.
  ///
  /// In en, this message translates to:
  /// **'Detour'**
  String get tripsDetour;

  /// No description provided for @tripsDirections.
  ///
  /// In en, this message translates to:
  /// **'Directions'**
  String get tripsDirections;

  /// No description provided for @tripsDriveTime.
  ///
  /// In en, this message translates to:
  /// **'Driving'**
  String get tripsDriveTime;

  /// No description provided for @tripsEnergyUsed.
  ///
  /// In en, this message translates to:
  /// **'Energy used'**
  String get tripsEnergyUsed;

  /// No description provided for @tripsErrorCar.
  ///
  /// In en, this message translates to:
  /// **'Choose the car.'**
  String get tripsErrorCar;

  /// No description provided for @tripsErrorDestination.
  ///
  /// In en, this message translates to:
  /// **'Choose your destination.'**
  String get tripsErrorDestination;

  /// No description provided for @tripsErrorMinSoc.
  ///
  /// In en, this message translates to:
  /// **'Must be below the battery level now.'**
  String get tripsErrorMinSoc;

  /// No description provided for @tripsErrorOrigin.
  ///
  /// In en, this message translates to:
  /// **'Choose where you start.'**
  String get tripsErrorOrigin;

  /// No description provided for @tripsEta.
  ///
  /// In en, this message translates to:
  /// **'Expected arrival'**
  String get tripsEta;

  /// No description provided for @tripsFrom.
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get tripsFrom;

  /// No description provided for @tripsHours.
  ///
  /// In en, this message translates to:
  /// **'Opening hours'**
  String get tripsHours;

  /// No description provided for @tripsHoursUnknown.
  ///
  /// In en, this message translates to:
  /// **'Hours unknown'**
  String get tripsHoursUnknown;

  /// No description provided for @tripsIntro.
  ///
  /// In en, this message translates to:
  /// **'The route and road distances come from a routing service. Stops are suggested with a battery reserve and an alternative; arrival and a free charger are never guaranteed.'**
  String get tripsIntro;

  /// No description provided for @tripsLeaveNow.
  ///
  /// In en, this message translates to:
  /// **'Leave now'**
  String get tripsLeaveNow;

  /// No description provided for @tripsLegN.
  ///
  /// In en, this message translates to:
  /// **'Leg {n}'**
  String tripsLegN(int n);

  /// No description provided for @tripsLegs.
  ///
  /// In en, this message translates to:
  /// **'Road legs'**
  String get tripsLegs;

  /// No description provided for @tripsLocationDenied.
  ///
  /// In en, this message translates to:
  /// **'Location is off or not allowed. Choose a city or a point on the map instead.'**
  String get tripsLocationDenied;

  /// No description provided for @tripsLocationFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not get your location. Choose a city instead.'**
  String get tripsLocationFailed;

  /// No description provided for @tripsMargin.
  ///
  /// In en, this message translates to:
  /// **'Consumption safety margin'**
  String get tripsMargin;

  /// No description provided for @tripsMarginHint.
  ///
  /// In en, this message translates to:
  /// **'Empty = 10%. Covers hills, heat, cold and speed.'**
  String get tripsMarginHint;

  /// No description provided for @tripsMinArrivalSoc.
  ///
  /// In en, this message translates to:
  /// **'Keep at least'**
  String get tripsMinArrivalSoc;

  /// No description provided for @tripsMissingInlets.
  ///
  /// In en, this message translates to:
  /// **'charging inlets'**
  String get tripsMissingInlets;

  /// No description provided for @tripsMyLocation.
  ///
  /// In en, this message translates to:
  /// **'My current location'**
  String get tripsMyLocation;

  /// No description provided for @tripsMyLocationHint.
  ///
  /// In en, this message translates to:
  /// **'Used once for this plan, not stored.'**
  String get tripsMyLocationHint;

  /// No description provided for @tripsNoReachableStation.
  ///
  /// In en, this message translates to:
  /// **'No plan: no compatible, open station is reachable with the reserve you asked for. Try a higher battery level or a lower reserve.'**
  String get tripsNoReachableStation;

  /// No description provided for @tripsNoStopsNeeded.
  ///
  /// In en, this message translates to:
  /// **'No charging stop is needed with the values you entered.'**
  String get tripsNoStopsNeeded;

  /// No description provided for @tripsNotConfigured.
  ///
  /// In en, this message translates to:
  /// **'Trip planning is not available: no routing service is configured yet. You can still get directions to any station from the charging map.'**
  String get tripsNotConfigured;

  /// No description provided for @tripsOccupiedNow.
  ///
  /// In en, this message translates to:
  /// **'Occupied now'**
  String get tripsOccupiedNow;

  /// No description provided for @tripsOpenAtEta.
  ///
  /// In en, this message translates to:
  /// **'Open at arrival'**
  String get tripsOpenAtEta;

  /// No description provided for @tripsOutOfOrderNow.
  ///
  /// In en, this message translates to:
  /// **'Out of order now'**
  String get tripsOutOfOrderNow;

  /// No description provided for @tripsPickOnMap.
  ///
  /// In en, this message translates to:
  /// **'Pick on the map'**
  String get tripsPickOnMap;

  /// No description provided for @tripsPlan.
  ///
  /// In en, this message translates to:
  /// **'Plan my trip'**
  String get tripsPlan;

  /// No description provided for @tripsPointOnMap.
  ///
  /// In en, this message translates to:
  /// **'Point {lat}, {lng}'**
  String tripsPointOnMap(String lat, String lng);

  /// No description provided for @tripsPrice.
  ///
  /// In en, this message translates to:
  /// **'Electricity price'**
  String get tripsPrice;

  /// No description provided for @tripsPriceHint.
  ///
  /// In en, this message translates to:
  /// **'Optional. Without it the cost is not calculated (no assumed prices).'**
  String get tripsPriceHint;

  /// No description provided for @tripsRough.
  ///
  /// In en, this message translates to:
  /// **'Rough'**
  String get tripsRough;

  /// No description provided for @tripsRouteNotFound.
  ///
  /// In en, this message translates to:
  /// **'No road route was found between these points.'**
  String get tripsRouteNotFound;

  /// No description provided for @tripsRoutingBy.
  ///
  /// In en, this message translates to:
  /// **'Route: {provider}'**
  String tripsRoutingBy(String provider);

  /// No description provided for @tripsSave.
  ///
  /// In en, this message translates to:
  /// **'Save this plan'**
  String get tripsSave;

  /// No description provided for @tripsSaveHint.
  ///
  /// In en, this message translates to:
  /// **'Only saved when you ask; visible only to you.'**
  String get tripsSaveHint;

  /// No description provided for @tripsSaveTitle.
  ///
  /// In en, this message translates to:
  /// **'Name (optional)'**
  String get tripsSaveTitle;

  /// No description provided for @tripsSaved.
  ///
  /// In en, this message translates to:
  /// **'My saved trips'**
  String get tripsSaved;

  /// No description provided for @tripsSavedEmpty.
  ///
  /// In en, this message translates to:
  /// **'No saved trips'**
  String get tripsSavedEmpty;

  /// No description provided for @tripsSavedStale.
  ///
  /// In en, this message translates to:
  /// **'Saved plan: station status and hours may have changed since.'**
  String get tripsSavedStale;

  /// No description provided for @tripsStopChargeTime.
  ///
  /// In en, this message translates to:
  /// **'Charging time'**
  String get tripsStopChargeTime;

  /// No description provided for @tripsStopN.
  ///
  /// In en, this message translates to:
  /// **'Stop {n}: {name}'**
  String tripsStopN(int n, String name);

  /// No description provided for @tripsStopsSummary.
  ///
  /// In en, this message translates to:
  /// **'{stops, plural, =0{No charging stops} =1{1 charging stop} other{{stops} charging stops}} · {distance}'**
  String tripsStopsSummary(int stops, String distance);

  /// No description provided for @tripsTitle.
  ///
  /// In en, this message translates to:
  /// **'Trip planner'**
  String get tripsTitle;

  /// No description provided for @tripsTo.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get tripsTo;

  /// No description provided for @tripsTooManyStops.
  ///
  /// In en, this message translates to:
  /// **'No plan: the trip would need too many charging stops.'**
  String get tripsTooManyStops;

  /// No description provided for @tripsUsePoint.
  ///
  /// In en, this message translates to:
  /// **'Use this point'**
  String get tripsUsePoint;

  /// No description provided for @tripsVehicleDataMissing.
  ///
  /// In en, this message translates to:
  /// **'No plan: this car is missing verified data ({missing}). Enter it under Assumptions if you know it.'**
  String tripsVehicleDataMissing(String missing);
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
