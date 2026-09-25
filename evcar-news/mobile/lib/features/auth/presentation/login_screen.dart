import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/l10n/l10n.dart';
import 'auth_controller.dart';
import 'widgets/auth_widgets.dart';

/// Server code for a correct password on an unverified account (backend auth).
const emailNotVerifiedCode = 'EMAIL_NOT_VERIFIED';

/// `/auth/login?from=<path>` — email + password sign-in.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.from});

  /// Where to go after signing in (validated with [AppRoutes.safeReturnPath]).
  final String? from;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  Object? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    try {
      await ref.read(authControllerProvider.notifier).login(email: _email.text, password: _password.text);
      if (!mounted) return;
      TextInput.finishAutofillContext();
      context.go(AppRoutes.safeReturnPath(widget.from) ?? AppRoutes.account);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final v = AuthValidators(l10n);
    final err = _error;
    final apiErr = err is ApiException ? err : null;
    return AuthFormScaffold(
      title: l10n.authLoginTitle,
      children: [
        Text(l10n.authGuestNote, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 20),
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              EmailField(controller: _email, validator: v.email, errorText: apiErr?.fieldMessage('email')),
              const SizedBox(height: 12),
              PasswordField(
                controller: _password,
                label: l10n.authPasswordLabel,
                validator: v.required,
                errorText: apiErr?.fieldMessage('password'),
                onSubmitted: (_) => _submit(),
              ),
            ],
          ),
        ),
        if (err != null) ...[
          const SizedBox(height: 12),
          FormErrorBanner(message: FormErrorBanner.messageFor(l10n, err)),
          // 403 EMAIL_NOT_VERIFIED comes only after a correct password: offer
          // the way forward (paste the emailed code or request a new link).
          if (apiErr?.code == emailNotVerifiedCode)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                icon: const Icon(Icons.mark_email_read_outlined),
                label: Text(l10n.authVerifyEmailAction),
                onPressed: () => context.push(AppRoutes.verifyEmail(email: _email.text.trim())),
              ),
            ),
        ],
        const SizedBox(height: 16),
        BusyButton(label: l10n.authLoginButton, busy: _busy, onPressed: _submit),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton(
            onPressed: () => context.push(AppRoutes.forgotPassword),
            child: Text(l10n.authForgotPasswordLink),
          ),
        ),
        const Divider(height: 32),
        Text(l10n.authNoAccount, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () => context.pushReplacement(AppRoutes.register(from: widget.from)),
          child: Text(l10n.commonCreateAccount),
        ),
        TextButton(
          onPressed: () => context.canPop() ? context.pop() : context.go(AppRoutes.home),
          child: Text(l10n.authContinueAsGuest),
        ),
      ],
    );
  }
}
