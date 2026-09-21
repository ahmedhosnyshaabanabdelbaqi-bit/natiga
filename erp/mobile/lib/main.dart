import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/config.dart';
import 'core/theme.dart';
import 'data/local_db.dart';
import 'data/sync_client.dart';
import 'features/auth/login_page.dart';
import 'features/sync/sync_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const FayadFieldApp());
}

class FayadFieldApp extends StatelessWidget {
  const FayadFieldApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      theme: AppTheme.build(),
      debugShowCheckedModeBanner: false,
      // العربية وRTL افتراضيًا
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
      home: const _Bootstrap(),
    );
  }
}

class _Bootstrap extends StatefulWidget {
  const _Bootstrap();

  @override
  State<_Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends State<_Bootstrap> {
  bool _loading = true;
  bool _loggedIn = false;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    // فتح القاعدة المشفرة مبكرًا ليظهر أي خلل في المفتاح فورًا
    await LocalDb.instance();
    final deviceUid = await LocalDb.state('device_uid');

    if (!mounted) return;
    setState(() {
      _loggedIn = deviceUid != null;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return _loggedIn ? const HomeShell() : const LoginPage();
  }
}

/// الشاشة الرئيسية للمندوب.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  Map<String, int> _queue = const {};
  bool _offlineAuthorised = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final counts = await LocalDb.queueCounts();
    final authorised = await SyncClient.offlineStillAuthorised();

    if (!mounted) return;
    setState(() {
      _queue = counts;
      _offlineAuthorised = authorised;
    });
  }

  @override
  Widget build(BuildContext context) {
    final pending = (_queue['pending'] ?? 0) + (_queue['failed'] ?? 0);
    final conflicts = _queue['conflict'] ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppConfig.appName),
        actions: [
          if (pending > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Center(
                child: Chip(
                  label: Text('$pending معلقة'),
                  backgroundColor: AppTheme.warn.withValues(alpha: 0.15),
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          if (!_offlineAuthorised)
            Container(
              width: double.infinity,
              color: AppTheme.danger.withValues(alpha: 0.1),
              padding: const EdgeInsets.all(12),
              child: const Text(
                'انتهى تفويض العمل دون اتصال. اتصل بالشبكة وزامن قبل إنشاء عمليات جديدة.',
                style: TextStyle(color: AppTheme.danger),
              ),
            ),
          if (conflicts > 0)
            Container(
              width: double.infinity,
              color: AppTheme.warn.withValues(alpha: 0.1),
              padding: const EdgeInsets.all(12),
              child: Text(
                'يوجد $conflicts عملية متعارضة تحتاج مراجعة. عملياتك محفوظة ولم تُحذف.',
                style: const TextStyle(color: AppTheme.warn),
              ),
            ),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: const [
                _PlaceholderTab(title: 'خطة اليوم'),
                _PlaceholderTab(title: 'العملاء'),
                _PlaceholderTab(title: 'بيع'),
                SyncPage(),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) {
          setState(() => _index = i);
          _refresh();
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.route_outlined), label: 'الخطة'),
          NavigationDestination(icon: Icon(Icons.storefront_outlined), label: 'العملاء'),
          NavigationDestination(icon: Icon(Icons.point_of_sale_outlined), label: 'بيع'),
          NavigationDestination(icon: Icon(Icons.sync), label: 'المزامنة'),
        ],
      ),
    );
  }
}

class _PlaceholderTab extends StatelessWidget {
  final String title;
  const _PlaceholderTab({required this.title});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const Text(
              'هذه الشاشة ضمن المرحلة الرابعة ولم تُنفَّذ بعد.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
