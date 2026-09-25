# EV Car News — design kit (`lib/shared/widgets`)

Every feature screen is built from this kit so the app looks and behaves
like one product. Import it with one line:

```dart
import '../../../shared/widgets/kit.dart'; // widgets + tokens + l10n + formatters + tray + favorites
```

Live reference: run the app in debug (or the web preview) and open
`/dev/kit` (`AppRoutes.designKit`). The route does not exist in release
builds. Owner of this folder: prep-mobile (see
`docs/decisions/prep-mobile.md`). Feature teams do **not** edit it; ask for
changes in your decisions file.

## Rules (non-negotiable)

1. **Missing = "غير متوفر / Not available", never 0.** Formatters return
   `null` for `null`; pass that `null` straight into `StatTile`, `SpecRow`,
   `CarCardStat`, `PriceTag` — they render the not-available state.
2. **Never colour alone.** Tones always come with an icon and/or text
   (`Pill`, `ReliabilityBadge`, `LastUpdatedText`, `showAppSnackBar`).
3. **Every screen has loading / empty / error / offline / permission-denied**
   states: `AsyncStateView` / `SliverAsyncStateView` with a `Skeleton`
   loader, `EmptyState` with a specific message + action,
   `PermissionDeniedState` with a manual alternative.
4. **Demo and paid content is labelled**: `isDemo` → `DemoBadge`
   ("بيانات تجريبية"), sponsored/ads → `SponsoredLabel` ("إعلان / رعاية").
   Cards do this for you when you pass the flags.
5. **Prices**: `PriceTag` with the type; converted prices always pass
   `isConverted: true` ("تقديري بعد التحويل").
6. **Ranges/charging**: always pass the qualifier (`RangeCycle.label`, SoC
   window, charger power). Never convert cycles.
7. **Text at 200% must not overflow**: no fixed heights around text; use
   `Wrap`, `StatTileRow`, `HorizontalCardList`, `AdaptiveGrid`. Widget
   tests must include `textScale: 2.0` (see `test/helpers/kit_harness.dart`).
8. **48 dp targets, Semantics**: use the kit buttons/chips; give cards a
   meaningful `semanticLabel` (the kit cards build one for you).
9. **RTL**: use `EdgeInsetsDirectional`, `AlignmentDirectional`,
   `PositionedDirectional`; never `left/right`.
10. **Motion**: short (`AppMotion.fast/medium`), and use
    `AppMotion.of(context, …)` so "remove animations" disables it.

## Tokens (`lib/app/theme`)

| Token | Use |
|---|---|
| `AppSpacing.xs/sm/md/lg/xl/xxl` (4/8/12/16/24/32) | all paddings & gaps; `context.pageGutter` for page edges |
| `AppRadii.card/image/control/pill/sheet` | shapes |
| `AppMotion.fast/medium/slow`, `AppMotion.of(context)` | animation durations (0 when disabled) |
| `context.palette` (`AppPalette`) | `brandGradient`, `imageScrim`, `tone(AppTone.x)` colours, skeleton colours, `cardShadow` |
| `AppTone.neutral/brand/info/success/warning/danger/demo/sponsored` | semantic tone of pills/badges/states |
| `context.windowSize`, `context.isLandscape`, `context.textScale` | responsive decisions |
| `kMaxReadableWidth` (720), `kMaxContentWidth` (1200) | content widths |

Typography: IBM Plex Sans Arabic, **no letter spacing** (it breaks Arabic
joining), taller body line height. Use `Theme.of(context).textTheme`.

## Components

### Page frame
- `AppScaffold(title:, body:)` / `AppScaffold.slivers(title:, largeTitle: true, slivers: [...])`
  — collapsing large title, `onRefresh` (adaptive pull-to-refresh),
  `bottomBar` (e.g. `CompareTrayBar`), offline banner on full-screen routes
  (the tab shell shows its own; `OfflineBannerScope` prevents duplicates).
- `ResponsiveCenter`, `SliverResponsivePadding` — gutters + max width.
- `SectionHeader(title:, icon:, onSeeAll:)` — announces "See all: <section>".

