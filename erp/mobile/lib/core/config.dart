/// إعدادات التطبيق الميداني.
class AppConfig {
  /// عنوان الخادم داخل الشبكة المحلية أو السحابة.
  /// يُضبط عند البناء:  flutter build apk --dart-define=API_BASE=http://192.168.1.10:8000/api/v1
  static const String apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:8000/api/v1',
  );

  static const String appName = 'محمد فياض — المندوب';

  /// عدد العمليات القصوى في الصف قبل إلزام المزامنة.
  static const int maxQueuedOperations = 200;

  /// مهلة الطلب.
  static const Duration requestTimeout = Duration(seconds: 30);

  /// فاصل محاولة المزامنة التلقائية عند توفر الشبكة.
  static const Duration autoSyncInterval = Duration(minutes: 5);
}
