import 'dart:async';

import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/core/auth/auth_tokens.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/features/auth/domain/auth_state.dart';
import 'package:evcar_news/features/auth/presentation/auth_controller.dart';
import 'package:evcar_news/features/auth/presentation/verify_email_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/test_app.dart';

Future<void> openLogin(WidgetTester tester) async {
  tester.container().read(routerProvider).go('/auth/login?from=%2Fgarage');
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('login validates input before calling the API', (tester) async {
    final h = await pumpTestApp(tester, language: 'en');
    await openLogin(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('This field is required.'), findsNWidgets(2));
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'not-an-email');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a valid email address.'), findsOneWidget);
    expect(h.adapter.requestsTo('POST /auth/login'), isEmpty);
  });

  testWidgets('wrong credentials show the server message and keep the user a guest', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on(
        'POST /auth/login',
        (_) => FakeResponse.error(401, 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.'),
      );
    final h = await pumpTestApp(tester, language: 'en', adapter: adapter);
    await openLogin(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'sara@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'wrong-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Email or password is incorrect.'), findsOneWidget);
    expect(await h.tokens.read(), isNull);
    expect(tester.container().read(authControllerProvider), isA<AuthGuest>());
    expect(h.adapter.requestsTo('POST /auth/refresh'), isEmpty);
  });

  testWidgets('unverified e-mail: server message plus a way to the verification screen', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on(
        'POST /auth/login',
        (_) => FakeResponse.error(403, 'EMAIL_NOT_VERIFIED', message: 'You must confirm your email before signing in.'),
      );
    final h = await pumpTestApp(tester, language: 'en', adapter: adapter);
    await openLogin(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'sara@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'right-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('You must confirm your email before signing in.'), findsOneWidget);
    await tester.tap(find.text('Verify my email'));
    await tester.pumpAndSettle();
    final screen = tester.widget<VerifyEmailScreen>(find.byType(VerifyEmailScreen));
    expect(screen.email, 'sara@example.com');
    expect(await h.tokens.read(), isNull);
  });

  testWidgets('422 field errors appear under the matching fields', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on(
        'POST /auth/login',
        (_) => FakeResponse.error(
          422,
          'VALIDATION_FAILED',
          message: 'Invalid fields',
          details: [
            {
              'field': 'email',
              'constraints': {'isEmail': 'Server says: bad email'},
            },
          ],
        ),
      );
    await pumpTestApp(tester, language: 'en', adapter: adapter);
    await openLogin(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'sara@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'whatever1');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Server says: bad email'), findsOneWidget);
  });

  testWidgets('successful login stores tokens and returns to the requested page', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on('POST /auth/login', (_) => FakeResponse.json(200, {'data': fakeLoginData(access: 'a1', refresh: 'r1')}));
    final h = await pumpTestApp(tester, language: 'en', adapter: adapter, features: allFeaturesOn);
    await openLogin(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), ' sara@example.com ');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'correct-horse');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    final req = h.adapter.requestsTo('POST /auth/login').single;
    expect((req.data as Map)['email'], 'sara@example.com');
    expect((req.data as Map)['deviceName'], isNotEmpty);
    // The installation id lets the server recognise this device during a lockout.
    expect(req.headers['X-Device-Id'], TestAppHarness.deviceId);
    final tokens = await h.tokens.read();
    expect(tokens!.accessToken, 'a1');
    expect(tokens.refreshToken, 'r1');
    expect(tester.container().read(authControllerProvider).user!.displayName, 'Sara');
    // Returned to /garage, which now shows the (placeholder) feature, not the sign-in prompt.
    expect(find.widgetWithText(AppBar, 'My garage'), findsOneWidget);
    expect(find.text('Sign in to continue'), findsNothing);
  });

  testWidgets('stored session is restored at startup and shown in the account tab', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson(emailVerified: false)}));
    await pumpTestApp(
      tester,
      language: 'en',
      adapter: adapter,
      tokens: InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r')),
    );
    expect(tester.container().read(authControllerProvider), isA<AuthSignedIn>());
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Account')));
    await tester.pumpAndSettle();
    expect(find.text('Sara'), findsOneWidget);
    expect(find.text('Your email is not verified yet.'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Sign out'), 200, scrollable: find.byType(Scrollable).last);
    expect(find.text('Sign out'), findsOneWidget);
  });

  testWidgets('offline startup uses the saved profile', (tester) async {
    final adapter = FakeHttpAdapter()..on('GET /me', (_) => throw const FakeNetworkError());
    final tokens = InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r'));
    // First run online would have cached the user; simulate that cache.
    final h = await pumpTestApp(tester, language: 'en', adapter: adapter, tokens: tokens);
    expect(
      tester.container().read(authControllerProvider),
      isA<AuthRestoring>(),
      reason: 'no saved profile → retryable restoring state, tokens kept',
    );
    expect(await tokens.read(), isNotNull);

    await h.cache.put(AuthController.userCacheKey, fakeUserJson());
    // Not awaited directly: Dio needs the fake clock to advance (pump).
    unawaited(tester.container().read(authControllerProvider.notifier).restore());
    await tester.pumpAndSettle();
    final state = tester.container().read(authControllerProvider);
    expect(state, isA<AuthSignedIn>().having((s) => s.offline, 'offline', isTrue));
  });

  testWidgets('revoked session at startup → guest, tokens cleared', (tester) async {
    final adapter = FakeHttpAdapter()..on('GET /me', (_) => FakeResponse.error(401, 'UNAUTHORIZED'));
    final tokens = InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r'));
    await pumpTestApp(tester, language: 'en', adapter: adapter, tokens: tokens);
    expect(tester.container().read(authControllerProvider), isA<AuthGuest>());
    expect(await tokens.read(), isNull);
  });

  testWidgets('session expiry while signed in shows a one-time notice', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson()}))
      ..on('GET /me/sessions', (_) => FakeResponse.error(401, 'TOKEN_EXPIRED'))
      ..on('POST /auth/refresh', (_) => FakeResponse.error(401, 'UNAUTHORIZED'));
    await pumpTestApp(
      tester,
      language: 'ar',
      adapter: adapter,
      tokens: InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r')),
    );
    tester.container().read(routerProvider).go('/account/sessions');
    await tester.pumpAndSettle();
    expect(find.text('انتهت جلستك. سجّل الدخول مرة أخرى.'), findsOneWidget);
    expect(tester.container().read(authControllerProvider), isA<AuthGuest>());
  });

  testWidgets('logout calls the API with the refresh token and clears the session', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson()}))
      ..on('POST /auth/logout', (_) => FakeResponse.empty(204));
    final tokens = InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r-9'));
    final h = await pumpTestApp(tester, language: 'en', adapter: adapter, tokens: tokens);
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Account')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Sign out'), 200, scrollable: find.byType(Scrollable).last);
    // ensureVisible jumps without a frame: lay out before tapping.
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();

    expect(h.adapter.requestsTo('POST /auth/logout').single.data, {'refreshToken': 'r-9'});
    expect(await tokens.read(), isNull);
    expect(tester.container().read(authControllerProvider), isA<AuthGuest>());
    expect(find.text('Signed out.'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text("You're browsing as a guest"),
      -200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text("You're browsing as a guest"), findsOneWidget);
  });

  testWidgets('account deletion requires acknowledgement + password and signs out', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson()}))
      ..on('DELETE /me', (_) => FakeResponse.empty(204));
    final tokens = InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r'));
    final h = await pumpTestApp(tester, language: 'en', adapter: adapter, tokens: tokens);
    tester.container().read(routerProvider).go('/account/delete');
    await tester.pumpAndSettle();

    final deleteButton = find.widgetWithText(FilledButton, 'Delete account permanently');
    expect(tester.widget<FilledButton>(deleteButton).onPressed, isNull, reason: 'disabled until acknowledged');
    await tester.enterText(find.byType(TextFormField), 'my-password');
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    await tester.tap(deleteButton);
    await tester.pumpAndSettle();

    final req = h.adapter.requestsTo('DELETE /me').single;
    expect(req.data, {'password': 'my-password'});
    expect(req.headers['Authorization'], 'Bearer a');
    expect(await tokens.read(), isNull);
    expect(find.text('Your account has been deleted.'), findsOneWidget);
  });

  testWidgets('register shows the verify-your-email step', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on(
        'POST /auth/register',
        (_) => FakeResponse.json(201, {
          'data': {'user': fakeUserJson(emailVerified: false)},
        }),
      );
    final h = await pumpTestApp(tester, language: 'ar', adapter: adapter);
    tester.container().read(routerProvider).go('/auth/register');
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'الاسم الظاهر'), 'سارة');
    await tester.enterText(find.widgetWithText(TextFormField, 'البريد الإلكتروني'), 'sara@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'كلمة المرور'), 'long-password-1');
    await tester.enterText(find.widgetWithText(TextFormField, 'تأكيد كلمة المرور'), 'long-password-1');
    await tester.tap(find.widgetWithText(FilledButton, 'إنشاء الحساب'));
    await tester.pumpAndSettle();

    final body = h.adapter.requestsTo('POST /auth/register').single.data as Map;
    expect(body, {'email': 'sara@example.com', 'password': 'long-password-1', 'displayName': 'سارة', 'locale': 'ar'});
    expect(find.text('تم إنشاء الحساب'), findsOneWidget);
  });

  testWidgets('verify-email deep link verifies automatically', (tester) async {
    final adapter = FakeHttpAdapter()
      ..on(
        'POST /auth/verify-email',
        (_) => FakeResponse.json(200, {
          'data': {'verified': true},
        }),
      );
    final h = await pumpTestApp(tester, language: 'en', adapter: adapter);
    tester.container().read(routerProvider).go('/verify-email?token=tok-123');
    await tester.pumpAndSettle();
    expect(h.adapter.requestsTo('POST /auth/verify-email').single.data, {'token': 'tok-123'});
    expect(find.text('Your email has been verified.'), findsOneWidget);
  });

  testWidgets('forgot password never reveals whether the account exists', (tester) async {
    final adapter = FakeHttpAdapter()..on('POST /auth/forgot-password', (_) => FakeResponse.empty(202));
    await pumpTestApp(tester, language: 'en', adapter: adapter);
    tester.container().read(routerProvider).go('/auth/forgot-password');
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'nobody@example.com');
    await tester.tap(find.widgetWithText(FilledButton, 'Send link'));
    await tester.pumpAndSettle();
    expect(find.text("If an account exists for this email, you'll receive reset instructions."), findsOneWidget);
  });
}
