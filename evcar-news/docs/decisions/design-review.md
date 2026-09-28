# Design review — mobile app (2026-09-28)

Area: `mobile/lib/**` (presentation, theme, widgets only; no data/API logic
changed), launcher icons / splash in `mobile/android`, `mobile/ios`,
`mobile/web`, the generator `mobile/tool/brand/`, `docs/screenshots/app/`,
this file. No dependency added (icons are rasterised with the backend's
`sharp`; see §4).

## 1. Method

* **Environment** (scratchpad `design/`, not committed): own database
  `evcar_design` (migrate deploy + reference seed + demo seed), backend
  `dist/main.js` on :3200 with jobs on, content **only through the admin API**
  (same script as integration-2: test brand/model/BEV+PHEV, article, station,
  360° tour on a synthetic grid) plus, for this review, four synthetic images
  that read "TEST IMAGE — not a real photo" (model hero + 3 article covers),
  three more `[TEST]`/`[اختبار]` articles, and a test user with a garage car,
  3 charging sessions, 3 reminders, 3 favourites and a saved comparison.
  Media URLs go through a local TLS proxy (:3443) because the app only loads
  `https` images in release builds.
* **Capture**: Flutter web release build, Playwright/Chromium,
  `deviceScaleFactor 2`, 44 screens (guest + signed-in) at 390×844 in
  ar-light / ar-dark / en-light / en-dark, 360×740 (ar light, en dark),
  in-app text size ×1.6 (the app's maximum; ar + en), landscape 844×390 for
  car page, spec sheets (BEV/PHEV), compare and tour.
* **Rounds**: r1 (baseline) → fixes → r2 → fixes → r3 (final). Each round was
  reviewed from contact sheets of all variants per screen.

## 2. Findings and fixes

| # | Finding (round) | Severity | Fix |
|---|---|---|---|
| 1 | Dark mode primary was a seeded lavender (#B4C5FF): filled buttons, FAB, switches, compare CTA looked disabled (r1) | high | Dark `primary` = light brand blue `#86ADFF` for text/icons (7.8:1 on surfaces); **filled controls use brand blue `#0A5CFF` + white in both themes** (5.3:1): FilledButton, FAB, Switch, NavigationBar pill. `primaryContainer` dark = `#173A8C`/`#DCE6FF`. |
| 2 | Bottom nav: dark-navy icon on the bright blue pill (≈2:1) (r1) | high | Selected icon white on the brand pill; hairline above the bar so white cards scrolling under it keep an edge. |
| 3 | White text on the blue→cyan gradient (garage hero, result panels, 360° badge): cyan end = 2.1:1 (r1) | high (WCAG) | `brandGradient` now ends in deep cyan `#0077BE` (≥4.5:1 on every stop; a lighter server accent is darkened automatically). The bright cyan lives on in `accentGradient` for decoration only (chart bars, home strip). |
| 4 | Car page tabs sat on the hero image scrim: grey/blue labels on near-black, unreadable (r1) | high | New collapse-aware hero app bar in `AppScaffold`: tabs on a solid surface strip; white back/actions on a top scrim while expanded, normal colours when collapsed; toolbar title fades in only when collapsed (the hero now shows the car name). |
| 5 | Car hero content overlapped the toolbar at large text; in landscape the hero filled the screen (r1) | high | Expanded height grows with text scale and is capped at 50 % of the screen height. |
| 6 | RTL chevrons pointed the wrong way in Account, Brands, Brand, garage rows (manual `isRtl ? chevron_left : chevron_right` on an icon that already mirrors) (r1) | high | Plain `Icons.chevron_right` (auto-mirrored). |
| 7 | Arabic dates used Arabic-Indic digits next to Western numbers on the same line ("٢٨ سبتمبر ٢٠٢٦" · "2,130 كم") (r1) | medium | `AppFormatters.shapeDate()` applies the single digits setting to all `DateFormat` output (formatter + 3 direct call sites). |
| 8 | SoC ranges showed "80% → 30%" in RTL (arrow reads backwards) (r1) | medium | `AppFormatters.range()` uses ← in Arabic; used in charging logs and trip plans. |
| 9 | Charging-log row: the trailing price column squeezed the text so "كيلوواط ساعة" broke letter by letter at 360 dp and ×1.6 (r1) | high | Row rebuilt: energy + AC/DC and amount share a wrapping first line; per-kWh price moved to the detail line; leading icon is the new `IconBadge`. |
| 10 | Search results showed model year as "2,026" (grouped number) and repeated it (r1) | medium | Year printed as a label (digit-shaped, no grouping), dedupe works again. |
| 11 | Toolbar titles allowed 2 lines and were clipped at the top at large text (station, spec sheet) (r1) | medium | 1 line + ellipsis in regular/pinned bars; 2 lines only in the large collapsing title. |
| 12 | Auth forms, profile and delete-account were vertically centred: a large empty band above, jumpy with the keyboard (r1) | medium | Top-aligned; auth pages start with the brand mark. |
| 13 | Web-preview corner `Banner` covered app-bar actions (bell, favourite) and rendered tofu before fonts loaded (r1) | low (web only) | Small non-interactive pill at top centre in the app font. |
| 14 | Charging title truncated ("Charging statio…") by a two-segment map/list control (r1) | medium | One icon toggle showing the other view (tooltip = target view). |
| 15 | Tour cards: full-image scrim over the loading/fallback surface looked dirty; 360° chip icon was pale blue on white in dark mode (r1) | low | Scrim removed (no text on the image); chip icon fixed brand blue. |
| 16 | Stat tiles: a lone third tile next to an empty gap (garage, station); long Arabic units orphaned ("18.3 كيلوواط" / "ساعة") (r2) | low | `StatTileRow` stretches an incomplete last row; values scale down slightly to stay on one line up to ×1.3 text (wrap above). |
| 17 | Settings: long radio lists on the bare background, inconsistent with Account's grouped cards (r2) | low | Sections grouped on cards (same pattern as Account). |
| 18 | No brand presence in the app bar / sign-in (r1) | low | `AppMark` (same vector as the launcher icon) in `BrandTitle` when the server has no logo, and on auth pages. |

Checked and fine: skeleton loaders, empty states (illustrated, with a CTA),
sign-in-required views, "غير متوفر / Not available" in italics (never 0),
demo/test badges, 48 dp targets, bottom sheets, dark tonal ramp,
section-header rhythm (24 dp between sections, 12 dp card gaps).

## 3. Design tokens changed

* `AppColors.deepCyan #0077BE`, `AppColors.electricBlueOnDark #86ADFF`.
* `AppPalette.brandGradient` (text-safe) + new `accentGradient` (decorative).
* Theme: dark `primary`/`primaryContainer`, filled button / FAB / switch /
  navigation bar colours (§2 #1–2).
* New shared widgets: `AppMark` (`app_mark.dart`), `IconBadge` (badges.dart).
* `AppScaffold.slivers(flexibleHeader:)` → `_HeroSliverAppBar` (§2 #4–5).

## 4. App icon, adaptive icon, splash

* **Motif**: a charging plug (two prongs, head with a lightning bolt) whose
  cable becomes a road running towards the viewer with a dashed centre line;
  bolt and dashes are cut out. Background electric blue → deep cyan with a
  cyan glow. Single outline path, one source: `mobile/tool/brand/mark.cjs`
  (Dart copy in `lib/shared/widgets/app_mark.dart`).
* **Generator**: `node tool/brand/generate.cjs` (from `mobile/`; uses `sharp`
  from `backend/node_modules`, or `SHARP_PATH`). Writes:
  * Android: legacy `mipmap-*dpi/ic_launcher.png` + `ic_launcher_round.png`;
    adaptive `mipmap-anydpi-v26/ic_launcher(_round).xml` with **vector**
    background (gradient) / foreground / **monochrome** (Android 13 themed
    icons); mark scaled to the 66 dp safe zone. `android:roundIcon` added to
    the manifest.
  * Splash: `launch_background.xml` light `#F4F7FC` / night `#0A1020` with a
    centred 128 dp brand tile (`drawable-*dpi/splash_logo.png`);
    Android 12+ `values(-night)-v31/styles.xml` with
    `windowSplashScreenAnimatedIcon` = adaptive foreground on a brand-blue
    icon background.
  * iOS: every `AppIcon.appiconset` size, square and **opaque** (iOS masks
    corners; alpha is rejected); `LaunchImage` 120 pt brand tile, launch
    screen background `#F4F7FC`.
  * Web: favicon, `Icon-192/512`, maskable icons.
  * `tool/brand/out/play-store-icon-512.png` (store listing master).
* Not verified on a device/emulator (no Android SDK / Xcode here); XML files
  were validated as well-formed.

## 5. Screenshots

`docs/screenshots/app/final-<screen>-<lang>-<theme>.png` for 44 screens ×
{ar,en} × {light,dark}; plus `-small` (360×740), `-large` (text ×1.6) for
10 key screens and `-landscape` for car / spec sheets / compare / tour.
PNG quantised to 256 colours (~100 KB each). `overview.png` = contact sheet
of every screen (ar light + en dark). All data is test/demo data and says so.
The earlier `ar-*/en-*` files are the integrator's flow screenshots (kept).

## 6. Not done / limits (honest)

* **Web-preview rendering artefacts, not fixed** (they appear only in the
  headless Chromium + SwiftShader capture): some list thumbnails and the
  article hero render as a black box although the image files are valid
  and the same widget renders them elsewhere; map tiles are grey (no
  internet); the 360° viewer shows the web notice. Not verified on a phone.
* Text size was tested up to the app's own maximum ×1.6 (the device font
  scale multiplies on top of it; ×2.0 is covered by widget tests only).
* No screen-reader run; semantics were not changed except that the new mark
  is excluded (decorative).
* Remaining minor items: Arabic per-kWh unit ("ج.م/كيلوواط ساعة") can still
  wrap its last word at 360 dp; Home shows both a search icon and a search
  field; Q&A empty state shows the CTA twice (button + FAB).

## 7. Verification

| Command | Result |
|---|---|
| `flutter analyze` | No issues found |
| `flutter test` | 636 passed, 9 skipped (live) — incl. new `test/shared/widgets/design_review_test.dart`: WCAG contrast of gradient / dark primary / filled buttons / nav bar, AppMark in the kit matrix, StatTileRow last row; formatter tests for `shapeDate`/`range`). One charging test asserted that a section below the fold was *not* built (card-height dependent); it now asserts the merged notice is gone (same intent). |
| `flutter build web --release` | built (3 times, one per round) |
| Playwright r1/r2/r3 | 10 configurations per round, no page errors |

## 8. Notes for other teams

* Put white text only on `palette.brandGradient` (never `accentGradient` or
  plain `AppColors.cyan`).
* In dark mode `colorScheme.primary` is a light blue: for something drawn on
  a white chip use `AppColors.electricBlue`, not `primary`.
* Pass the hero widget via `AppScaffold.slivers(flexibleHeader:)`; do not
  put the page title inside the toolbar yourself — the hero shows it and the
  toolbar title appears on collapse.
* Use `fmt.shapeDate()` for any direct `DateFormat` output and `fmt.range()`
  for "from → to" strings.
* Regenerate icons with `node tool/brand/generate.cjs` after changing
  `mark.cjs` (keep `app_mark.dart` in sync).
