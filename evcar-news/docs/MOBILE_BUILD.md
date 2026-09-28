# Building the EV Car News mobile app (APK / AAB / iOS)

الملخص بالعربية في آخر الملف.

The app lives in `mobile/` (Flutter **3.47.5**, Dart 3.x, application id
`news.evcar.app`). Nothing in the app is secret: every value compiled into it is
public, so the only build input is the API address.

| Build input | How it is passed | Example |
|---|---|---|
| API base URL (incl. `/api/v1`) | `--dart-define=API_BASE_URL=…` | `https://api.evcar.news/api/v1` |
| Share base URL (optional) | `--dart-define=SHARE_BASE_URL=…` | `https://evcar.news` (default) |
| Version | `pubspec.yaml` → `version: 1.0.0+1` (name + build number) | bump `+N` for every store upload |

Without `API_BASE_URL` a debug build talks to `http://10.0.2.2:3000/api/v1` (the
host machine seen from the Android emulator). **Release builds need an https API**:
the app refuses clear-text media/API URLs in release mode.

Before the app shows anything beyond Home/Account, the server must announce the
features: an owner turns them on in the admin settings (`features`) or with
`PATCH /api/v1/admin/settings/features`. They are seeded **off** on purpose
(REQUIREMENTS §21); a feature is announced only when it is implemented
(`IMPLEMENTED_FEATURES`), switched on, and — for the trip planner — a routing
provider is configured.

---

## 1. APK through GitHub Actions (no local Android SDK needed)

Workflow: `.github/workflows/evcar-android.yml` (repository root).

1. **Set the API address once**: GitHub → repository → *Settings → Secrets and
   variables → Actions → Variables* → New repository variable
   `EVCAR_API_BASE_URL` = `https://<your-api-host>/api/v1`. **Required**: without
   it (or with a non-https value) the job fails at its first step instead of
   publishing an APK that points at a host that does not exist.
2. **Trigger a build** in one of two ways:
   - push a commit whose message contains **`[apk]`** to a `claude/**` branch or
     `main` that touches `evcar-news/mobile/**`, or
   - *Actions → evcar-android → Run workflow* (manual).
3. The job runs `flutter pub get`, `merge_arb`, `gen-l10n`, `flutter analyze`,
   `flutter test`, then builds a universal APK and per-ABI APKs.
4. **Download**: the run publishes a GitHub **pre-release** named
   `android-test-<run number>` with
   - `evcar-news-arm64.apk` — most modern phones,
   - `evcar-news-universal.apk` — any device (bigger),
   - `evcar-news-arm32.apk`, `SHA256SUMS.txt`.
   The same files are attached to the run as an artifact for 30 days.
5. **Install on a phone**: open the release page on the phone, download the arm64
   APK, allow "install unknown apps" for the browser, install. These builds are
   signed with the runner's **debug key** (test only): uninstall the previous test
   build before installing a new one (each runner has a different debug key).

### Release signing in CI (not wired yet)

