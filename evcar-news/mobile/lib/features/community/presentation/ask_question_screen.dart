import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../../auth/presentation/auth_gate.dart';
import '../application/community_providers.dart';
import '../data/community_repository.dart';
import '../domain/community_models.dart';
import 'community_routes.dart';
import 'widgets/community_actions.dart';
import 'widgets/community_composer.dart';
import 'widgets/community_ui.dart';

/// Ask a question (`/questions/ask[?model=<car slug>]`); requires an account
/// with a verified e-mail. Questions go live at once unless the anti-spam
/// checks hold them for review (the asker is told).
class AskQuestionScreen extends ConsumerWidget {
  const AskQuestionScreen({super.key, this.modelSlug});

  /// Car the question is about (else `?model=`).
  final String? modelSlug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final slug = modelSlug ?? routeQueryParam(context, 'model');
    return Scaffold(
      appBar: AppBar(title: Text(l10n.communityAskTitle)),
      body: AuthGate(
        returnTo: CommunityRoutes.ask(modelSlug: slug),
        guestMessage: l10n.communitySignInToAsk,
        builder: (context, user) => CommunityPostingGate(
          compact: false,
          builder: (context, status) {
            if (slug == null) return const _AskForm(car: null);
            final car = ref.watch(communityCarProvider(slug));
            return AsyncStateView<CommunityCar>(
              value: car,
              onRetry: () => ref.invalidate(communityCarProvider(slug)),
              builder: (context, c) => _AskForm(car: c),
            );
          },
        ),
      ),
    );
  }
}

class _AskForm extends ConsumerStatefulWidget {
  const _AskForm({required this.car});

  final CommunityCar? car;

  @override
  ConsumerState<_AskForm> createState() => _AskFormState();
}

class _AskFormState extends ConsumerState<_AskForm> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _body = TextEditingController();
  late CommunityCar? _car = widget.car;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final q = await ref
          .read(communityRepositoryProvider)
          .askQuestion(
            title: _title.text,
            body: _body.text,
            targetType: _car == null ? null : CommunityTargetTypes.model,
            targetId: _car?.id,
            locale: context.languageCode,
          );
      ref.invalidate(questionsControllerProvider);
      if (!mounted) return;
      showAppSnackBar(
        context,
        q.status == ModerationStatus.pending ? l10n.communityPostedPending : l10n.communityQuestionPosted,
        icon: q.status == ModerationStatus.pending ? Icons.hourglass_top_rounded : Icons.check,
        tone: q.status == ModerationStatus.pending ? AppTone.warning : AppTone.success,
      );
      context.replace(AppRoutes.question(q.id));
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = communityErrorMessage(l10n, e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Form(
      key: _formKey,
      child: ListView(
        padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.lg, context.pageGutter, AppSpacing.xxxl),
        children: [
          ResponsiveCenter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_car != null) ...[
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.xs,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      InputChip(
                        avatar: const Icon(Icons.directions_car_outlined, size: 18),
                        label: Text(l10n.communityAboutCar(_car!.title)),
                        onDeleted: () => setState(() => _car = null),
                        deleteButtonTooltipMessage: l10n.communityAskGeneral,
                      ),
                      if (_car!.isDemo) const DemoBadge(dense: true),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
                _Tips(),
                const SizedBox(height: AppSpacing.xl),
                TextFormField(
                  controller: _title,
                  maxLength: 300,
                  minLines: 1,
                  maxLines: 3,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: l10n.communityQuestionTitleLabel,
                    hintText: l10n.communityQuestionTitleHint,
                    border: const OutlineInputBorder(),
                  ),
                  validator: (v) {
                    final t = v?.trim() ?? '';
                    if (t.isEmpty) return l10n.communityFieldRequired;
                    if (t.length < 10) return l10n.communityTooShort(10);
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _body,
                  minLines: 4,
                  maxLines: 12,
                  maxLength: 5000,
                  keyboardType: TextInputType.multiline,
                  decoration: InputDecoration(
                    labelText: '${l10n.communityQuestionBodyLabel} · ${l10n.communityOptional}',
                    hintText: l10n.communityQuestionBodyHint,
                    alignLabelWithHint: true,
                    border: const OutlineInputBorder(),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Semantics(
                    liveRegion: true,
                    child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                  ),
                ],
                const SizedBox(height: AppSpacing.lg),
                PrimaryButton(
                  label: l10n.communityPostQuestion,
                  icon: Icons.send_rounded,
                  expand: true,
                  loading: _sending,
                  onPressed: _sending ? null : _submit,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Tips extends StatelessWidget {
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
          Icon(Icons.lightbulb_outline, color: colors.onContainer),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(l10n.communityAskTips, style: theme.textTheme.bodySmall?.copyWith(color: colors.onContainer)),
          ),
        ],
      ),
    );
  }
}
