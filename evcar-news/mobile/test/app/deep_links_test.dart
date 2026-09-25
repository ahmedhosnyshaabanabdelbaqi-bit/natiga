import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/app/router/deep_links.dart';
import 'package:evcar_news/features/auth/domain/app_user.dart';
import 'package:evcar_news/features/auth/domain/auth_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('deepLinkRedirect (public web URLs → app routes)', () {
    test('articles /n/<slug> → /news/<slug>', () {
      expect(deepLinkRedirect(Uri.parse('https://evcar.news/n/byd-seal-2026')), '/news/byd-seal-2026');
      expect(deepLinkRedirect(Uri.parse('/n/abc?utm_source=x')), '/news/abc?utm_source=x');
      expect(deepLinkRedirect(Uri.parse('/n/abc/')), '/news/abc');
    });

    test('Arabic slugs survive encoding', () {
      final uri = Uri.parse('https://evcar.news/n/${Uri.encodeComponent('بي-واي-دي')}');
      expect(deepLinkRedirect(uri), '/news/${Uri.encodeComponent('بي-واي-دي')}');
    });

    test('cars are already app routes', () {
      expect(deepLinkRedirect(Uri.parse('https://evcar.news/cars/tesla-model-3')), isNull);
      expect(deepLinkRedirect(Uri.parse('/cars/x/')), '/cars/x');
    });

    test('shared comparisons /compare/<id> → /compare/s/<id>', () {
      expect(deepLinkRedirect(Uri.parse('https://evcar.news/compare/Ab12Cd')), '/compare/s/Ab12Cd');
      expect(deepLinkRedirect(Uri.parse('/compare/s/Ab12Cd')), isNull);
      expect(deepLinkRedirect(Uri.parse('/compare')), isNull);
    });

    test('email link aliases keep their token', () {
      expect(deepLinkRedirect(Uri.parse('/verify-email?token=t1')), '/auth/verify-email?token=t1');
      expect(deepLinkRedirect(Uri.parse('/reset-password?token=t2')), '/auth/reset-password?token=t2');
    });
  });

  group('appRedirect', () {
    const user = AppUser(id: '1', email: 'a@b.c', displayName: 'A', emailVerified: true, locale: 'ar');

    test('guests are sent to sign-in for account-only routes, with a return path', () {
      final r = appRedirect(Uri.parse('/account/profile'), const AuthGuest());
      expect(r, '/auth/login?from=%2Faccount%2Fprofile');
    });

    test('everything public stays open to guests', () {
      for (final path in ['/', '/cars', '/news/x', '/charging/stations/1', '/settings', '/garage', '/account']) {
        expect(appRedirect(Uri.parse(path), const AuthGuest()), isNull, reason: path);
      }
    });

    test('no redirect while the session is being restored', () {
      expect(appRedirect(Uri.parse('/account/profile'), const AuthRestoring()), isNull);
    });

    test('signed-in users skip the login page', () {
      expect(appRedirect(Uri.parse('/auth/login?from=%2Fgarage'), const AuthSignedIn(user)), '/garage');
      expect(appRedirect(Uri.parse('/auth/register'), const AuthSignedIn(user)), '/account');
      expect(appRedirect(Uri.parse('/auth/verify-email?token=x'), const AuthSignedIn(user)), isNull);
    });
  });

  group('AppRoutes', () {
    test('safeReturnPath blocks open redirects', () {
      expect(AppRoutes.safeReturnPath('/garage'), '/garage');
      expect(AppRoutes.safeReturnPath('/news/x?y=1'), '/news/x?y=1');
      expect(AppRoutes.safeReturnPath('//evil.com'), isNull);
      expect(AppRoutes.safeReturnPath('https://evil.com'), isNull);
      expect(AppRoutes.safeReturnPath('/x/https://evil.com'), isNull);
      expect(AppRoutes.safeReturnPath(r'/\evil.com'), isNull);
      expect(AppRoutes.safeReturnPath('garage'), isNull);
      expect(AppRoutes.safeReturnPath('/auth/login'), isNull);
      expect(AppRoutes.safeReturnPath(null), isNull);
    });

    test('builders encode path segments and queries', () {
      expect(AppRoutes.article('a b'), '/news/a%20b');
      expect(AppRoutes.tour('bmw-ix', 't1'), '/cars/bmw-ix/tour/t1');
      expect(AppRoutes.station('42'), '/charging/stations/42');
      expect(AppRoutes.search(query: 'تسلا'), '/search?q=${Uri.encodeQueryComponent('تسلا')}');
      expect(AppRoutes.search(), '/search');
      expect(AppRoutes.login(), '/auth/login');
    });
  });
}
