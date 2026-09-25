import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/l10n/l10n.dart';
import '../data/auth_repository.dart';
import 'widgets/auth_widgets.dart';

/// `/auth/register?from=<path>` — creates an account, then asks the user to
/// verify the email (the API returns the user, not a session).
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, this.from});

  final String? from;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  Object? _error;
  String? _registeredEmail;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    try {
      final user = await ref
          .read(authRepositoryProvider)
          .register(
            email: _email.text.trim(),
            password: _password.text,
            displayName: _name.text.trim(),
            locale: ref.read(effectiveLanguageProvider),
          );
      if (mounted) setState(() => _registeredEmail = user.email);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final registered = _registeredEmail;
    if (registered != null) {
      return AuthFormScaffold(
        title: l10n.authRegisterTitle,
        children: [
          FormSuccessBanner(title: l10n.authRegisterSuccessTitle, message: l10n.authRegisterSuccessMessage(registered)),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => context.pushReplacement(AppRoutes.login(from: widget.from)),
            child: Text(l10n.commonSignIn),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => context.push(AppRoutes.verifyEmail(email: registered)),
            child: Text(l10n.authVerifyTitle),
          ),
        ],
      );
    }

    final v = AuthValidators(l10n);
    final err = _error;
    final apiErr = err is ApiException ? err : null;
    return AuthFormScaffold(
      title: l10n.authRegisterTitle,
      children: [
        Text(l10n.authGuestNote, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 20),
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _name,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                validator: v.displayName,
                decoration: InputDecoration(
                  labelText: l10n.authDisplayNameLabel,
                  errorText: apiErr?.fieldMessage('displayName'),
                  prefixIcon: const Icon(Icons.person_outline),
                ),
              ),
              const SizedBox(height: 12),
              EmailField(controller: _email, validator: v.email, errorText: apiErr?.fieldMessage('email')),
              const SizedBox(height: 12),
              PasswordField(
                controller: _password,
                label: l10n.authPasswordLabel,
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
        BusyButton(label: l10n.authRegisterButton, busy: _busy, onPressed: _submit),
        const Divider(height: 32),
        Text(l10n.authHaveAccount, textAlign: TextAlign.center),
        TextButton(
          onPressed: () => context.pushReplacement(AppRoutes.login(from: widget.from)),
          child: Text(l10n.commonSignIn),
        ),
      ],
    );
  }
}
