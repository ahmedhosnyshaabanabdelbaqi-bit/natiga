import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/bootstrap.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final overrides = await Bootstrap.load();
  runApp(
    ProviderScope(
      overrides: overrides,
      // No automatic provider retries: screens offer an explicit "Try again"
      // and API errors are typed (ApiException).
      retry: (retryCount, error) => null,
      child: const EvCarApp(),
    ),
  );
}
