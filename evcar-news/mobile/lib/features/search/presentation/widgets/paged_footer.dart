import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../application/paged_state.dart';

/// End of an infinite list: spinner while loading more, inline retry on
/// failure, spacing otherwise.
class PagedListFooter extends StatelessWidget {
  const PagedListFooter({super.key, required this.state, required this.onRetry, this.failedMessage});

  final PagedState<Object?> state;
  final VoidCallback onRetry;
  final String? failedMessage;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (state.loadingMore) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Center(child: CircularProgressIndicator.adaptive(semanticsLabel: l10n.commonLoading)),
      );
    }
    if (state.loadMoreError != null) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          children: [
            Text(failedMessage ?? l10n.searchLoadMoreFailed, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.sm),
            SecondaryButton(label: l10n.commonRetry, icon: Icons.refresh, onPressed: onRetry),
          ],
        ),
      );
    }
    return const SizedBox(height: AppSpacing.lg);
  }
}

/// Calls [loadMore] after the frame when item [index] is close to the end
/// of a list of [length] items (prefetch the next page).
void prefetchNearEnd(BuildContext context, int index, int length, VoidCallback loadMore) {
  if (index < length - 3) return;
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (context.mounted) loadMore();
  });
}
