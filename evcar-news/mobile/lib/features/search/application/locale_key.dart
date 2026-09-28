import '../../../core/api/interceptors/request_headers_interceptor.dart';

/// Value-equal view of the request language + market for `select`.
///
/// `RequestLocale` has no `==`, so watching the provider directly refetches
/// on every recompute of the market (e.g. when `/app-config` arrives with
/// the same market); a record compares by value, so only a real language or
/// market change reloads the discovery screens.
(String, String) localeKey(RequestLocale l) => (l.languageCode, l.marketCode);
