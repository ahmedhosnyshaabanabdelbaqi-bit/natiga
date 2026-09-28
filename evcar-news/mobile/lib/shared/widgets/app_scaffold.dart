import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_tokens.dart';
import '../../core/connectivity/connectivity_service.dart';
import 'cached_data_notice.dart';

/// Marks a subtree whose ancestor already shows the [OfflineBanner] (the tab
/// shell), so [AppScaffold]s inside it do not show a second one.
class OfflineBannerScope extends InheritedWidget {
  const OfflineBannerScope({super.key, required super.child});

  static bool hasBanner(BuildContext context) => context.getInheritedWidgetOfExactType<OfflineBannerScope>() != null;

  @override
  bool updateShouldNotify(OfflineBannerScope oldWidget) => false;
}

/// Standard page frame. Two forms:
///
/// * `AppScaffold(title:, body:)` — classic app bar + box body.
/// * `AppScaffold.slivers(title:, slivers:)` — collapsing app bar
///   (`largeTitle: true` gives the large Material 3 / iOS-style title that
///   shrinks on scroll) + your slivers; the preferred form for content lists
///   and detail pages.
///
/// Both add pull-to-refresh when [onRefresh] is set (platform-adaptive
/// indicator), the offline banner on full-screen routes (the tab shell shows
/// its own), and centre content on wide screens.
///
/// ```dart
/// AppScaffold.slivers(
///   title: l10n.newsListTitle,
///   largeTitle: true,
///   onRefresh: () => ref.refresh(latestNewsProvider.future),
///   slivers: [
///     SliverAsyncStateView(value: news, builder: (context, items) => SliverList.list(children: …)),
///   ],
/// )
/// ```
class AppScaffold extends ConsumerWidget {
  const AppScaffold({
    super.key,
    this.title,
    this.titleWidget,
    this.actions,
    this.leading,
    required Widget this.body,
    this.bottom,
    this.onRefresh,
    this.floatingActionButton,
    this.bottomBar,
    this.showOfflineBanner = true,
    this.backgroundColor,
  }) : slivers = null,
       largeTitle = false,
       flexibleHeader = null,
       expandedHeight = null;

  const AppScaffold.slivers({
    super.key,
    this.title,
    this.titleWidget,
    this.actions,
    this.leading,
    required List<Widget> this.slivers,
    this.largeTitle = false,
    this.flexibleHeader,
    this.expandedHeight,
    this.bottom,
    this.onRefresh,
    this.floatingActionButton,
    this.bottomBar,
    this.showOfflineBanner = true,
    this.backgroundColor,
  }) : body = null;

  final String? title;

  /// Replaces [title] in the app bar (e.g. `BrandTitle`, a search field).
  final Widget? titleWidget;
  final List<Widget>? actions;
  final Widget? leading;
  final Widget? body;
  final List<Widget>? slivers;

  /// Large collapsing title (slivers form only).
  final bool largeTitle;

  /// Background of an expanded header (e.g. a hero image) — slivers form.
  final Widget? flexibleHeader;
  final double? expandedHeight;

  /// Below the app bar (e.g. a `TabBar`).
  final PreferredSizeWidget? bottom;

  /// Enables pull-to-refresh.
  final Future<void> Function()? onRefresh;
  final Widget? floatingActionButton;

  /// Sticky bar at the bottom (e.g. `CompareTrayBar`, a primary action).
  final Widget? bottomBar;

  final bool showOfflineBanner;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(isOnlineProvider).value ?? true;
    final showBanner = showOfflineBanner && !online && !OfflineBannerScope.hasBanner(context);
    // Toolbar titles stay on one line: two lines do not fit the 56dp bar at
    // large text sizes and were clipped at the top. The large (collapsing)
    // title has room for two.
    Text titleText(int lines) => Text(title!, maxLines: lines, overflow: TextOverflow.ellipsis);

    Widget content;
    PreferredSizeWidget? appBar;
    if (slivers != null) {
      final expanded = flexibleHeader != null;
      final Widget sliverAppBar;
      if (largeTitle && !expanded) {
        sliverAppBar = SliverAppBar.large(
          title: titleWidget ?? (title == null ? null : titleText(2)),
          actions: actions,
          leading: leading,
          bottom: bottom,
        );
      } else if (expanded) {
        sliverAppBar = _HeroSliverAppBar(
          title: titleWidget ?? (title == null ? null : titleText(1)),
          actions: actions,
          leading: leading,
          bottom: bottom,
          expandedHeight: expandedHeight ?? 280,
          background: flexibleHeader!,
        );
      } else {
        sliverAppBar = SliverAppBar(
          title: titleWidget ?? (title == null ? null : titleText(1)),
          actions: actions,
          leading: leading,
          bottom: bottom,
          pinned: true,
        );
      }
      content = CustomScrollView(
        physics: onRefresh == null ? null : const AlwaysScrollableScrollPhysics(),
        slivers: [
          sliverAppBar,
          ...slivers!,
          // Room for the FAB / home indicator.
          const SliverSafeArea(
            top: false,
            sliver: SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xl)),
          ),
        ],
      );
    } else {
      appBar = AppBar(
        title: titleWidget ?? (title == null ? null : titleText(1)),
        actions: actions,
        leading: leading,
        bottom: bottom,
      );
      content = body!;
    }

    if (onRefresh != null) {
      content = RefreshIndicator.adaptive(onRefresh: onRefresh!, child: content);
    }
    if (showBanner) {
      content = Column(
        children: [
          const OfflineBanner(),
          Expanded(child: content),
        ],
      );
    }

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: appBar,
      body: content,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomBar,
    );
  }
}

