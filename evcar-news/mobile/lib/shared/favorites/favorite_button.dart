import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_palette.dart';
import '../../core/errors/app_errors.dart';
import '../../core/l10n/l10n.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../widgets/feedback.dart';
import 'favorite_item.dart';
import 'favorites_controller.dart';
import 'favorites_repository.dart';

/// Heart toggle for articles, cars, stations, comparisons and tours.
///
/// Announced as "Add to favorites" / "Remove from favorites" with a
/// selected state; the icon changes shape (outline ↔ filled), not only
/// colour. Guests are told the favorite is kept on this device.
///
/// ```dart
/// FavoriteButton(
///   item: FavoriteItem(
///     key: FavoriteKey(FavoriteType.article, a.id),
///     title: a.title,
///     imageUrl: a.coverImage?.url,
///     route: AppRoutes.article(a.slug),
///   ),
/// )
/// ```
class FavoriteButton extends ConsumerStatefulWidget {
  const FavoriteButton({super.key, required this.item, this.showFeedback = true});

  final FavoriteItem item;

  /// Show a snackbar after toggling.
  final bool showFeedback;

  @override
  ConsumerState<FavoriteButton> createState() => _FavoriteButtonState();
}

class _FavoriteButtonState extends ConsumerState<FavoriteButton> {
  bool _busy = false;

  Future<void> _toggle() async {
    if (_busy) return;
    setState(() => _busy = true);
    final l10n = context.l10n;
    try {
      final now = await ref.read(favoritesProvider.notifier).toggle(widget.item);
      if (!mounted || !widget.showFeedback) return;
      final signedIn = ref.read(authControllerProvider).isSignedIn;
      final syncs = signedIn && ref.read(favoritesRemoteProvider) != null;
      showAppSnackBar(
        context,
        now
            ? (syncs ? l10n.commonFavoriteAdded : '${l10n.commonFavoriteAdded}. ${l10n.commonFavoriteLocalOnly}')
            : l10n.commonFavoriteRemoved,
        icon: now ? Icons.favorite : Icons.favorite_border,
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, '${l10n.commonFavoriteFailed} ${errorMessage(l10n, e)}', tone: AppTone.danger);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isFav = ref.watch(isFavoriteProvider(widget.item.key));
    final label = isFav ? l10n.commonFavoriteRemove : l10n.commonFavoriteAdd;
    return Semantics(
      toggled: isFav,
      child: IconButton(
        tooltip: label,
        onPressed: _busy ? null : _toggle,
        isSelected: isFav,
        icon: const Icon(Icons.favorite_border),
        selectedIcon: Icon(Icons.favorite, color: Theme.of(context).colorScheme.error),
      ),
    );
  }
}
