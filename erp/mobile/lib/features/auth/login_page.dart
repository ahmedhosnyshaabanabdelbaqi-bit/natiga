import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/config.dart';
import '../../data/local_db.dart';

/// تسجيل الدخول وتسجيل الجهاز.
///
/// الرمز يُحفظ في التخزين الآمن للجهاز، ومعرّف الجهاز يُثبَّت محليًا
/// ليُرسَل مع كل طلب مزامنة.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _deviceUid = TextEditingController();
  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDeviceUid();
  }

  Future<void> _loadDeviceUid() async {
    final saved = await LocalDb.state('device_uid');
    if (saved != null && mounted) _deviceUid.text = saved;
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    final dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBase,
      headers: {'Accept': 'application/json'},
      connectTimeout: AppConfig.requestTimeout,
    ));

    try {
      final login = await dio.post('/auth/login', data: {
        'username': _username.text.trim(),
        'password': _password.text,
        'device_name': _deviceUid.text.trim(),
      });

      final token = login.data['data']['token'] as String;
      await _storage.write(key: 'fayad.token', value: token);

      dio.options.headers['Authorization'] = 'Bearer $token';

      // تسجيل الجهاز على الخادم
      await dio.post('/sync/register', data: {
        'device_uid': _deviceUid.text.trim(),
        'label': 'جهاز ${_username.text.trim()}',
        'platform': 'android',
        'app_version': '1.0.0',
      });

      await LocalDb.setState('device_uid', _deviceUid.text.trim());

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeShellRoute()),
      );
    } on DioException catch (e) {
      final data = e.response?.data;
      setState(() {
        _error = (data is Map && data['message'] is String)
            ? data['message'] as String
            : 'تعذّر تسجيل الدخول. تحقق من الشبكة والبيانات.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(AppConfig.appName, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 24),
                if (_error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_error!, style: const TextStyle(color: Colors.red)),
                  ),
                  const SizedBox(height: 16),
                ],
                TextField(
                  controller: _username,
                  decoration: const InputDecoration(labelText: 'اسم المستخدم'),
                  textDirection: TextDirection.ltr,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'كلمة المرور'),
                  textDirection: TextDirection.ltr,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _deviceUid,
                  decoration: const InputDecoration(
                    labelText: 'معرّف الجهاز',
                    helperText: 'يُسجَّل على الخادم ويُستخدم لتخصيص حصص البيع الأوفلاين.',
                  ),
                  textDirection: TextDirection.ltr,
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('دخول'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// غلاف بسيط لتفادي الاعتماد الدائري مع main.dart.
class HomeShellRoute extends StatelessWidget {
  const HomeShellRoute({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(child: Text('أعد تشغيل التطبيق لتحميل الشاشة الرئيسية.')),
      );
}