/// Pinned app bar over a hero image (car pages).
///
/// * While the hero shows, the back button, title and actions are white on
///   a top scrim; once collapsed they switch to the normal app-bar colours,
///   and the toolbar title only fades in then (the hero carries the name).
/// * The [bottom] (tabs) sits on a solid surface strip, never on the image,
///   so tab labels keep their contrast.
/// * The expanded height grows with the text size (the hero's text never
///   overlaps the toolbar) and is capped to half the screen in landscape.
class _HeroSliverAppBar extends StatefulWidget {
  const _HeroSliverAppBar({
    required this.title,
    required this.actions,
    required this.leading,
    required this.bottom,
    required this.expandedHeight,
    required this.background,
  });

  final Widget? title;
  final List<Widget>? actions;
  final Widget? leading;
  final PreferredSizeWidget? bottom;
  final double expandedHeight;
  final Widget background;

  @override
  State<_HeroSliverAppBar> createState() => _HeroSliverAppBarState();
}

class _HeroSliverAppBarState extends State<_HeroSliverAppBar> {
  bool _collapsed = false;

  void _update(bool collapsed) {
    if (collapsed == _collapsed) return;
    // Called during layout: apply after this frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && collapsed != _collapsed) setState(() => _collapsed = collapsed);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final media = MediaQuery.of(context);
    final scale = context.textScale.clamp(1.0, 2.0);
    final bottomHeight = widget.bottom?.preferredSize.height ?? 0;
    final minHeight = media.padding.top + kToolbarHeight + bottomHeight;
    var expanded = widget.expandedHeight + (scale - 1) * 140;
    // Landscape / short screens: keep at least half of the screen for content.
    expanded = expanded.clamp(
      kToolbarHeight + bottomHeight + 72,
      math.max(kToolbarHeight + bottomHeight + 72, media.size.height * 0.5),
    );
    final onHero = !_collapsed;
    final foreground = onHero ? Colors.white : scheme.onSurface;

    return SliverAppBar(
      pinned: true,
      expandedHeight: expanded,
      leading: widget.leading,
      actions: widget.actions,
      foregroundColor: foreground,
      iconTheme: IconThemeData(color: foreground),
      actionsIconTheme: IconThemeData(color: foreground),
      systemOverlayStyle: onHero ? SystemUiOverlayStyle.light : null,
      title: widget.title == null
          ? null
          : AnimatedOpacity(
              opacity: _collapsed ? 1 : 0,
              duration: AppMotion.of(context, AppMotion.fast),
              child: widget.title,
            ),
      bottom: widget.bottom == null ? null : _SolidBottom(child: widget.bottom!),
      flexibleSpace: LayoutBuilder(
        builder: (context, constraints) {
          _update(constraints.maxHeight <= minHeight + 8);
          return FlexibleSpaceBar(
            collapseMode: CollapseMode.parallax,
            background: Stack(
              fit: StackFit.expand,
              children: [
                Padding(
                  padding: EdgeInsets.only(bottom: bottomHeight),
                  child: widget.background,
                ),
                // Top scrim so the white back button / actions stay legible
                // on bright images.
                const IgnorePointer(
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: SizedBox(
                      height: 120,
                      width: double.infinity,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Color(0x80000000), Color(0x00000000)],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Puts an app-bar `bottom` (a TabBar) on an opaque surface strip.
class _SolidBottom extends StatelessWidget implements PreferredSizeWidget {
  const _SolidBottom({required this.child});

  final PreferredSizeWidget child;

  @override
  Size get preferredSize => child.preferredSize;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.appBarTheme.backgroundColor ?? theme.scaffoldBackgroundColor,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: theme.colorScheme.outlineVariant)),
        ),
        child: child,
      ),
    );
  }
}

/// Centres [child] and limits its width on tablets/landscape so lines stay
/// readable (default [kMaxReadableWidth]).
class ResponsiveCenter extends StatelessWidget {
  const ResponsiveCenter({super.key, required this.child, this.maxWidth = kMaxReadableWidth, this.padding});

  final Widget child;
  final double maxWidth;

  /// Defaults to the page gutter for the current width.
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(
          padding: padding ?? EdgeInsets.symmetric(horizontal: context.pageGutter),
          child: child,
        ),
      ),
    );
  }
}

/// Sliver version of [ResponsiveCenter]: horizontal gutter + max width.
class SliverResponsivePadding extends StatelessWidget {
  const SliverResponsivePadding({super.key, required this.sliver, this.maxWidth = kMaxContentWidth, this.vertical = 0});

  final Widget sliver;
  final double maxWidth;
  final double vertical;

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.crossAxisExtent;
        final gutter = AppSpacing.pageGutter(width);
        final extra = width - 2 * gutter > maxWidth ? (width - maxWidth) / 2 : gutter;
        return SliverPadding(
          padding: EdgeInsets.symmetric(horizontal: extra, vertical: vertical),
          sliver: sliver,
        );
      },
    );
  }
}
