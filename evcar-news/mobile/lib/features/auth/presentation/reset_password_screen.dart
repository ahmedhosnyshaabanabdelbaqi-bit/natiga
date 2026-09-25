import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/l10n/l10n.dart';
import '../data/auth_repository.dart';
import 'widgets/auth_widgets.dart';

/// `/auth/reset-password?token=` — sets a new password with the emailed
/// token (deep link) or a pasted code.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, this.token});

  final String? token;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _token = TextEditingController(text: widget.token ?? '');
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  bool _done = false;
  Object? _error;

  @override
  void dispose() {
    _token.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    try {
      await ref.read(authRepositoryProvider).resetPassword(token: _token.text.trim(), password: _password.text);
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
    if (_done) {
      return AuthFormScaffold(
        title: l10n.authResetTitle,
        children: [
          FormSuccessBanner(message: l10n.authResetDone),
          const SizedBox(height: 16),
          FilledButton(onPressed: () => context.go(AppRoutes.login()), child: Text(l10n.commonSignIn)),
        ],
      );
    }
    final v = AuthValidators(l10n);
    final err = _error;
    final apiErr = err is ApiException ? err : null;
    return AuthFormScaffold(
      title: l10n.authResetTitle,
      children: [
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _token,
                validator: v.required,
                autocorrect: false,
                enableSuggestions: false,
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(
                  labelText: l10n.authResetTokenLabel,
                  errorText: apiErr?.fieldMessage('token'),
                  prefixIcon: const Icon(Icons.key_outlined),
                ),
              ),
              const SizedBox(height: 12),
              PasswordField(
                controller: _password,
                label: l10n.authNewPasswordLabel,
                validator: v.password,
                errorText: apiErr?.fieldMessage('password'),
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
              ),
              const SizedBox(height: 12),
              PasswordField(
                controller: _confirm,
                label: l10n.authConfirmPasswordLabel,
                validator: v.confirm(_password),
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _submit(),
              ),
            ],
          ),
        ),
        if (err != null) ...[
          const SizedBox(height: 12),
          FormErrorBanner(message: FormErrorBanner.messageFor(l10n, err)),
        ],
        const SizedBox(height: 16),
        BusyButton(label: l10n.authResetButton, busy: _busy, onPressed: _submit),
        TextButton(onPressed: () => context.go(AppRoutes.login()), child: Text(l10n.authBackToLogin)),
      ],
    );
  }
}
