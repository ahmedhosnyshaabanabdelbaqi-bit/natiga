// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String accountCarsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count cars', one: '1 car');
    return '$_temp0';
  }

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
  String get accountTripPlannerExplain =>
      'Trip planning needs a road-routing service, which is not configured on the server yet. We do not draw straight lines as driving routes or invent plans, so the planner stays hidden until it is. Meanwhile, every station page offers directions in your navigation app.';

  @override
  String get accountTripPlannerUnavailable => 'Not available yet';

  @override
  String accountUnreadCount(int count) {
    return '$count new';
  }

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
  String get calculatorsAcLimitHint => 'Often 7.4, 11 or 22 kW. Unknown = lower confidence.';

  @override
  String get calculatorsAssumptions => 'Values and assumptions used';

  @override
  String get calculatorsAssumptionsHint => 'Change any of them above and calculate again.';

  @override
  String get calculatorsBasisBattery => 'Added to the battery';

  @override
  String get calculatorsBasisBatteryConsumption => 'From the car\'s display';

  @override
  String get calculatorsBasisGrid => 'From the meter / charger';

  @override
  String get calculatorsBasisGridConsumption => 'At the plug (WLTP/EPA)';

  @override
  String get calculatorsCalculate => 'Calculate';

  @override
  String get calculatorsCalculatorTitle => 'Calculator';

  @override
  String get calculatorsCarNeedsNetwork =>
      'Using a car\'s data needs a connection. Remove the car to calculate offline with your own values.';

  @override
  String get calculatorsCarOptional => 'Optional: fill missing values from a car';

  @override
  String get calculatorsCarSelectedHint => 'Empty fields are filled from this car\'s catalog data';

  @override
  String get calculatorsChooseCar => 'Use a car\'s data';

  @override
  String get calculatorsChooseCarHint =>
      'Missing values (battery, charging power, consumption) are filled from the catalog, with their source. Values you type always win. Needs an internet connection.';

  @override
  String get calculatorsCompareFuelCar => 'Compare with a fuel car';

  @override
  String get calculatorsConfidenceHigh => 'High confidence';

  @override
  String get calculatorsConfidenceLow => 'Low confidence';

  @override
  String get calculatorsConfidenceMedium => 'Medium confidence';

  @override
  String get calculatorsConsumptionBasis => 'The consumption I enter is measured';

  @override
  String get calculatorsConsumptionHint => 'From your car or a rating such as WLTP. Cycles are not converted.';

  @override
  String get calculatorsCostEnergy => 'Energy';

  @override
  String get calculatorsCostIdle => 'Idle fee';

  @override
  String get calculatorsCostParking => 'Parking';

  @override
  String get calculatorsCostPer100 => 'Cost per 100 km';

  @override
  String get calculatorsCostPerKm => 'Cost per km';

  @override
  String get calculatorsCostPerKwhAdded => 'Cost per kWh added';

  @override
  String get calculatorsCostSession => 'Session fee';

  @override
  String get calculatorsCostTime => 'Time';

  @override
  String get calculatorsCurrency => 'Currency';

  @override
  String get calculatorsDcCurveHint =>
      'A precise DC time needs the car\'s documented charging curve, which comes from the catalog when you choose a car. Without it you get a low-confidence range.';

  @override
  String get calculatorsDifferenceHint => 'Fuel cost minus electricity cost; a negative value means the EV costs more.';

  @override
  String get calculatorsDifferencePer100 => 'You save per 100 km';

  @override
  String get calculatorsDifferencePerMonth => 'Difference per month';

  @override
  String get calculatorsDifferencePerYear => 'Difference per year';

  @override
  String get calculatorsDuration => 'Charging time';

  @override
  String get calculatorsDurationRange => 'Estimated range';

  @override
  String calculatorsEffectiveFrom(String date) {
    return 'Effective $date';
  }

  @override
  String get calculatorsEfficiencyHint => 'A fraction, e.g. 0.9 = 90%. Empty = 0.9, shown as an editable assumption.';

  @override
  String get calculatorsEnergyAdded => 'Energy added to the battery';

  @override
  String get calculatorsEnergyCost => 'Energy / fuel';

  @override
  String get calculatorsEnergyPerMonth => 'Energy cost per month';

  @override
  String get calculatorsEnterMyOwn => 'Enter my own price';

  @override
  String get calculatorsEv => 'Electric';

  @override
  String get calculatorsEvPer100 => 'Electric per 100 km';

  @override
  String get calculatorsEvPerMonth => 'Electric per month';

  @override
  String get calculatorsEvTotal => 'Electric car total';

  @override
  String get calculatorsFees => 'Licence & fees';

  @override
  String get calculatorsFieldAcLimit => 'Car on-board AC charger';

  @override
  String get calculatorsFieldAmps => 'Current per phase';

  @override
  String get calculatorsFieldChargingMinutes => 'Charging time';

  @override
  String get calculatorsFieldConsumption => 'Consumption';

  @override
  String get calculatorsFieldDcPeak => 'Car peak DC power';

  @override
  String get calculatorsFieldEfficiency => 'Charging efficiency';

  @override
  String get calculatorsFieldElectricityPrice => 'Main electricity price (home)';

  @override
  String get calculatorsFieldEnergy => 'Energy';

  @override
  String get calculatorsFieldFees => 'Licence & fees per year';

  @override
  String get calculatorsFieldFixedFees => 'Fixed monthly fees';

  @override
  String get calculatorsFieldFromSoc => 'Charge from';

  @override
  String get calculatorsFieldFuelConsumption => 'Fuel consumption';

  @override
  String get calculatorsFieldFuelPrice => 'Fuel price per litre';

  @override
  String get calculatorsFieldHomePrice => 'Home electricity price';

  @override
  String get calculatorsFieldIdleGrace => 'Free idle minutes';

  @override
  String get calculatorsFieldIdleMinutes => 'Idle time after charging';

  @override
  String get calculatorsFieldIdlePrice => 'Idle fee per minute';

  @override
  String get calculatorsFieldIncentives => 'Incentives';

  @override
  String get calculatorsFieldInsurance => 'Insurance per year';

  @override
  String get calculatorsFieldKmPerDay => 'Distance per day';

  @override
  String get calculatorsFieldKmPerMonth => 'Distance per month';

  @override
  String get calculatorsFieldKmPerYear => 'Distance per year';

  @override
  String get calculatorsFieldMaintenance => 'Maintenance per year';

  @override
  String get calculatorsFieldOneOff => 'One-off costs';

  @override
  String get calculatorsFieldParkingFlat => 'Flat parking fee';

  @override
  String get calculatorsFieldParkingMinutes => 'Parking time';

  @override
  String get calculatorsFieldParkingPerHour => 'Parking per hour';

  @override
  String get calculatorsFieldPublicEnergyPrice => 'Price per kWh';

  @override
  String get calculatorsFieldPublicPrice => 'Public charging price';

  @override
  String get calculatorsFieldPublicShare => 'Share of public charging';

  @override
  String get calculatorsFieldPurchase => 'Purchase price';

  @override
  String get calculatorsFieldResidual => 'Resale value at the end';

  @override
  String get calculatorsFieldSessionFee => 'Session fee';

  @override
  String get calculatorsFieldStationPower => 'Charger / station power';

  @override
  String get calculatorsFieldTimePrice => 'Price per minute of charging';

  @override
  String get calculatorsFieldToSoc => 'Charge to';

  @override
  String get calculatorsFieldUsable => 'Usable battery capacity';

  @override
  String get calculatorsFieldVolts => 'Volts per phase';

  @override
  String get calculatorsFieldYears => 'Years of ownership';

  @override
  String get calculatorsFixedFees => 'Fixed fees';

  @override
  String get calculatorsFromCarHint => 'Leave empty to use the car\'s catalog value.';

  @override
  String get calculatorsFuelCar => 'Fuel';

  @override
  String get calculatorsFuelPer100 => 'Fuel per 100 km';

  @override
  String get calculatorsFuelPerMonth => 'Fuel per month';

  @override
  String get calculatorsGridConsumption => 'Consumption from the grid';

  @override
  String get calculatorsGridEnergy => 'Energy from the grid';

  @override
  String get calculatorsHomeDescription =>
      'Energy added, energy from the grid with losses, and the cost at your home tariff.';

  @override
  String get calculatorsHomeTitle => 'Home charging cost';

  @override
  String get calculatorsHowCalculated => 'How it was calculated';

  @override
  String get calculatorsIncentives => 'Incentives';

  @override
  String get calculatorsInsurance => 'Insurance';

  @override
  String get calculatorsIntro =>
      'Results are computed from the values you enter, with the same formulas as our server. There are no built-in prices: enter today\'s prices or pick an admin reference price with its date and source.';

  @override
  String get calculatorsKmPerMonth => 'Distance per month';

  @override
  String get calculatorsKwhPerMonth => 'Energy per month';

  @override
  String get calculatorsLimitCurve => 'The charging curve';

  @override
  String get calculatorsLimitStation => 'The charger';

  @override
  String get calculatorsLimitSupply => 'The home supply';

  @override
  String get calculatorsLimitVehicle => 'The car';

  @override
  String get calculatorsLimitingFactor => 'Limited by';

  @override
  String get calculatorsLosses => 'Charging losses';

  @override
  String get calculatorsMaintenance => 'Maintenance';

  @override
  String get calculatorsModeEnergy => 'Energy I know';

  @override
  String get calculatorsModeSoc => 'Battery & charge levels';

  @override
  String get calculatorsMonthlyDescription => 'Monthly and yearly energy cost from your distance and consumption.';

  @override
  String get calculatorsMonthlyTitle => 'Monthly cost';

  @override
  String get calculatorsNo => 'No';

  @override
  String get calculatorsNoCar => 'Don\'t use a car';

  @override
  String get calculatorsNoCarSelected => 'No car selected';

  @override
  String get calculatorsNoDefaultPrices => 'Prices change: the result shows the date of the prices you used.';

  @override
  String get calculatorsNoReferencePrices => 'No reference prices for this market';

  @override
  String get calculatorsNoReferencePricesHint => 'Enter the price you pay. We never assume a price.';

  @override
  String get calculatorsNonEnergy => 'Everything except energy';

  @override
  String get calculatorsNotIncluded => 'Not included';

  @override
  String get calculatorsOnDevice => 'Calculated on this phone';

  @override
  String get calculatorsOnServer => 'Calculated with catalog data';

  @override
  String get calculatorsOneOff => 'One-off costs';

  @override
  String get calculatorsOneOffHint => 'e.g. home charger installation.';

  @override
  String get calculatorsOriginCatalog => 'From catalog';

  @override
  String get calculatorsOriginDefault => 'Default';

  @override
  String get calculatorsOriginReference => 'Reference price';

  @override
  String get calculatorsOriginUser => 'You entered';

  @override
  String get calculatorsPer100Description =>
      'What 100 km costs in electricity, with home and public prices mixed as you drive.';

  @override
  String get calculatorsPer100Title => 'Cost per 100 km';

  @override
  String get calculatorsPerDayMode => 'Per day';

  @override
  String get calculatorsPerKm => 'Per km';

  @override
  String get calculatorsPerMonth => 'Per month';

  @override
  String get calculatorsPerMonthMode => 'Per month';

  @override
  String get calculatorsPerMonthTotal => 'Per month';

  @override
  String get calculatorsPerYear => 'Per year';

  @override
  String calculatorsPerYearValue(String amount) {
    return '$amount per year';
  }

  @override
  String get calculatorsPickTrim => 'Pick a trim from the catalog';

  @override
  String get calculatorsPossiblyOutdated => 'May be outdated';

  @override
  String get calculatorsPower => 'Power used';

  @override
  String get calculatorsPriceDate => 'Price date';

  @override
  String get calculatorsPriceDateFromReference => 'Empty = the effective date of the reference price.';

  @override
  String get calculatorsPriceDateHint => 'When these prices applied. Without a date the result says so.';

  @override
  String get calculatorsPriceDateMissing => 'Price date not given';

  @override
  String get calculatorsPriceDateNotSet => 'Not set';

  @override
  String get calculatorsPricePerKwh => 'Price per kWh used';

  @override
  String calculatorsPricesAsOf(String date) {
    return 'Prices as of $date';
  }

  @override
  String get calculatorsPublicDescription =>
      'Per-kWh, per-minute, session, parking and idle fees exactly as the operator charges them.';

  @override
  String get calculatorsPublicTitle => 'Public charging cost';

  @override
  String get calculatorsPurchase => 'Purchase';

  @override
  String get calculatorsReferencePrices => 'Reference prices';

  @override
  String calculatorsReferenceUsed(String label, String date) {
    return 'Reference price: $label, effective $date';
  }

  @override
  String get calculatorsResidual => 'Resale value';

  @override
  String get calculatorsResult => 'Result';

  @override
  String get calculatorsRoughEstimate => 'Rough estimate — not an exact time';

  @override
  String get calculatorsSavingPercent => 'Saving';

  @override
  String get calculatorsSectionConsumption => 'Consumption';

  @override
  String get calculatorsSectionDriving => 'Driving';

  @override
  String get calculatorsSectionDrivingOptional => 'Driving (optional, for monthly figures)';

  @override
  String get calculatorsSectionDurations => 'Times at the charger';

  @override
  String get calculatorsSectionEnergy => 'Battery & energy';

  @override
  String get calculatorsSectionEvCosts => 'Electric car costs';

  @override
  String get calculatorsSectionFuel => 'Fuel car';

  @override
  String get calculatorsSectionFuelCar => 'Fuel car costs';

  @override
  String get calculatorsSectionOwnership => 'Ownership';

  @override
  String get calculatorsSectionPower => 'Power';

  @override
  String get calculatorsSectionPrices => 'Currency & price date';

  @override
  String get calculatorsSectionTariff => 'Prices';

  @override
  String get calculatorsSupplyLimit => 'Home supply limit';

  @override
  String get calculatorsSupplyNone => 'Not limited';

  @override
  String get calculatorsSupplyOne => 'Single phase';

  @override
  String get calculatorsSupplyThree => 'Three phase';

  @override
  String get calculatorsTcoDescription =>
      'Purchase, incentives, resale, energy, insurance and maintenance over the years you choose.';

  @override
  String calculatorsTcoDifference(String amount) {
    return 'Fuel car minus EV: $amount';
  }

  @override
  String get calculatorsTcoTitle => 'Total cost of ownership';

  @override
  String get calculatorsTimeDescription =>
      'AC time from the real power limit; DC from a documented curve, otherwise a low-confidence range.';

  @override
  String get calculatorsTimeTitle => 'Charging time';

  @override
  String get calculatorsTitle => 'Charging & running-cost calculators';

  @override
  String get calculatorsTotal => 'Total';

  @override
  String get calculatorsTotalCost => 'Total cost';

  @override
  String get calculatorsTotalKm => 'Total distance';

  @override
  String get calculatorsUnknown => 'This calculator does not exist.';

  @override
  String get calculatorsUseReference => 'Use a reference price';

  @override
  String get calculatorsVoltsHint => 'Empty = 230 V (shown as an assumption).';

  @override
  String get calculatorsVsFuelDescription =>
      'Energy cost of your EV compared with a fuel car, per 100 km and per month.';

  @override
  String get calculatorsVsFuelTitle => 'Electric vs petrol';

  @override
  String get calculatorsYes => 'Yes';

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
  String get chargingLogsAdd => 'Add session';

  @override
  String get chargingLogsAdded => 'Session added.';

  @override
  String get chargingLogsAllCars => 'All cars';

  @override
  String get chargingLogsAvgPerKwh => 'Average per kWh';

  @override
  String get chargingLogsByLocation => 'Where you charge';

  @override
  String get chargingLogsCar => 'Car';

  @override
  String get chargingLogsConfidenceLow => 'Low confidence';

  @override
  String get chargingLogsConfidenceMedium => 'Medium confidence';

  @override
  String get chargingLogsConsumption => 'Consumption';

  @override
  String get chargingLogsCost => 'Amount paid';

  @override
  String get chargingLogsCostHint => 'Optional. Leave empty if you do not know it — it will not count as free.';

  @override
  String get chargingLogsCostPer100 => 'Cost per 100 km';

  @override
  String get chargingLogsCostSection => 'Cost';

  @override
  String get chargingLogsCurrency => 'Currency';

  @override
  String get chargingLogsCurrentType => 'Current type';

  @override
  String get chargingLogsCurrentUnknown => 'Not sure';

  @override
  String get chargingLogsDate => 'Date and time';

  @override
  String get chargingLogsDelete => 'Delete session';

  @override
  String get chargingLogsDeleteConfirm => 'Delete this session?';

  @override
  String get chargingLogsDeleteMessage => 'It will be removed from your reports.';

  @override
  String get chargingLogsDeleted => 'Session deleted.';

  @override
  String get chargingLogsDistance => 'Distance';

  @override
  String get chargingLogsDuration => 'Duration';

  @override
  String get chargingLogsEditTitle => 'Edit charging session';

  @override
  String get chargingLogsEmptyMessage =>
      'Log the energy, cost and odometer of each charge. Reports are built only from what you enter.';

  @override
  String get chargingLogsEmptyTitle => 'No charging sessions yet';

  @override
  String get chargingLogsEnergy => 'Energy charged';

  @override
  String get chargingLogsEnergyHint => 'As shown by the charger, app or meter.';

  @override
  String chargingLogsErrorMax(String max) {
    return 'Must be at most $max.';
  }

  @override
  String get chargingLogsErrorPositive => 'Must be greater than zero.';

  @override
  String get chargingLogsErrorRequired => 'Required.';

  @override
  String get chargingLogsErrorSoc => 'The end level must be above the start level.';

  @override
  String get chargingLogsGuestMessage =>
      'Sign in to keep a private log of your charging sessions and see your real spending and consumption.';

  @override
  String chargingLogsInCurrency(String currency) {
    return 'In $currency';
  }

  @override
  String get chargingLogsLoadMore => 'Load more';

  @override
  String get chargingLogsLocation => 'Where';

  @override
  String get chargingLogsLocationHome => 'Home';

  @override
  String get chargingLogsLocationOther => 'Other';

  @override
  String get chargingLogsLocationPublic => 'Public';

  @override
  String get chargingLogsLocationWork => 'Work';

  @override
  String get chargingLogsLowConfidenceHint =>
      'Based on few readings or a short distance. Log more sessions with the odometer for a better figure.';

  @override
  String get chargingLogsMethod => 'How this is calculated';

  @override
  String get chargingLogsMixedCurrencies =>
      'You paid in more than one currency. Amounts are shown per currency and never converted.';

  @override
  String get chargingLogsMonthlyEnergy => 'Monthly energy';

  @override
  String get chargingLogsMonthlySpend => 'Monthly spending';

  @override
  String get chargingLogsMoreHint => 'Optional. The odometer reading makes consumption reports possible.';

  @override
  String get chargingLogsMoreSection => 'More details';

  @override
  String get chargingLogsNewTitle => 'New charging session';

  @override
  String get chargingLogsNoCarMessage => 'Each charging session belongs to a car in your garage.';

  @override
  String get chargingLogsNoCarTitle => 'Add your car first';

  @override
  String get chargingLogsNoCost => 'No cost entered';

  @override
  String get chargingLogsNoSpendData => 'No costs were entered in this period.';

  @override
  String get chargingLogsNotes => 'Notes';

  @override
  String get chargingLogsOdometer => 'Odometer';

  @override
  String get chargingLogsOdometerHint => 'Must not be lower than an earlier session of this car.';

  @override
  String chargingLogsPerKwh(String price) {
    return '$price/kWh';
  }

  @override
  String get chargingLogsPeriod12 => '12 months';

  @override
  String get chargingLogsPeriod3 => '3 months';

  @override
  String get chargingLogsPeriod6 => '6 months';

  @override
  String get chargingLogsPeriodAll => 'All time';

  @override
  String get chargingLogsPower => 'Charger power';

  @override
  String get chargingLogsReasonMissingCosts => 'Insufficient data: some costs missing';

  @override
  String get chargingLogsReasonMixedCurrencies => 'Not shown: mixed currencies';

  @override
  String get chargingLogsReasonNoDistance => 'Insufficient data: no distance between readings';

  @override
  String get chargingLogsReasonNoSessions => 'Insufficient data: no sessions';

  @override
  String get chargingLogsReasonOdometer => 'Insufficient data: needs 2+ odometer readings';

  @override
  String get chargingLogsReasonUnknown => 'Insufficient data';

  @override
  String get chargingLogsReportEmptyMessage =>
      'Reports use only the sessions you log. Add a session or choose a longer period.';

  @override
  String get chargingLogsReportEmptyTitle => 'No sessions in this period';

  @override
  String get chargingLogsReportsTitle => 'Spending & consumption';

  @override
  String get chargingLogsSaved => 'Session saved.';

  @override
  String get chargingLogsSessionSection => 'Session';

  @override
  String get chargingLogsSessions => 'Sessions';

  @override
  String chargingLogsSessionsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count sessions', one: '1 session');
    return '$_temp0';
  }

  @override
  String chargingLogsSessionsWithoutCost(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count sessions have no cost and are not in the spending totals.',
      one: '1 session has no cost and is not in the spending totals.',
    );
    return '$_temp0';
  }

  @override
  String get chargingLogsShowTable => 'Show the numbers';

  @override
  String get chargingLogsSocEnd => 'Battery at end';

  @override
  String get chargingLogsSocStart => 'Battery at start';

  @override
  String get chargingLogsTitle => 'Charging log';

  @override
  String get chargingLogsTotalEnergy => 'Energy';

  @override
  String get chargingLogsTotalSpend => 'Spent';

  @override
  String chargingLogsVehicleSummary(int sessions, String energy) {
    String _temp0 = intl.Intl.pluralLogic(sessions, locale: localeName, other: '$sessions sessions', one: '1 session');
    return '$_temp0 · $energy';
  }

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
  String communityAboutCar(String car) {
    return 'About: $car';
  }

  @override
  String get communityAccept => 'Accept answer';

  @override
  String get communityAcceptCleared => 'Acceptance removed';

  @override
  String get communityAccepted => 'Answer accepted';

  @override
  String get communityAcceptedAnswer => 'Accepted answer';

  @override
  String get communityAllReviews => 'All reviews';

  @override
  String get communityAnonymous => 'User';

  @override
  String communityAnswerCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count answers',
      one: '1 answer',
      zero: 'No answers',
    );
    return '$_temp0';
  }

  @override
  String get communityAnswerHint => 'Write your answer…';

  @override
  String get communityAnswerPosted => 'Your answer is posted';

  @override
  String get communityAnswered => 'Answered';

  @override
  String get communityAnswersTitle => 'Answers';

  @override
  String communityAnswersWithCount(String count) {
    return 'Answers ($count)';
  }

  @override
  String get communityAskGeneral => 'General question';

  @override
  String get communityAskTips =>
      'Write a clear, specific question (at least 10 characters) and mention the market and trim if they matter. No links or personal data.';

  @override
  String get communityAskTitle => 'Ask a question';

  @override
  String communityAskedBy(String name) {
    return 'Asked by $name';
  }

  @override
  String get communityBeFirstToReview => 'Be the first to review';

  @override
  String get communityBlockConfirm => 'Block';

  @override
  String get communityBlockMessage =>
      'You won\'t see their reviews, comments, questions or answers any more. They won\'t be told, and you can unblock at any time.';

  @override
  String communityBlockTitle(String name) {
    return 'Block $name?';
  }

  @override
  String get communityBlockUser => 'Block this user';

  @override
  String communityBlocked(String name) {
    return '$name blocked';
  }

  @override
  String get communityBlockedIndefinite =>
      'A moderator paused posting from your account until further notice. You can still read.';

  @override
  String communityBlockedReason(String reason) {
    return 'Reason: $reason';
  }

  @override
  String get communityBlockedTitle => 'Posting is paused for your account';

  @override
  String communityBlockedUntil(String until) {
    return 'A moderator paused posting from your account until $until. You can still read.';
  }

  @override
  String get communityBlockedUsersIntro => 'You don\'t see these users\' community posts.';

  @override
  String get communityBlockedUsersTitle => 'Blocked users';

  @override
  String get communityCancelReply => 'Cancel reply';

  @override
  String get communityCarReviewsTitle => 'Owner reviews';

  @override
  String get communityChooseTrim => 'Choose a trim';

  @override
  String get communityClearFilters => 'Clear filters';

  @override
  String get communityClearRating => 'Clear';

  @override
  String get communityCommentHint => 'Write a comment…';

  @override
  String get communityCommentPosted => 'Your comment is posted';

  @override
  String get communityCommentsClosed => 'Comments are closed here.';

  @override
  String get communityCommentsTitle => 'Comments';

  @override
  String communityCommentsWithCount(String count) {
    return 'Comments ($count)';
  }

  @override
  String get communityCons => 'Cons';

  @override
  String get communityConsHint => 'What didn\'t you like?';

  @override
  String get communityCreateAccount => 'Create account';

  @override
  String get communityDelete => 'Delete';

  @override
  String get communityDeleteAnswerTitle => 'Delete answer?';

  @override
  String get communityDeleteCommentTitle => 'Delete comment?';

  @override
  String get communityDeleteMessage => 'This can\'t be undone.';

  @override
  String get communityDeleteQuestionTitle => 'Delete question?';

  @override
  String get communityDeleteReview => 'Delete review';

  @override
  String get communityDeleteReviewTitle => 'Delete your review?';

  @override
  String get communityDeleted => 'Deleted';

  @override
  String get communityDeletedUser => 'Deleted user';

  @override
  String get communityDemoTargetNotice => 'This is demo data for testing, not a real car or article.';

  @override
  String get communityDimAfterSales => 'After-sales service';

  @override
  String get communityDimBuildQuality => 'Build quality';

  @override
  String get communityDimCharging => 'Charging';

  @override
  String get communityDimComfort => 'Comfort';

  @override
  String get communityDimRange => 'Real-world range';

  @override
  String get communityDimReliability => 'Reliability';

  @override
  String get communityDimTechnology => 'Technology';

  @override
  String get communityDimValue => 'Value for money';

  @override
  String communityDimensionScore(String dimension, int score) {
    return '$dimension: $score out of 5';
  }

  @override
  String communityDimensionValue(String value, int count) {
    return '$value out of 5, $count ratings';
  }

  @override
  String get communityDimensionsHint => 'Optional: rate specific aspects';

  @override
  String get communityDimensionsTitle => 'Ratings by aspect';

  @override
  String communityDistributionRow(int stars, int count) {
    return '$stars stars: $count';
  }

  @override
  String get communityDone => 'Done';

  @override
  String get communityEdit => 'Edit';

  @override
  String get communityEditAnswer => 'Edit answer';

  @override
  String get communityEditComment => 'Edit comment';

  @override
  String get communityEditMyReview => 'Edit my review';

  @override
  String get communityEditQuestion => 'Edit question';

  @override
  String get communityEditRemoderated => 'After editing, your review goes back to review before it appears again.';

  @override
  String get communityEditReviewTitle => 'Edit your review';

  @override
  String get communityEdited => 'edited';

  @override
  String get communityErrEmailNotVerified => 'Verify your e-mail before posting.';

  @override
  String get communityErrRateLimited => 'You\'ve posted a lot in a short time. Please try again later.';

  @override
  String communityErrRateLimitedMinutes(int minutes) {
    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other: 'You\'ve posted a lot in a short time. Try again in $minutes minutes.',
      one: 'You\'ve posted a lot in a short time. Try again in a minute.',
    );
    return '$_temp0';
  }

  @override
  String get communityErrReportDuplicate => 'You already reported this; your report is being reviewed.';

  @override
  String get communityErrSelfReport => 'You can\'t report your own post.';

  @override
  String get communityErrSelfVote => 'You can\'t vote on your own post.';

  @override
  String get communityErrSignInAgain => 'Your session ended. Please sign in again.';

  @override
  String get communityFieldRequired => 'This field is required.';

  @override
  String get communityFilterAll => 'All';

  @override
  String get communityFilterAnswered => 'Answered';

  @override
  String get communityFilterUnanswered => 'Unanswered';

  @override
  String get communityFormHasErrors => 'Please fix the highlighted fields.';

  @override
  String get communityGeneralQuestion => 'General question';

  @override
  String get communityHelpful => 'Helpful';

  @override
  String communityHelpfulCount(String count) {
    return 'Helpful ($count)';
  }

  @override
  String get communityJoinTitle => 'Join the conversation';

  @override
  String get communityLoadMore => 'Load more';

  @override
  String get communityLoadMoreAnswers => 'More answers';

  @override
  String get communityLoadMoreComments => 'More comments';

  @override
  String get communityLoadMoreQuestions => 'More questions';

  @override
  String get communityLoadMoreReviews => 'More reviews';

  @override
  String get communityMonthsUnit => 'months';

  @override
  String get communityMoreActions => 'More actions';

  @override
  String get communityNewAccountNote =>
      'Your account is new: your posts are reviewed before they appear, and links aren\'t allowed for the first few days.';

  @override
  String get communityNoAnswersMessage => 'Know the answer? Share what you\'ve experienced.';

  @override
  String get communityNoAnswersMineMessage => 'Answers will appear here when they arrive.';

  @override
  String get communityNoAnswersTitle => 'No answers yet';

  @override
  String get communityNoAnswersYet => 'No answers yet';

  @override
  String get communityNoBlockedMessage => 'You can block anyone from the actions menu next to their post.';

  @override
  String get communityNoBlockedTitle => 'No blocked users';

  @override
  String get communityNoCommentsMessage => 'Start the conversation with the first comment.';

  @override
  String get communityNoCommentsTitle => 'No comments yet';

  @override
  String get communityNoFilteredReviewsMessage => 'Try removing some filters.';

  @override
  String get communityNoFilteredReviewsTitle => 'No matching reviews';

  @override
  String get communityNoMatchingQuestionsMessage => 'Try other words or change the filter — or ask your question.';

  @override
  String get communityNoMatchingQuestionsTitle => 'No matching questions';

  @override
  String get communityNoQuestionsMessage => 'Ask owners and enthusiasts about charging, range and servicing.';

  @override
  String get communityNoQuestionsTitle => 'No questions yet';

  @override
  String get communityNoReviewsMessage => 'No owner has published a review of this trim yet.';

  @override
  String get communityNoReviewsTitle => 'No owner reviews yet';

  @override
  String get communityNoTrimsMessage =>
      'This car has no trims listed in your current market, so reviews can\'t be shown or written here.';

  @override
  String get communityNoTrimsTitle => 'No trims listed';

  @override
  String get communityNotAnsweredYet => 'Awaiting an accepted answer';

  @override
  String get communityNotHelpful => 'Not helpful';

  @override
  String communityOnArticle(String title) {
    return 'Comments on: $title. Open the article';
  }

  @override
  String get communityOnArticleLabel => 'Comments on';

  @override
  String get communityOptional => 'optional';

  @override
  String get communityOverallRating => 'Overall rating';

  @override
  String communityOwnedMonths(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Owned $count months',
      one: 'Owned 1 month',
      zero: 'Owned under a month',
    );
    return '$_temp0';
  }

  @override
  String communityOwnedYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'Owned $count years', one: 'Owned 1 year');
    return '$_temp0';
  }

  @override
  String communityOwnedYearsMonths(int years, int months) {
    return 'Owned $years yr $months mo';
  }

  @override
  String get communityOwnershipHint => 'e.g. 8';

  @override
  String get communityOwnershipInvalid => 'Enter a number of months from 0 to 600.';

  @override
  String get communityOwnershipLabel => 'How long you\'ve owned it';

  @override
  String get communityPostAnswer => 'Post answer';

  @override
  String get communityPostQuestion => 'Post question';

  @override
  String get communityPostedPending => 'Sent — it will appear to others after review.';

  @override
  String get communityPros => 'Pros';

  @override
  String get communityProsHint => 'What did you like?';

  @override
  String get communityQuestionBodyHint => 'Add anything that helps answer it: usage, charger type…';

  @override
  String get communityQuestionBodyLabel => 'Details';

  @override
  String get communityQuestionPosted => 'Your question is posted';

  @override
  String get communityQuestionTitle => 'Question';

  @override
  String get communityQuestionTitleHint => 'e.g. How long does home charging take from 20 to 80%?';

  @override
  String get communityQuestionTitleLabel => 'Your question';

  @override
  String get communityQuestionUnavailableMessage => 'It may have been removed or is still being reviewed.';

  @override
  String get communityQuestionUnavailableTitle => 'Question not available';

  @override
  String get communityQuestionsTitle => 'Questions & answers';

  @override
  String get communityRating1 => 'Poor';

  @override
  String get communityRating2 => 'Fair';

  @override
  String get communityRating3 => 'Good';

  @override
  String get communityRating4 => 'Very good';

  @override
  String get communityRating5 => 'Excellent';

  @override
  String get communityRatingRequired => 'Choose a rating from 1 to 5 stars.';

  @override
  String get communityReply => 'Reply';

  @override
  String get communityReplyHint => 'Write a reply…';

  @override
  String get communityReplyPosted => 'Your reply is posted';

  @override
  String communityReplyingTo(String name) {
    return 'Replying to $name';
  }

  @override
  String get communityReport => 'Report';

  @override
  String get communityReportDetails => 'Details (required)';

  @override
  String get communityReportDetailsOptional => 'More details (optional)';

  @override
  String get communityReportDetailsRequired => 'Add a few words to explain.';

  @override
  String get communityReportIntro => 'Choose a reason. Moderators review reports; the author won\'t see your name.';

  @override
  String get communityReportSend => 'Send report';

  @override
  String get communityReportSent => 'Thanks — your report reached the moderators.';

  @override
  String get communityReportTitle => 'Report content';

  @override
  String get communityReportUserTitle => 'Report a user';

  @override
  String get communityReviewBodyHelper =>
      'At least 20 characters. Write about your own experience only, with no one\'s personal data.';

  @override
  String get communityReviewBodyHint =>
      'How do you use the car? What range do you really get? How are charging and servicing?';

  @override
  String get communityReviewBodyLabel => 'Your experience';

  @override
  String communityReviewCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count reviews',
      one: '1 review',
      zero: 'No reviews',
    );
    return '$_temp0';
  }

  @override
  String get communityReviewExistsMessage =>
      'Each owner can write one review per trim. Do you want to edit your existing review?';

  @override
  String get communityReviewExistsTitle => 'You already reviewed this trim';

  @override
  String get communityReviewGuidelines => 'Be specific and honest; no links, ads or personal data.';

  @override
  String get communityReviewModerated => 'Moderators check every review before it\'s published.';

  @override
  String get communityReviewSubmittedMessage =>
      'Thank you! Your review will appear to others after moderators check it. You can see and edit it on the reviews page.';

  @override
  String get communityReviewSubmittedTitle => 'Review received';

  @override
  String get communityReviewTitleHint => 'Your experience in one line';

  @override
  String get communityReviewTitleLabel => 'Title';

  @override
  String get communityReviewsDisclaimer =>
      'Reviews are owners\' personal opinions and experiences, checked by moderators before publishing — not official data or certified measurements.';

  @override
  String get communitySave => 'Save';

  @override
  String get communitySaveReview => 'Save and resubmit';

  @override
  String get communitySearchQuestions => 'Search questions';

  @override
  String get communitySend => 'Send';

  @override
  String get communityShowAllQuestions => 'Show all questions';

  @override
  String get communityShowLess => 'Show less';

  @override
  String get communityShowMore => 'Show more';

  @override
  String get communitySignIn => 'Sign in';

  @override
  String get communitySignInToAnswer => 'Sign in to add an answer.';

  @override
  String get communitySignInToAsk => 'Sign in to ask the community a question.';

  @override
  String get communitySignInToComment => 'Sign in to comment or reply.';

  @override
  String get communitySignInToParticipate => 'Anyone can read. Sign in to take part in the community.';

  @override
  String get communitySignInToReport => 'Sign in to report content.';

  @override
  String get communitySignInToReview => 'Sign in to write your owner review of this car.';

  @override
  String get communitySignInToVote => 'Sign in to mark posts as helpful.';

  @override
  String get communitySortActive => 'Most active';

  @override
  String get communitySortHelpful => 'Most helpful';

  @override
  String get communitySortNewest => 'Newest';

  @override
  String get communitySortOldest => 'Oldest';

  @override
  String get communitySortRatingHigh => 'Highest rating';

  @override
  String get communitySortRatingLow => 'Lowest rating';

  @override
  String get communitySortRecent => 'Most recent';

  @override
  String get communitySortTop => 'Most helpful';

  @override
  String get communitySortVotes => 'Most votes';

  @override
  String communityStarOption(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count stars', one: '1 star');
    return '$_temp0';
  }

  @override
  String communityStarsSemantics(String rating) {
    return '$rating out of 5 stars';
  }

  @override
  String get communityStatusHidden => 'Hidden by moderators';

  @override
  String get communityStatusHiddenHint =>
      'It\'s no longer visible to others (for example after reports). Moderators can restore it.';

  @override
  String get communityStatusPending => 'Awaiting review';

  @override
  String get communityStatusPendingHint => 'Only you can see this until a moderator approves it.';

  @override
  String get communityStatusPendingReviewHint =>
      'Moderators check every review before it\'s published. Only you can see it for now.';

  @override
  String get communityStatusRejected => 'Not approved';

  @override
  String get communityStatusRejectedHint =>
      'It doesn\'t follow the community guidelines, so only you can see it. You can edit or delete it.';

  @override
  String get communityStatusUnknownTitle => 'Couldn\'t check your account status';

  @override
  String get communitySubmitReview => 'Submit for review';

  @override
  String get communityTapToRate => 'Tap the stars to rate';

  @override
  String communityTooLong(int max) {
    return 'At most $max characters.';
  }

  @override
  String communityTooShort(int min) {
    return 'Write at least $min characters.';
  }

  @override
  String get communityTrimLabel => 'Trim';

  @override
  String communityTrimSemantics(String trim) {
    return 'Trim: $trim. Tap to change';
  }

  @override
  String get communityUnaccept => 'Remove acceptance';

  @override
  String get communityUnblock => 'Unblock';

  @override
  String communityUnblocked(String name) {
    return '$name unblocked';
  }

  @override
  String get communityUndo => 'Undo';

  @override
  String get communityVerifiedAlready => 'I\'ve verified it';

  @override
  String get communityVerifiedOnly => 'Verified owners only';

  @override
  String get communityVerifiedOwner => 'Verified owner';

  @override
  String communityVerifiedOwnerCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count verified owners',
      one: '1 verified owner',
    );
    return '$_temp0';
  }

  @override
  String get communityVerifiedOwnerExplainer =>
      'The \"Verified owner\" badge can\'t be chosen: it appears only after our team actually verifies that you own the car.';

  @override
  String get communityVerifiedOwnerHint => 'Our team verified that the author owns this car.';

  @override
  String get communityVerifyEmailAction => 'Verify e-mail';

  @override
  String communityVerifyEmailMessage(String email) {
    return 'To post in the community, $email must be verified. Open the message we sent or request a new one.';
  }

  @override
  String get communityVerifyEmailTitle => 'Verify your e-mail first';

  @override
  String get communityViewAllComments => 'View all comments';

  @override
  String communityViewMoreReplies(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'View $count more replies',
      one: 'View 1 more reply',
    );
    return '$_temp0';
  }

  @override
  String communityVoteDownSemantics(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Not helpful, $count votes',
      one: 'Not helpful, 1 vote',
      zero: 'Not helpful, no votes',
    );
    return '$_temp0';
  }

  @override
  String communityVoteUpSemantics(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Helpful, $count votes',
      one: 'Helpful, 1 vote',
      zero: 'Helpful, no votes',
    );
    return '$_temp0';
  }

  @override
  String get communityWriteReviewTitle => 'Write a review';

  @override
  String get communityYou => 'You';

  @override
  String get communityYourAnswer => 'Your answer';

  @override
  String get communityYourReview => 'Your review';

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
  String get encyclopediaBrowseAll => 'Browse the encyclopedia';

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
  String get encyclopediaNotFoundMessage =>
      'It may have been removed or is being updated after a new technical review.';

  @override
  String get encyclopediaNotFoundTitle => 'This guide isn\'t available';

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
  String get garageAddButton => 'Add to my garage';

  @override
  String get garageAddFirst => 'Add my first car';

  @override
  String get garageAddLog => 'Add a charging session';

  @override
  String get garageAddReminder => 'Add a reminder';

  @override
  String get garageAddTitle => 'Add a car';

  @override
  String get garageAdded => 'Car added to your garage.';

  @override
  String get garageBack => 'Back';

  @override
  String get garageCarSection => 'Car';

  @override
  String get garageCarSectionHint => 'Pick the exact trim from the catalog, so specs and compatibility are right.';

  @override
  String get garageChangeCar => 'Tap to change';

  @override
  String get garageChooseCar => 'Choose brand, model, year and trim';

  @override
  String get garageClear => 'Clear';

  @override
  String garageCount(int count, int max) {
    return '$count of $max cars';
  }

  @override
  String get garageCurrentOdometer => 'Current odometer';

  @override
  String get garageCurrentOdometerHint => 'Optional. It also updates automatically from your charging log entries.';

  @override
  String get garageDelete => 'Remove from garage';

  @override
  String get garageDeleteConfirmMessage =>
      'Its charging log entries and reminders will be deleted too. This cannot be undone.';

  @override
  String garageDeleteConfirmTitle(String name) {
    return 'Remove $name?';
  }

  @override
  String get garageDeleted => 'Car removed.';

  @override
  String get garageDetailsSection => 'Details';

  @override
  String get garageEditTitle => 'Edit car';

  @override
  String get garageEmptyMessage =>
      'Add your car by choosing its brand, model, model year and trim. You can save up to 20 cars.';

  @override
  String get garageEmptyTitle => 'Your garage is empty';

  @override
  String get garageErrorCurrentBelowInitial => 'The current reading cannot be lower than the reading at purchase.';

  @override
  String get garageErrorNegative => 'Cannot be negative.';

  @override
  String get garageErrorNumber => 'Enter a number.';

  @override
  String get garageErrorPickCar => 'Choose the car first.';

  @override
  String get garageGuestMessage =>
      'Sign in to save your cars with their exact trim and market, and use them in the charging log, reminders and calculators.';

  @override
  String get garageInitialOdometer => 'Odometer at purchase';

  @override
  String get garageInitialOdometerHint => 'Optional. Used as the starting point of distance reports.';

  @override
  String garageLimitReached(int max) {
    return 'You can save up to $max cars. Remove one to add another.';
  }

  @override
  String get garageLogsCount => 'Charging sessions';

  @override
  String get garageMakePrimary => 'Make it my primary car';

  @override
  String get garageMarket => 'Market';

  @override
  String get garageMarketHint =>
      'The country where the car is used. Prices, currency and compatibility follow this market.';

  @override
  String get garageModelYear => 'Model year';

  @override
  String get garageNickname => 'Nickname';

  @override
  String get garageNicknameHint => 'Optional, e.g. \"Family car\".';

  @override
  String garageNotListedExplain(String market) {
    return 'This trim has no record in $market. Local prices and charger compatibility for $market are therefore not available for it.';
  }

  @override
  String get garageNotListedShort => 'Not sold in this market';

  @override
  String get garageNotes => 'Notes';

  @override
  String get garageOdometer => 'Odometer';

  @override
  String get garageOpenCalculators => 'Calculators';

  @override
  String get garageOpenLogs => 'Charging log of this car';

  @override
  String get garageOpenSpecs => 'Full specifications';

  @override
  String get garageOptional => 'Optional';

  @override
  String get garagePickerAllMarkets => 'Show trims from all markets';

  @override
  String get garagePickerAllMarketsHint => 'For imported cars not sold in your market.';

  @override
  String get garagePickerEmpty => 'Nothing to choose here yet';

  @override
  String garagePickerProgress(int step, int total) {
    return 'Step $step of $total';
  }

  @override
  String get garagePickerSearchBrand => 'Search brands';

  @override
  String get garagePickerSearchModel => 'Search models';

  @override
  String get garagePickerStepBrand => 'Brand';

  @override
  String get garagePickerStepModel => 'Model';

  @override
  String get garagePickerStepTrim => 'Trim';

  @override
  String get garagePickerStepYear => 'Year';

  @override
  String get garagePickerTitle => 'Choose your car';

  @override
  String get garagePrimary => 'Primary';

  @override
  String get garagePrimarySet => 'Primary car updated.';

  @override
  String get garagePrimarySwitch => 'Primary car';

  @override
  String get garagePrimarySwitchHint => 'Used by default in calculators, reports and trip planning.';

  @override
  String get garagePurchaseDate => 'Purchase date';

  @override
  String get garageRemindersCount => 'Open reminders';

  @override
  String get garageSaved => 'Changes saved.';

  @override
  String get garageShortcutsSection => 'Use this car';

  @override
  String get garageTitle => 'My garage';

  @override
  String get garageTrim => 'Trim';

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
  String get notificationsActions => 'More actions';

  @override
  String get notificationsChannelEmail => 'Email';

  @override
  String get notificationsChannelEmailUnavailable => 'Not available yet.';

  @override
  String get notificationsChannelInApp => 'In the app';

  @override
  String get notificationsChannelInAppHint => 'Always on: every notification is kept in this list.';

  @override
  String get notificationsChannelPush => 'Push notifications';

  @override
  String get notificationsChannelsSection => 'How to reach me';

  @override
  String get notificationsChooseTopics => 'Choose what to follow';

  @override
  String get notificationsDelete => 'Delete';

  @override
  String get notificationsDeleted => 'Notification deleted.';

  @override
  String get notificationsEmptyMessage =>
      'Follow brands, models or news categories to hear when something new is published.';

  @override
  String get notificationsEmptyTitle => 'No notifications yet';

  @override
  String get notificationsEmptyUnreadTitle => 'You are all caught up';

  @override
  String get notificationsFilterAll => 'All';

  @override
  String get notificationsFilterUnread => 'Unread';

  @override
  String get notificationsFollowBrand => 'Brand';

  @override
  String get notificationsFollowCategory => 'News category';

  @override
  String get notificationsFollowMarket => 'Market';

  @override
  String get notificationsFollowModel => 'Model';

  @override
  String notificationsFollowed(String name) {
    return 'Following $name.';
  }

  @override
  String get notificationsGuestMessage => 'Sign in to get news about the brands, models and topics you follow.';

  @override
  String get notificationsLoadMore => 'Load more';

  @override
  String get notificationsMarkAllRead => 'Mark all as read';

  @override
  String get notificationsMarkRead => 'Mark as read';

  @override
  String get notificationsMarkUnread => 'Mark as unread';

  @override
  String get notificationsNew => 'New';

  @override
  String get notificationsPreferencesTitle => 'Notification preferences';

  @override
  String get notificationsPushActive => 'Active on your registered devices.';

  @override
  String get notificationsPushDisabled => 'Turned off by you.';

  @override
  String get notificationsPushNoDevice => 'No device registered for push yet.';

  @override
  String get notificationsPushNotConfigured =>
      'Not available: the push service is not set up on the server yet. Notifications still appear in the app.';

  @override
  String get notificationsQuietChange => 'Change times';

  @override
  String get notificationsQuietEnabled => 'Quiet hours';

  @override
  String get notificationsQuietEnd => 'Quiet until';

  @override
  String get notificationsQuietHint => 'Push notifications wait until quiet hours end; they still appear in the app.';

  @override
  String get notificationsQuietOff => 'Off';

  @override
  String notificationsQuietRange(String start, String end, String zone) {
    return '$start – $end ($zone)';
  }

  @override
  String get notificationsQuietSection => 'Quiet hours';

  @override
  String get notificationsQuietStart => 'Quiet from';

  @override
  String get notificationsReminderNote => 'Reminder alerts on this phone are set in Reminders.';

  @override
  String get notificationsResume => 'Resume notifications';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get notificationsTopicBrand => 'Brand';

  @override
  String get notificationsTopicCategory => 'News category';

  @override
  String notificationsTopicInMarket(String market) {
    return 'in $market';
  }

  @override
  String get notificationsTopicMarket => 'Market';

  @override
  String get notificationsTopicModel => 'Model';

  @override
  String get notificationsTopicPriceAlert => 'Price alert';

  @override
  String get notificationsTopicStation => 'Station';

  @override
  String get notificationsTopicVariant => 'Trim';

  @override
  String get notificationsTopicsEmpty => 'You do not follow anything yet';

  @override
  String get notificationsTopicsHint => 'News published about these is sent to you once, in your language.';

  @override
  String get notificationsTopicsSection => 'Topics I follow';

  @override
  String get notificationsTypeCampaigns => 'Announcements';

  @override
  String get notificationsTypeCommunity => 'Community replies';

  @override
  String get notificationsTypeNews => 'News about what I follow';

  @override
  String get notificationsTypePriceAlerts => 'Price alerts';

  @override
  String get notificationsTypeReminders => 'Reminders';

  @override
  String get notificationsTypeStations => 'Charging station alerts';

  @override
  String get notificationsTypesHint => 'Turning any type on resumes notifications.';

  @override
  String get notificationsTypesSection => 'What to notify me about';

  @override
  String notificationsUnfollow(String name) {
    return 'Stop following $name';
  }

  @override
  String get notificationsUnsubscribeAll => 'Unsubscribe from all';

  @override
  String get notificationsUnsubscribeAllConfirm => 'Unsubscribe from all notifications?';

  @override
  String get notificationsUnsubscribeAllMessage =>
      'You will not receive any notifications until you turn a type back on.';

  @override
  String get notificationsUnsubscribedAll =>
      'You unsubscribed from all notifications. Nothing new will be sent until you resume.';

  @override
  String get remindersAlertHint => 'How early to be reminded.';

  @override
  String get remindersAlertSection => 'Alert';

  @override
  String get remindersAlreadyCompleted => 'This reminder is completed.';

  @override
  String get remindersCar => 'Car';

  @override
  String get remindersCarHint => 'Needed for reminders by odometer.';

  @override
  String get remindersChannelDescription => 'Maintenance, insurance, licence and tyre reminders you created.';

  @override
  String get remindersChannelName => 'Car reminders';

  @override
  String get remindersCompleteMessage => 'The reminder moves to completed.';

  @override
  String get remindersCompleteRepeats => 'This reminder repeats: the next one will be created automatically.';

  @override
  String get remindersCompleteTitle => 'Mark as done?';

  @override
  String get remindersCompleted => 'Done.';

  @override
  String remindersCompletedNext(String due) {
    return 'Done. Next one: $due';
  }

  @override
  String remindersDaysLate(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days days late', one: '1 day late');
    return '$_temp0';
  }

  @override
  String get remindersDelete => 'Delete reminder';

  @override
  String get remindersDeleteConfirm => 'Delete this reminder?';

  @override
  String get remindersDeleteMessage => 'Its phone notification will be cancelled too.';

  @override
  String get remindersDeleted => 'Reminder deleted.';

  @override
  String get remindersDeviceNotifications => 'Notify me on this phone';

  @override
  String get remindersDeviceNotificationsOff => 'Off. Reminders still appear here with their status.';

  @override
  String get remindersDeviceNotificationsOn => 'You will get a notification on each reminder\'s alert day.';

  @override
  String remindersDueAtKm(String km) {
    return 'at $km';
  }

  @override
  String get remindersDueDate => 'Due date';

  @override
  String get remindersDueKm => 'Due at odometer';

  @override
  String get remindersDueKmNeedsCar => 'Choose a car to use the odometer.';

  @override
  String remindersDueOn(String date) {
    return 'Due $date';
  }

  @override
  String get remindersEditTitle => 'Edit reminder';

  @override
  String get remindersEmptyCompletedTitle => 'No completed reminders yet';

  @override
  String get remindersEmptyMessage =>
      'Add a reminder for maintenance, insurance, licence renewal or tyres — by date, by odometer, or both.';

  @override
  String get remindersEmptyTitle => 'No reminders';

  @override
  String get remindersEnableAction => 'Turn on';

  @override
  String get remindersEnableHint => 'Turn on phone notifications to be alerted on time.';

  @override
  String get remindersErrorDue => 'Enter a due date or an odometer reading.';

  @override
  String remindersErrorRange(int min, int max) {
    return 'Must be between $min and $max.';
  }

  @override
  String get remindersErrorTitle => 'Enter a title.';

  @override
  String get remindersErrorVehicleForKm => 'Choose a car for odometer reminders.';

  @override
  String get remindersErrorWhole => 'Enter a whole number.';

  @override
  String remindersEveryKm(String km) {
    return 'Every $km';
  }

  @override
  String remindersEveryMonths(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: 'Every $months months',
      one: 'Every month',
    );
    return '$_temp0';
  }

  @override
  String get remindersFilterCompleted => 'Completed';

  @override
  String get remindersFilterOpen => 'Open';

  @override
  String get remindersGuestMessage => 'Sign in to keep maintenance, insurance and licence reminders for your cars.';

  @override
  String remindersInDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'In $days days',
      one: 'Tomorrow',
      zero: 'Today',
    );
    return '$_temp0';
  }

  @override
  String remindersInKm(String km) {
    return 'In $km';
  }

  @override
  String remindersKmLate(String km) {
    return '$km over';
  }

  @override
  String get remindersMarkDone => 'Mark as done';

  @override
  String get remindersNewTitle => 'New reminder';

  @override
  String get remindersNoCar => 'No specific car';

  @override
  String get remindersNotes => 'Notes';

  @override
  String get remindersNotificationsUnsupported =>
      'Phone notifications are not available here. Reminders still appear in this list.';

  @override
  String get remindersNotifyDays => 'Days before';

  @override
  String get remindersNotifyKm => 'Km before';

  @override
  String get remindersOdometerNow => 'Odometer now';

  @override
  String get remindersOdometerNowHint => 'Optional. Used to schedule the next reminder by distance.';

  @override
  String get remindersPermissionDenied =>
      'Notifications are blocked for this app. Allow them in your phone settings to get alerts; your reminders still show here.';

  @override
  String get remindersRepeatKm => 'Repeat every';

  @override
  String get remindersRepeatMonths => 'Repeat every (months)';

  @override
  String get remindersSaved => 'Reminder saved.';

  @override
  String get remindersStatusCompleted => 'Done';

  @override
  String get remindersStatusDueSoon => 'Due soon';

  @override
  String get remindersStatusOverdue => 'Overdue';

  @override
  String get remindersStatusUpcoming => 'Upcoming';

  @override
  String get remindersTitle => 'Reminders';

  @override
  String get remindersTitleField => 'Title';

  @override
  String get remindersTypeCustom => 'Other';

  @override
  String get remindersTypeInsurance => 'Insurance';

  @override
  String get remindersTypeLicence => 'Licence';

  @override
  String get remindersTypeMaintenance => 'Maintenance';

  @override
  String get remindersTypeTyres => 'Tyres';

  @override
  String get remindersWhatSection => 'What';

  @override
  String get remindersWhenHint => 'Enter a date, an odometer reading, or both.';

  @override
  String get remindersWhenSection => 'When';

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
  String get servicesDirectoryBrowseAll => 'Browse the directory';

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
  String get servicesDirectoryNotFoundMessage =>
      'It may have been removed from the directory. Browse other providers near you.';

  @override
  String get servicesDirectoryNotFoundTitle => 'This provider isn\'t listed anymore';

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
  String get tripsAccess => 'Access';

  @override
  String get tripsAlternative => 'Alternative station';

  @override
  String get tripsArrivalSoc => 'Battery on arrival';

  @override
  String get tripsAssumptions => 'Assumptions';

  @override
  String get tripsAssumptionsEdit => 'Assumptions';

  @override
  String get tripsAssumptionsEditHint => 'Optional: leave empty to use the catalog and defaults shown in the result.';

  @override
  String get tripsAtKm => 'At';

  @override
  String get tripsAvailabilityUnknown => 'Availability unknown';

  @override
  String get tripsAvailableNow => 'Available now (not at arrival)';

  @override
  String get tripsBatterySection => 'Battery';

  @override
  String get tripsCar => 'Car';

  @override
  String get tripsChargeEnergy => 'Energy to charge';

  @override
  String get tripsChargeFromTo => 'Charge';

  @override
  String get tripsChargeTime => 'Charging';

  @override
  String get tripsChargeTimeUnknown => 'No plan: the charging time at the stations cannot be estimated.';

  @override
  String get tripsChargeTo => 'Charge up to';

  @override
  String get tripsChargeToHint => 'Empty = 80%.';

  @override
  String get tripsChoose => 'Choose';

  @override
  String get tripsClosedAtEta => 'Closed at arrival';

  @override
  String get tripsConsumptionHint => 'Overrides the catalog value.';

  @override
  String get tripsCost => 'Approximate cost';

  @override
  String get tripsCostNotCalculated => 'Enter a price to calculate';

  @override
  String get tripsCurrentSoc => 'Battery now';

  @override
  String get tripsDeleteSaved => 'Delete saved trip';

  @override
  String get tripsDepartureSection => 'Departure';

  @override
  String get tripsDetour => 'Detour';

  @override
  String get tripsDirections => 'Directions';

  @override
  String get tripsDriveTime => 'Driving';

  @override
  String get tripsEnergyUsed => 'Energy used';

  @override
  String get tripsErrorCar => 'Choose the car.';

  @override
  String get tripsErrorDestination => 'Choose your destination.';

  @override
  String get tripsErrorMinSoc => 'Must be below the battery level now.';

  @override
  String get tripsErrorOrigin => 'Choose where you start.';

  @override
  String get tripsEta => 'Expected arrival';

  @override
  String get tripsFrom => 'From';

  @override
  String get tripsHours => 'Opening hours';

  @override
  String get tripsHoursUnknown => 'Hours unknown';

  @override
  String get tripsIntro =>
      'The route and road distances come from a routing service. Stops are suggested with a battery reserve and an alternative; arrival and a free charger are never guaranteed.';

  @override
  String get tripsLeaveNow => 'Leave now';

  @override
  String tripsLegN(int n) {
    return 'Leg $n';
  }

  @override
  String get tripsLegs => 'Road legs';

  @override
  String get tripsLocationDenied => 'Location is off or not allowed. Choose a city or a point on the map instead.';

  @override
  String get tripsLocationFailed => 'Could not get your location. Choose a city instead.';

  @override
  String get tripsMargin => 'Consumption safety margin';

  @override
  String get tripsMarginHint => 'Empty = 10%. Covers hills, heat, cold and speed.';

  @override
  String get tripsMinArrivalSoc => 'Keep at least';

  @override
  String get tripsMissingInlets => 'charging inlets';

  @override
  String get tripsMyLocation => 'My current location';

  @override
  String get tripsMyLocationHint => 'Used once for this plan, not stored.';

  @override
  String get tripsNoReachableStation =>
      'No plan: no compatible, open station is reachable with the reserve you asked for. Try a higher battery level or a lower reserve.';

  @override
  String get tripsNoStopsNeeded => 'No charging stop is needed with the values you entered.';

  @override
  String get tripsNotConfigured =>
      'Trip planning is not available: no routing service is configured yet. You can still get directions to any station from the charging map.';

  @override
  String get tripsOccupiedNow => 'Occupied now';

  @override
  String get tripsOpenAtEta => 'Open at arrival';

  @override
  String get tripsOutOfOrderNow => 'Out of order now';

  @override
  String get tripsPickOnMap => 'Pick on the map';

  @override
  String get tripsPlan => 'Plan my trip';

  @override
  String tripsPointOnMap(String lat, String lng) {
    return 'Point $lat, $lng';
  }

  @override
  String get tripsPrice => 'Electricity price';

  @override
  String get tripsPriceHint => 'Optional. Without it the cost is not calculated (no assumed prices).';

  @override
  String get tripsRough => 'Rough';

  @override
  String get tripsRouteNotFound => 'No road route was found between these points.';

  @override
  String tripsRoutingBy(String provider) {
    return 'Route: $provider';
  }

  @override
  String get tripsSave => 'Save this plan';

  @override
  String get tripsSaveHint => 'Only saved when you ask; visible only to you.';

  @override
  String get tripsSaveTitle => 'Name (optional)';

  @override
  String get tripsSaved => 'My saved trips';

  @override
  String get tripsSavedEmpty => 'No saved trips';

  @override
  String get tripsSavedStale => 'Saved plan: station status and hours may have changed since.';

  @override
  String get tripsStopChargeTime => 'Charging time';

  @override
  String tripsStopN(int n, String name) {
    return 'Stop $n: $name';
  }

  @override
  String tripsStopsSummary(int stops, String distance) {
    String _temp0 = intl.Intl.pluralLogic(
      stops,
      locale: localeName,
      other: '$stops charging stops',
      one: '1 charging stop',
      zero: 'No charging stops',
    );
    return '$_temp0 · $distance';
  }

  @override
  String get tripsTitle => 'Trip planner';

  @override
  String get tripsTo => 'To';

  @override
  String get tripsTooManyStops => 'No plan: the trip would need too many charging stops.';

  @override
  String get tripsUsePoint => 'Use this point';

  @override
  String tripsVehicleDataMissing(String missing) {
    return 'No plan: this car is missing verified data ($missing). Enter it under Assumptions if you know it.';
  }
}
