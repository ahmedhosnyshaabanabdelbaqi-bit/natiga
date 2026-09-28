import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:photo_view/photo_view.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/links/external_links.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/tour_models.dart';
import 'tour_facts.dart';
import 'tour_labels.dart';

/// Hosts allowed for embedded videos (the API only ever returns these).
const kVideoEmbedHosts = {'www.youtube-nocookie.com', 'player.vimeo.com'};

/// Whether a hotspot video may be opened: https embeds on the allow-list, or
/// an uploaded file on the tour's media origin.
bool isAllowedVideoUrl(HotspotVideo video, {String? mediaOrigin}) {
  final uri = Uri.tryParse(video.url);
  if (uri == null || uri.scheme != 'https' || uri.userInfo.isNotEmpty) return false;
  if (video.kind == 'embed') return kVideoEmbedHosts.contains(uri.host);
  if (mediaOrigin == null) return false;
  final origin = Uri.tryParse(mediaOrigin);
  return origin != null && uri.origin == origin.origin;
}

/// Opens the native sheet for an info / image / video / spec hotspot. All
/// text is plain `Text` (never HTML).
Future<void> showHotspotSheet(BuildContext context, {required TourDetail tour, required Hotspot hotspot}) {
  final l10n = context.l10n;
  return showAppBottomSheet<void>(
    context: context,
    title: hotspot.title.isEmpty ? TourLabels.hotspotKind(l10n, hotspot.type) : hotspot.title,
    builder: (context) => HotspotSheetBody(tour: tour, hotspot: hotspot),
  );
}

class HotspotSheetBody extends StatelessWidget {
  const HotspotSheetBody({super.key, required this.tour, required this.hotspot});

  final TourDetail tour;
  final Hotspot hotspot;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: Pill(
            label: TourLabels.hotspotKind(l10n, hotspot.type),
            icon: TourLabels.hotspotIcon(hotspot.type),
            tone: AppTone.brand,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (hotspot.body != null) ...[
          SelectableText(hotspot.body!, style: theme.textTheme.bodyLarge),
          const SizedBox(height: AppSpacing.lg),
        ],
        switch (hotspot.type) {
          HotspotType.detailImage when hotspot.image != null => _DetailImage(image: hotspot.image!),
          HotspotType.video when hotspot.video != null => _VideoLink(video: hotspot.video!, mediaOrigin: tour.mediaOrigin),
          HotspotType.specLink when hotspot.spec != null => _LinkedSpec(spec: hotspot.spec!),
          _ => const SizedBox.shrink(),
        },
      ],
    );
  }
}

class _DetailImage extends StatelessWidget {
  const _DetailImage({required this.image});