The workflow currently signs with the debug key. To produce store-ready builds,
add repository **secrets** `ANDROID_KEYSTORE_BASE64` (the `.jks` file,
`base64 -w0 upload-keystore.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, and a step before the build:

```yaml
      - name: Configure release signing
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          if [ -n "$ANDROID_KEYSTORE_BASE64" ]; then
            echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/upload-keystore.jks"
            printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=%s\nkeyPassword=%s\n' \
              "$RUNNER_TEMP/upload-keystore.jks" "$ANDROID_KEYSTORE_PASSWORD" \
              "$ANDROID_KEY_ALIAS" "$ANDROID_KEY_PASSWORD" > android/key.properties
          fi
      - run: flutter build appbundle --release --dart-define=API_BASE_URL="$API_BASE_URL"
```

(`android/app/build.gradle.kts` already reads `android/key.properties`; the file is
git-ignored.) This snippet has not been run — the workflow file is outside the
area of this integration pass.

---

## 2. Local Android build (APK and AAB)

Requirements: Flutter 3.47.5, Android SDK (API level from Flutter's defaults) with
build-tools and platform-tools, **JDK 17**, `ANDROID_HOME` set.

```sh
cd evcar-news/mobile
flutter pub get
dart run tool/merge_arb.dart && flutter gen-l10n
flutter analyze && flutter test

# test APK (signed with your local debug key unless key.properties exists)
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.com/api/v1
# smaller per-ABI APKs
flutter build apk --release --split-per-abi --dart-define=API_BASE_URL=https://api.example.com/api/v1
# Play Store bundle
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.example.com/api/v1
```

Outputs: `build/app/outputs/flutter-apk/*.apk`, `build/app/outputs/bundle/release/app-release.aab`.

Against a backend on your computer: emulator → `http://10.0.2.2:3000/api/v1`
(debug build, the default); a physical phone on the same Wi-Fi →
`--dart-define=API_BASE_URL=http://<LAN-IP>:3000/api/v1` with a **debug** build
(`flutter run`), because release builds refuse http.

### Signing (upload key)

1. Create the upload keystore once (keep it and its passwords safe — losing it
   means you cannot update the app unless Play App Signing resets it):
   ```sh
   keytool -genkey -v -keystore ~/upload-keystore.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias upload
   ```
2. Create `mobile/android/key.properties` (never commit; it is in `.gitignore`):
   ```properties
   storeFile=/absolute/path/to/upload-keystore.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```
3. Build again; Gradle prints a warning and falls back to the debug key when the
   file is missing.
4. For **App Links** (`https://evcar.news/n/…` opening the app) put the SHA-256 of
   the signing certificate (Play Console → App integrity → App signing key when
   Play App Signing is used, otherwise `keytool -list -v -keystore upload-keystore.jks`)
   into the admin setting `app_links.androidSha256CertFingerprints`. The backend
   share module that serves `/.well-known/assetlinks.json` is **not built yet**.

---

## 3. iOS

Requirements: a Mac with Xcode (the version Flutter 3.47 supports), CocoaPods, an
**Apple Developer Program** membership (paid) for device installs outside your own
test device and for TestFlight/App Store.

```sh
cd evcar-news/mobile
flutter pub get && dart run tool/merge_arb.dart && flutter gen-l10n
cd ios && pod install && cd ..
open ios/Runner.xcworkspace   # set Team + unique Bundle ID (news.evcar.app) under Signing & Capabilities
flutter build ipa --release --dart-define=API_BASE_URL=https://api.example.com/api/v1
```

Upload `build/ios/ipa/*.ipa` with Xcode Organizer or Transporter. Associated
Domains (Universal Links) need the Team ID in the admin setting `app_links.iosTeamId`
and the (not yet built) `/.well-known/apple-app-site-association` endpoint. Push
notifications are not integrated in the app (no APNs key yet). No IPA was built in
this environment (no macOS/Xcode).

---

## 4. Web preview (design review only)

```sh
flutter build web --release --no-web-resources-cdn --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

Serve `build/web` with any static server and add its origin to the backend's
`CORS_ORIGINS`. The preview is **not** a product: tokens are kept in memory (sign
in again after a reload), there is no SQLite, local notifications or GPS, and the
360° viewer shows a "not available in the web preview" notice. It is what the
live end-to-end test in `docs/screenshots/app/` used.

---

## 5. What was and was not verified (2026-09-28)

- Verified here: `flutter analyze` (0 issues), `flutter test` (622 passed, 9 live
  tests skipped by default), live contract tests against a running backend
  (`EVCAR_LIVE_API=… flutter test test/live` — news + tours), `flutter build web`,
  and a Playwright run of the web build against the real backend.
- **Not** verified here: any Android/iOS build — this environment has no Android
  SDK or Xcode. The APK must come from the GitHub Actions workflow; its last
  result is on the repository's *Actions* page.

---

## ملخص بالعربية

- **أسهل طريقة للحصول على APK:** من GitHub → Actions → evcar-android → Run workflow،
  أو ادفع commit تحتوي رسالته على `[apk]`. سيظهر إصدار تجريبي (pre-release) باسم
  `android-test-<رقم>` وفيه ملف `evcar-news-arm64.apk` لمعظم الهواتف.
- **عنوان الخادم:** أضف متغيّر المستودع `EVCAR_API_BASE_URL` بقيمة مثل
  `https://api.example.com/api/v1` (يجب أن يكون https لنسخ الإصدار).
- النسخ الناتجة من الـ CI **موقّعة بمفتاح debug** وهي للاختبار فقط؛ احذف النسخة
  السابقة قبل تثبيت الجديدة. للتوقيع الرسمي أنشئ keystore وملف
  `android/key.properties` (الخطوات في القسم 2) أو أضف أسرار التوقيع إلى الـ CI (القسم 1).
- **iOS** يحتاج جهاز Mac وXcode وعضوية Apple Developer مدفوعة.
- بعد تشغيل الخادم يجب على المالك تفعيل الميزات من إعدادات `features`، وإلا يظهر
  التطبيق الرئيسية والحساب فقط.
