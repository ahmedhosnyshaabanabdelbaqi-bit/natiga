import 'package:flutter/material.dart';
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
    final titleView =
        titleWidget ?? (title == null ? null : Text(title!, maxLines: 2, overflow: TextOverflow.ellipsis));

    Widget content;
    PreferredSizeWidget? appBar;
    if (slivers != null) {
      final expanded = flexibleHeader != null;
      final Widget sliverAppBar = largeTitle && !expanded
          ? SliverAppBar.large(title: titleView, actions: actions, leading: leading, bottom: bottom)
          : SliverAppBar(
              title: titleView,
              actions: actions,
              leading: leading,
              bottom: bottom,
              pinned: true,
              expandedHeight: expanded ? (expandedHeight ?? 280) : null,
              flexibleSpace: expanded
                  ? FlexibleSpaceBar(background: flexibleHeader, collapseMode: CollapseMode.parallax)
                  : null,
            );
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
      appBar = AppBar(title: titleView, actions: actions, leading: leading, bottom: bottom);
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