  final HotspotImage image;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final width = MediaQuery.sizeOf(context).width * MediaQuery.devicePixelRatioOf(context);
    final url = image.urlFor(width);
    final ratio = image.width != null && image.height != null && image.height! > 0 ? image.width! / image.height! : 4 / 3;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          button: true,
          label: image.alt ?? l10n.toursHotspotImage,
          hint: l10n.toursImageZoomHint,
          excludeSemantics: true,
          child: InkWell(
            borderRadius: AppRadii.image,
            onTap: isLoadableImageUrl(url) ? () => _openZoom(context, image) : null,
            child: ImageWithFallback(
              url: url,
              aspectRatio: ratio.clamp(0.5, 2.5),
              borderRadius: AppRadii.image,
              credit: image.credit,
              overlay: const PositionedDirectional(
                top: AppSpacing.sm,
                end: AppSpacing.sm,
                child: _ZoomBadge(),
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          l10n.toursImageZoomHint,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }

  static void _openZoom(BuildContext context, HotspotImage image) {
    final l10n = context.l10n;
    final largest = image.urlFor(double.infinity);
    final imageFor = ProviderScope.containerOf(context, listen: false).read(networkImageProviderFactory);
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (context) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            title: Text(l10n.toursImageZoomTitle),
          ),
          body: Stack(
            children: [
              Positioned.fill(
                child: Semantics(
                  image: true,
                  label: image.alt ?? l10n.toursHotspotImage,
                  child: PhotoView(
                    imageProvider: imageFor(largest),
                    minScale: PhotoViewComputedScale.contained,
                    maxScale: PhotoViewComputedScale.covered * 4,
                    backgroundDecoration: const BoxDecoration(color: Colors.black),
                    loadingBuilder: (context, _) => const Center(child: CircularProgressIndicator()),
                    errorBuilder: (context, _, _) => Center(
                      child: Text(l10n.commonImageUnavailable, style: const TextStyle(color: Colors.white)),
                    ),
                  ),
                ),
              ),
              if (image.credit != null)
                PositionedDirectional(
                  start: AppSpacing.md,
                  bottom: AppSpacing.md,
                  child: SafeArea(
                    child: Text(
                      l10n.commonImageCredit(image.credit!),
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ZoomBadge extends StatelessWidget {
  const _ZoomBadge();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(6),
    decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), shape: BoxShape.circle),
    child: const Icon(Icons.zoom_in, color: Colors.white, size: 20),
  );
}

class _VideoLink extends StatelessWidget {
  const _VideoLink({required this.video, required this.mediaOrigin});

  final HotspotVideo video;
  final String? mediaOrigin;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final allowed = isAllowedVideoUrl(video, mediaOrigin: mediaOrigin);
    final provider = switch (video.provider) {
      'youtube' => 'YouTube',
      'vimeo' => 'Vimeo',
      _ => l10n.toursVideoSelf,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (allowed)
          PrimaryButton(
            label: l10n.toursVideoOpen,
            icon: Icons.play_arrow_rounded,
            expand: true,
            onPressed: () => openExternalUrl(context, video.url),
          )
        else
          Text(l10n.toursVideoBlocked, style: theme.textTheme.bodyMedium),
        const SizedBox(height: AppSpacing.xs),
        Text(
          [
            l10n.toursVideoProvider(provider),
            if (video.credit != null) l10n.toursCredit(video.credit!),
          ].join(' · '),
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _LinkedSpec extends StatelessWidget {
  const _LinkedSpec({required this.spec});

  final HotspotSpec spec;

  String? _value(BuildContext context) {
    final v = spec.value;
    if (v == null) return null;
    final fmt = AppFormatters.of(context);
    final text = switch (v) {
      final num n => fmt.number(n, maxDecimals: 2),
      final bool b => b ? '✓' : '✗',
      final String s => s,
      _ => null,
    };
    if (text == null) return null;
    return spec.unit == null || v is bool ? text : '$text ${spec.unit}';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
          child: SpecRow(
            label: spec.label,
            value: _value(context),
            reliability: Reliability.fromApi(spec.reliability),
            showSource: false,
          ),
        ),
        if (spec.variantSlug != null) ...[
          const SizedBox(height: AppSpacing.md),
          SecondaryButton(
            label: l10n.toursSpecOpen,
            icon: Icons.fact_check_outlined,
            expand: true,
            onPressed: () {
              Navigator.of(context).pop();
              context.push(AppRoutes.variant(spec.variantSlug!));
            },
          ),
        ],
      ],
    );
  }
}

/// All hotspots of a scene as an accessible native list (screen readers
/// cannot reach hotspots inside the WebView reliably).
Future<Hotspot?> showHotspotListSheet(BuildContext context, {required TourScene scene}) {
  final l10n = context.l10n;
  return showAppBottomSheet<Hotspot>(
    context: context,
    title: l10n.toursPoints,
    builder: (context) {
      if (scene.hotspots.isEmpty) {
        return EmptyState(compact: true, icon: Icons.touch_app_outlined, title: l10n.toursPointsEmpty);
      }
      return Column(
        children: [
          for (final h in scene.hotspots)
            ListTile(
              contentPadding: EdgeInsets.zero,
              minTileHeight: 56,
              leading: CircleAvatar(
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                foregroundColor: Theme.of(context).colorScheme.onPrimaryContainer,
                child: Icon(TourLabels.hotspotIcon(h.type)),
              ),
              title: Text(h.title.isEmpty ? TourLabels.hotspotKind(l10n, h.type) : h.title),
              subtitle: Text(TourLabels.hotspotKind(l10n, h.type)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).pop(h),
            ),
        ],
      );
    },
  );
}

/// "About this tour": binding, reference note, description, credits.
Future<void> showTourInfoSheet(BuildContext context, {required TourDetail tour, String? carSlug}) {
  return showAppBottomSheet<void>(
    context: context,
    title: context.l10n.toursInfo,
    builder: (context) => TourInfoBody(tour: tour, carSlug: carSlug),
  );
}

class TourInfoBody extends ConsumerWidget {
  const TourInfoBody({super.key, required this.tour, this.carSlug});

  final TourDetail tour;
  final String? carSlug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final card = tour.card;
    final fmt = AppFormatters.of(context);
    final published = fmt.date(card.publishedAt);
    final slug = carSlug ?? card.modelSlug;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(card.displayName, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        if (card.title != null) ...[
          const SizedBox(height: 2),
          Text(card.title!, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
        const SizedBox(height: AppSpacing.md),
        TourBindingPills(card: card),
        if (card.isDemo) ...[const SizedBox(height: AppSpacing.md), DemoTourNotice(card: card)],
        if (tour.isReference) ...[const SizedBox(height: AppSpacing.md), ReferenceTrimNotice(card: card)],
        if (!tour.marketMatch && card.marketCode != null) ...[
          const SizedBox(height: AppSpacing.md),
          _Notice(
            icon: Icons.public,
            text: l10n.toursMarketMismatch(TourBindingPills.marketName(ref, context, card.marketCode) ?? card.marketCode!),
          ),
        ],
        if (tour.description != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Semantics(header: true, child: Text(l10n.toursAbout, style: theme.textTheme.titleSmall)),
          const SizedBox(height: AppSpacing.xs),
          SelectableText(tour.description!, style: theme.textTheme.bodyMedium),
        ],
        const SizedBox(height: AppSpacing.lg),
        Semantics(header: true, child: Text(l10n.toursAttributionTitle, style: theme.textTheme.titleSmall)),
        const SizedBox(height: AppSpacing.xs),
        AttributionList(tour: tour),
        if (published != null) ...[
          const SizedBox(height: AppSpacing.md),
          Text(
            l10n.toursPublished(published),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
        if (slug != null) ...[
          const SizedBox(height: AppSpacing.lg),
          SecondaryButton(
            label: l10n.toursViewCar,
            icon: Icons.directions_car_outlined,
            expand: true,
            onPressed: () {
              Navigator.of(context).pop();
              context.push(AppRoutes.car(slug));
            },
          ),
        ],
      ],
    );
  }
}

/// Credits and licences of every file in the tour (links open outside the
/// app, https only).
class AttributionList extends StatelessWidget {
  const AttributionList({super.key, required this.tour});

  final TourDetail tour;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final entries = tour.attributions.isNotEmpty
        ? tour.attributions
        : [
            for (final s in tour.scenes)
              if (s.attribution.displayText != null)
                TourAttribution(
                  text: s.attribution.displayText!,
                  licenseType: s.attribution.licenseType,
                  licenseUrl: s.attribution.licenseUrl,
                  sourceUrl: s.attribution.sourceUrl,
                ),
          ];
    final seen = <String>{};
    final unique = [
      for (final e in entries)
        if (seen.add('${e.text}|${e.licenseType}|${e.licenseUrl}')) e,
    ];
    if (unique.isEmpty) {
      return Text(l10n.commonNotAvailable, style: theme.textTheme.bodyMedium);
    }
    bool https(String? u) => u != null && Uri.tryParse(u)?.scheme == 'https';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final a in unique)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.toursCredit(a.text), style: theme.textTheme.bodyMedium),
                Text(
                  l10n.toursLicense(TourLabels.license(l10n, a.licenseType)),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                Wrap(
                  spacing: AppSpacing.sm,
                  children: [
                    if (https(a.licenseUrl))
                      TextButton.icon(
                        onPressed: () => openExternalUrl(context, a.licenseUrl!),
                        icon: const Icon(Icons.open_in_new, size: 18),
                        label: Text(l10n.toursLicenseTerms),
                      ),
                    if (https(a.sourceUrl))
                      TextButton.icon(
                        onPressed: () => openExternalUrl(context, a.sourceUrl!),
                        icon: const Icon(Icons.open_in_new, size: 18),
                        label: Text(l10n.toursSourceLink),
                      ),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final tone = context.palette.tone(AppTone.info);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: tone.container,
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: tone.onContainer),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: tone.onContainer)),
          ),
        ],
      ),
    );
  }
}
