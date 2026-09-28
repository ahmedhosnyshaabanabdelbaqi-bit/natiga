import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/kit.dart';
import '../../auth/presentation/auth_gate.dart';
import '../application/community_providers.dart';
import '../data/community_repository.dart';
import '../domain/community_models.dart';
import 'community_routes.dart';
import 'widgets/community_actions.dart';
import 'widgets/community_composer.dart';
import 'widgets/community_ui.dart';
import 'widgets/review_widgets.dart';

/// Write (or edit) an owner review (`/cars/:slug/reviews/new[?variant=&review=]`).
///
/// Requires an account with a verified e-mail and no moderator block (the
/// gate explains each case). Every review is checked by a moderator before it
/// is published; the "Verified owner" badge is never chosen by the user — it
/// appears only after a real ownership verification (server-side).
class WriteReviewScreen extends ConsumerWidget {
  const WriteReviewScreen({super.key, required this.carSlug, this.initialVariant, this.reviewId});

  /// Car (model) slug.
  final String carSlug;

  /// Trim id or slug (else `?variant=`).
  final String? initialVariant;

  /// My review to edit (else `?review=`).
  final String? reviewId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final variant = initialVariant ?? routeQueryParam(context, 'variant');
    final editId = reviewId ?? routeQueryParam(context, 'review');
    return Scaffold(
      appBar: AppBar(title: Text(editId == null ? l10n.communityWriteReviewTitle : l10n.communityEditReviewTitle)),
      body: AuthGate(
        returnTo: CommunityRoutes.writeReview(carSlug, variant: variant, reviewId: editId),
        guestMessage: l10n.communitySignInToReview,
        builder: (context, user) => CommunityPostingGate(
          compact: false,
          builder: (context, status) {
            final car = ref.watch(communityCarProvider(carSlug));
            final existing = editId == null ? null : ref.watch(reviewProvider(editId));
            if (existing != null && !existing.hasValue) {
              return AsyncStateView<Review>(
                value: existing,
                onRetry: () => ref.invalidate(reviewProvider(editId!)),
                builder: (_, _) => const SizedBox.shrink(),
              );
            }
            return AsyncStateView<CommunityCar>(
              value: car,
              onRetry: () => ref.invalidate(communityCarProvider(carSlug)),
              isEmpty: (c) => c.trims.isEmpty,
              emptyIcon: Icons.directions_car_outlined,
              emptyTitle: l10n.communityNoTrimsTitle,
              emptyMessage: l10n.communityNoTrimsMessage,
              builder: (context, c) {
                final review = existing?.value;
                return _ReviewForm(
                  key: ValueKey('${c.id}-${review?.id}'),
                  car: c,
                  initialTrim: c.initialTrim(review?.target.id ?? variant)!,
                  existing: review,
                  isNewAccount: status.isNewAccount,
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _ReviewForm extends ConsumerStatefulWidget {
  const _ReviewForm({
    super.key,
    required this.car,
    required this.initialTrim,
    this.existing,
    this.isNewAccount = false,
  });

  final CommunityCar car;
  final CommunityTrim initialTrim;
  final Review? existing;
  final bool isNewAccount;

  @override
  ConsumerState<_ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends ConsumerState<_ReviewForm> {
  final _formKey = GlobalKey<FormState>();
  late CommunityTrim _trim = widget.initialTrim;
  late int _rating = widget.existing?.rating ?? 0;
  late final _title = TextEditingController(text: widget.existing?.title);
  late final _body = TextEditingController(text: widget.existing?.body);
  late final _pros = TextEditingController(text: widget.existing?.pros);
  late final _cons = TextEditingController(text: widget.existing?.cons);
  late final _months = TextEditingController(text: widget.existing?.ownershipMonths?.toString());
  late final Map<String, int> _dims = {
    for (final d in widget.existing?.ratings ?? const <DimensionScore>[]) d.dimension: d.score,
  };
  bool _ratingMissing = false;
  bool _sending = false;
  String? _error;

  bool get _editing => widget.existing != null;

  @override
  void dispose() {
    for (final c in [_title, _body, _pros, _cons, _months]) {
      c.dispose();
    }
    super.dispose();
  }

  ReviewDraft _draft() => ReviewDraft(
    rating: _rating,
    title: _title.text,
    body: _body.text,
    pros: _pros.text,
    cons: _cons.text,
    ownershipMonths: int.tryParse(_months.text.trim()),
    ratings: Map.of(_dims),
    locale: context.languageCode,
  );

  Future<void> _submit() async {
    final l10n = context.l10n;
    setState(() {
      _ratingMissing = _rating == 0;
      _error = null;
    });
    final valid = _formKey.currentState?.validate() ?? false;
    if (!valid || _rating == 0) {
      unawaited(
        SemanticsService.sendAnnouncement(View.of(context), l10n.communityFormHasErrors, Directionality.of(context)),
      );
      return;
    }
    setState(() => _sending = true);
    final repo = ref.read(communityRepositoryProvider);
    try {
      if (_editing) {
        await repo.updateReview(widget.existing!.id, _draft());
      } else {
        await repo.createReview(_trim.id, _draft());
      }
      ref.invalidate(myReviewProvider(_trim.id));
      ref.invalidate(reviewSummaryProvider(_trim.id));
      ref.invalidate(reviewsControllerProvider);
      if (!mounted) return;
      setState(() => _sending = false);
      await showAppBottomSheet<void>(
        context: context,
        title: l10n.communityReviewSubmittedTitle,
        builder: (sheet) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: Icon(Icons.hourglass_top_rounded, size: 48)),
            const SizedBox(height: AppSpacing.md),
            Text(l10n.communityReviewSubmittedMessage, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.lg),
            PrimaryButton(label: l10n.communityDone, expand: true, onPressed: () => Navigator.of(sheet).pop()),
          ],
        ),
      );
      if (!mounted) return;
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(CommunityRoutes.carReviews(widget.car.slug, variant: _trim.id));
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      final details = e.details;
      final existingId = details is Map ? details['existingId'] : null;
      if (e.code == 'COMMUNITY_REVIEW_EXISTS' && existingId is String) {
        final edit = await showConfirmSheet(
          context: context,
          title: l10n.communityReviewExistsTitle,
          message: l10n.communityReviewExistsMessage,
          confirmLabel: l10n.communityEditMyReview,
          icon: Icons.rate_review_outlined,
        );
        if (edit && mounted) {
          context.replace(CommunityRoutes.writeReview(widget.car.slug, variant: _trim.id, reviewId: existingId));
        }
        return;
      }
      setState(() => _error = communityErrorMessage(l10n, e));
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = communityErrorMessage(l10n, e);
        });
      }
    }
  }

  String? _len(String? v, {required int min, required int max, bool required = false}) {
    final l10n = context.l10n;
    final t = v?.trim() ?? '';
    if (t.isEmpty) return required ? l10n.communityFieldRequired : null;
    if (t.length < min) return l10n.communityTooShort(min);
    if (t.length > max) return l10n.communityTooLong(max);
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final ratingLabels = [
      l10n.communityRating1,
      l10n.communityRating2,
      l10n.communityRating3,
      l10n.communityRating4,
      l10n.communityRating5,
    ];
    return Form(
      key: _formKey,
      child: ListView(
        padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.lg, context.pageGutter, AppSpacing.xxxl),
        children: [
          ResponsiveCenter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(widget.car.title, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                if (widget.car.isDemo || _trim.isDemo) ...[
                  const SizedBox(height: AppSpacing.sm),
                  const DemoTargetNotice(),
                ],
                const SizedBox(height: AppSpacing.md),
                if (_editing)
                  AppCard(child: Text(_trim.label, style: theme.textTheme.titleSmall))
                else
                  TrimSelector(trims: widget.car.trims, selected: _trim, onChanged: (t) => setState(() => _trim = t)),
                if (_editing && widget.existing!.status != ModerationStatus.approved) ...[
                  const SizedBox(height: AppSpacing.md),
                  ModerationNotice(status: widget.existing!.status, isReview: true),
                ],
                const SizedBox(height: AppSpacing.md),
                _ModerationInfo(isNewAccount: widget.isNewAccount, editing: _editing),
                _SectionLabel(l10n.communityOverallRating),
                StarRatingInput(
                  value: _rating,
                  label: l10n.communityOverallRating,
                  onChanged: (v) => setState(() {
                    _rating = v;
                    _ratingMissing = false;
                  }),
                ),
                Semantics(
                  liveRegion: true,
                  child: Text(
                    _ratingMissing
                        ? l10n.communityRatingRequired
                        : (_rating == 0 ? l10n.communityTapToRate : ratingLabels[_rating - 1]),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: _ratingMissing ? theme.colorScheme.error : theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                _SectionLabel(l10n.communityReviewTitleLabel, optional: true),
                TextFormField(
                  controller: _title,
                  maxLength: 200,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    hintText: l10n.communityReviewTitleHint,
                    border: const OutlineInputBorder(),
                  ),
                  validator: (v) => _len(v, min: 3, max: 200),
                ),
                _SectionLabel(l10n.communityReviewBodyLabel),
                TextFormField(
                  controller: _body,
                  minLines: 5,
                  maxLines: 14,
                  maxLength: 5000,
                  keyboardType: TextInputType.multiline,
                  decoration: InputDecoration(
                    hintText: l10n.communityReviewBodyHint,
                    helperText: l10n.communityReviewBodyHelper,
                    helperMaxLines: 3,
                    border: const OutlineInputBorder(),
                  ),
                  validator: (v) => _len(v, min: 20, max: 5000, required: true),
                ),
                _SectionLabel(l10n.communityPros, optional: true),
                TextFormField(
                  controller: _pros,
                  minLines: 2,
                  maxLines: 6,
                  maxLength: 2000,
                  decoration: InputDecoration(
                    hintText: l10n.communityProsHint,
                    prefixIcon: const Icon(Icons.add_circle_outline),
                    border: const OutlineInputBorder(),
                  ),
                  validator: (v) => _len(v, min: 1, max: 2000),
                ),
                _SectionLabel(l10n.communityCons, optional: true),
                TextFormField(
                  controller: _cons,
                  minLines: 2,
                  maxLines: 6,
                  maxLength: 2000,
                  decoration: InputDecoration(
                    hintText: l10n.communityConsHint,
                    prefixIcon: const Icon(Icons.remove_circle_outline),
                    border: const OutlineInputBorder(),
                  ),
                  validator: (v) => _len(v, min: 1, max: 2000),
                ),
                _SectionLabel(l10n.communityOwnershipLabel, optional: true),
                TextFormField(
                  controller: _months,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
                  decoration: InputDecoration(
                    hintText: l10n.communityOwnershipHint,
                    suffixText: l10n.communityMonthsUnit,
                    border: const OutlineInputBorder(),
                  ),
                  validator: (v) {
                    final t = v?.trim() ?? '';
                    if (t.isEmpty) return null;
                    final n = int.tryParse(t);
                    if (n == null || n < 0 || n > 600) return l10n.communityOwnershipInvalid;
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                _DimensionRatings(
                  values: _dims,
                  onChanged: (d, v) => setState(() => v == null ? _dims.remove(d) : _dims[d] = v),
                ),
                const SizedBox(height: AppSpacing.md),
                const _VerifiedOwnerInfo(),
                if (_error != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  Semantics(
                    liveRegion: true,
                    child: Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: context.palette.tone(AppTone.danger).container,
                        borderRadius: AppRadii.control,
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.error_outline, color: context.palette.tone(AppTone.danger).onContainer),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Text(
                              _error!,
                              style: TextStyle(color: context.palette.tone(AppTone.danger).onContainer),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.xl),
                PrimaryButton(
                  label: _editing ? l10n.communitySaveReview : l10n.communitySubmitReview,
                  icon: Icons.send_rounded,
                  expand: true,
                  loading: _sending,
                  onPressed: _sending ? null : _submit,
                ),
                if (_editing) ...[
                  const SizedBox(height: AppSpacing.sm),
                  SecondaryButton(
                    label: l10n.communityDeleteReview,
                    icon: Icons.delete_outline,
                    expand: true,
                    onPressed: _sending
                        ? null
                        : () async {
                            final ok = await confirmAndDelete(
                              context,
                              title: l10n.communityDeleteReviewTitle,
                              run: () async {
                                await ref.read(communityRepositoryProvider).deleteReview(widget.existing!.id);
                                ref.invalidate(myReviewProvider(_trim.id));
                                ref.invalidate(reviewSummaryProvider(_trim.id));
                                ref.invalidate(reviewsControllerProvider);
                              },
                            );
                            if (ok && context.mounted) {
                              context.canPop() ? context.pop() : context.go(AppRoutes.carReviews(widget.car.slug));
                            }
                          },
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, {this.optional = false});

  final String text;
  final bool optional;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl, bottom: AppSpacing.sm),
      child: Semantics(
        header: true,
        child: Text.rich(
          TextSpan(
            text: text,
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            children: [
              if (optional)
                TextSpan(
                  text: ' · ${context.l10n.communityOptional}',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ModerationInfo extends StatelessWidget {
  const _ModerationInfo({required this.isNewAccount, required this.editing});

  final bool isNewAccount;
  final bool editing;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final colors = context.palette.tone(AppTone.info);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.container,
        borderRadius: AppRadii.control,
        border: Border.all(color: colors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.shield_outlined, color: colors.onContainer),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              [
                editing ? l10n.communityEditRemoderated : l10n.communityReviewModerated,
                l10n.communityReviewGuidelines,
              ].join('\n'),
              style: theme.textTheme.bodySmall?.copyWith(color: colors.onContainer),
            ),
          ),
        ],
      ),
    );
  }
}

class _VerifiedOwnerInfo extends StatelessWidget {
  const _VerifiedOwnerInfo();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.verified_outlined, size: 20, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            l10n.communityVerifiedOwnerExplainer,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}

class _DimensionRatings extends StatelessWidget {
  const _DimensionRatings({required this.values, required this.onChanged});

  final Map<String, int> values;
  final void Function(String dimension, int? value) onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return AppCard(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        initiallyExpanded: values.isNotEmpty,
        shape: const Border(),
        leading: const Icon(Icons.tune),
        title: Text(
          l10n.communityDimensionsTitle,
          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(l10n.communityDimensionsHint),
        childrenPadding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, 0, AppSpacing.sm, AppSpacing.md),
        children: [
          for (final d in ReviewDimensions.car)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(dimensionLabel(l10n, d), style: theme.textTheme.bodyLarge)),
                      if (values[d] != null)
                        TextButton(onPressed: () => onChanged(d, null), child: Text(l10n.communityClearRating)),
                    ],
                  ),
                  StarRatingInput(
                    value: values[d] ?? 0,
                    size: 28,
                    label: dimensionLabel(l10n, d),
                    onChanged: (v) => onChanged(d, v),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
