import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'screens/home_screen.dart';
import 'services/sync_service.dart';

void main() {
  runApp(const RepApp());
}

/// Arabic and right-to-left by default, as the field language of the business.
class RepApp extends StatelessWidget {
  const RepApp({super.key});

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000/api/v1',
  );

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'مندوب المبيعات',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1F5F8B)),
        fontFamily: 'IBMPlexSansArabic',
      ),
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
      home: HomeScreen(
        sync: SyncService(
          dio: Dio(BaseOptions(
            baseUrl: apiBaseUrl,
            connectTimeout: const Duration(seconds: 20),
            receiveTimeout: const Duration(seconds: 40),
            headers: const {'Accept': 'application/json'},
          )),
          deviceUid: 'device-uid-from-secure-storage',
        ),
      ),
    );
  }
}
