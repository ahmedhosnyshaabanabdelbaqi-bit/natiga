import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/l10n/l10n.dart';
import '../data/auth_repository.dart';
import 'widgets/auth_widgets.dart';

/// `/auth/forgot-password` — requests a reset link. The confirmation text
/// never reveals whether the account exists (the server answers 202 either
/// way).
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _busy = false;
  bool _done = false;
  Object? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    try {
      await ref.read(authRepositoryProvider).forgotPassword(_email.text.trim());
      if (mounted) setState(() => _done = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final err = _error;
    return AuthFormScaffold(
      title: l10n.authForgotTitle,
      children: [
        if (_done)
          FormSuccessBanner(message: l10n.authForgotDone)
        else ...[
          Text(l10n.authForgotIntro),
          const SizedBox(height: 16),
          Form(
            key: _formKey,
            child: EmailField(
              controller: _email,
              validator: AuthValidators(l10n).email,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
            ),
          ),
          if (err != null) ...[
            const SizedBox(height: 12),
            FormErrorBanner(message: FormErrorBanner.messageFor(l10n, err)),
          ],
          const SizedBox(height: 16),
          BusyButton(label: l10n.authForgotButton, busy: _busy, onPressed: _submit),
        ],
        const SizedBox(height: 8),
        OutlinedButton(onPressed: () => context.push(AppRoutes.resetPassword()), child: Text(l10n.authHaveResetCode)),
        TextButton(onPressed: () => context.go(AppRoutes.login()), child: Text(l10n.authBackToLogin)),
      ],
    );
  }
}