### Content
- `NewsCard(variant: hero | standard | compact, …)` — image with credit,
  category, time ("3 hours ago" → date after 7 days), sponsored/demo labels,
  `trailingAction` (e.g. `FavoriteButton`). Hero switches to a stacked layout
  at large text and uses a brand background when there is no image.
- `CarCard(layout: vertical | horizontal, …)` — powertrain pill (BEV/PHEV/
  EREV/HEV), up to 3 `CarCardStat`s, `PriceTag`, prominent `Tour360Badge`
  (`hasTour`), `footer: CompareToggleButton(...)`.
- `SpecGroup(title:, rows: [SpecRow(...)])` — `SpecRow` shows value +
  qualifier + `ReliabilityBadge` + `SourceBadge`; stacks at large text.
- `StatTile` / `StatTileRow` — key figures (range, battery, spend).
- `PriceTag` — amount + type + "as of" date + source; converted label.
- `LastUpdatedText(time:, staleAfter:)` — relative time, exact time in
  tooltip/semantics, "May be out of date" warning.
- `ImageWithFallback(url:, semanticLabel:, credit:, aspectRatio:)` — https
  only, decode at display size, skeleton while loading, calm fallback,
  credit overlay. Tests override `networkImageProviderFactory`.
- `AppCard` (alias `ContentCard`) — base card (soft shadow light, tonal dark).
- `HorizontalCardList` (≤ ~12 items, equal heights) / `AdaptiveGrid`.

### Labels & inputs
- `Pill`, `DemoBadge`, `SponsoredLabel`, `Tour360Badge`, `PowertrainPill`,
  `ReliabilityBadge`, `SourceBadge`, `NotAvailableValue`, `ValueOrNotAvailable`.
- `AppFilterChip`, `ChoicePills<T>`, `FilterBar(chips:, onOpenFilters:, activeCount:)`.
- `AppSearchField` (clear button, `readOnly` + `onTap` to open search).
- `PrimaryButton` / `SecondaryButton` (`loading`, `expand`, `destructive`).

### Feedback, sheets, states
- `showAppBottomSheet(context:, title:, builder:, footer:)`, `AppSheet`,
  `showConfirmSheet(...)` → `Future<bool>`.
- `showAppSnackBar(context, message, tone:, icon:)`.
- `Skeleton(child: …)` + `SkeletonBox/Line/Circle`, presets
  `NewsCardSkeleton(.compact)`, `CarCardSkeleton`, `ListTileSkeleton`,
  `SkeletonList(item:, count:)`.
- `AsyncStateView<T>` / `SliverAsyncStateView<T>` (value → data/empty/
  error/offline/permission/not-configured), `EmptyState`, `ErrorState`,
  `OfflineState`, `PermissionDeniedState(permission: AppPermission.location, …)`,
  `NotSupportedOnPlatformState` (web preview), `CachedDataNotice` (offline
  copies must say so), `SignInRequiredView` (personal features, guests).

### Shared state (outside `widgets/`)
- `lib/shared/compare_tray.dart` — `compareTrayProvider`
  (`List<CompareSelection>`; variant + model year + market; max 4, min 2 to
  compare; persisted). UI: `CompareToggleButton`, `CompareTrayBar`.
- `lib/shared/favorites/` — `favoritesProvider`, `isFavoriteProvider(key)`,
  `FavoriteButton(item: FavoriteItem(...))`; local for guests, synced when a
  `FavoritesRemote` is provided (favorites feature).

## Platform notes
- `platformCapabilitiesProvider` tells whether the WebView (360°), local
  notifications, SQLite cache, motion sensors are available. The web build
  is a **design preview only**; show `NotSupportedOnPlatformState` there.
- Local reminders: `localNotificationsProvider` (`lib/core/notifications`),
  ids via `localNotificationIdFor(reminderId)`; request permission only when
  the user turns a reminder on. Station "open now": `TimeZones.nowIn(zone)`.

## Testing
`test/helpers/kit_harness.dart` → `pumpKit(tester, widget, config: KitConfig('ar', dark: true, textScale: 2.0))`
renders with the real theme, localizations and formatters on a 360×780
phone; iterate `kitMatrix` to cover ar/en × light/dark × 100%/200%.
