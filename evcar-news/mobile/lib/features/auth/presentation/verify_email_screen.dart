import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/l10n/l10n.dart';
import '../data/auth_repository.dart';
import 'auth_controller.dart';
import 'widgets/auth_widgets.dart';

/// `/auth/verify-email?token=&email=` — verifies automatically when opened
/// from the emailed link (deep link), otherwise accepts a pasted code.
/// Also lets the user request a new link.
class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({super.key, this.token, this.email});

  final String? token;
  final String? email;

  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  final _tokenForm = GlobalKey<FormState>();
  final _resendForm = GlobalKey<FormState>();
  late final TextEditingController _token = TextEditingController(text: widget.token ?? '');
  late final TextEditingController _email = TextEditingController(
    text: widget.email ?? ref.read(authControllerProvider).user?.email ?? '',
  );
  bool _verifying = false;
  bool _verified = false;
  bool _resending = false;
  bool _resent = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    if ((widget.token ?? '').isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _verify());
    }
  }

  @override
  void dispose() {
    _token.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    setState(() => _error = null);
    if (!(_tokenForm.currentState?.validate() ?? false)) return;
    setState(() => _verifying = true);
    try {
      await ref.read(authRepositoryProvider).verifyEmail(_token.text.trim());
      if (!mounted) return;
      setState(() => _verified = true);
      // Refresh the signed-in profile (emailVerified) if there is a session.
      try {
        await ref.read(authControllerProvider.notifier).refreshUser();
      } on ApiException {
        // Not critical: the flag refreshes on next start.
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _error = null);
    if (!(_resendForm.currentState?.validate() ?? false)) return;
    setState(() => _resending = true);
    try {
      await ref.read(authRepositoryProvider).resendVerification(_email.text.trim());
      if (mounted) setState(() => _resent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final v = AuthValidators(l10n);
    final signedIn = ref.watch(authControllerProvider).isSignedIn;

    if (_verified) {
      return AuthFormScaffold(
        title: l10n.authVerifyTitle,
        children: [
          FormSuccessBanner(message: l10n.authVerifySuccess),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => context.go(signedIn ? AppRoutes.account : AppRoutes.login()),
            child: Text(signedIn ? l10n.accountTitle : l10n.commonSignIn),
          ),
        ],
      );
    }

    final err = _error;
    return AuthFormScaffold(
      title: l10n.authVerifyTitle,
      children: [
        Text(l10n.authVerifyIntro),
        const SizedBox(height: 16),
        Form(
          key: _tokenForm,
          child: TextFormField(
            controller: _token,
            validator: v.required,
            autocorrect: false,
            enableSuggestions: false,
            textDirection: TextDirection.ltr,
            decoration: InputDecoration(
              labelText: l10n.authVerifyTokenLabel,
              prefixIcon: const Icon(Icons.key_outlined),
            ),
            onFieldSubmitted: (_) => _verify(),
          ),
        ),
        const SizedBox(height: 12),
        BusyButton(label: l10n.authVerifyButton, busy: _verifying, onPressed: _verify),
        if (err != null) ...[
          const SizedBox(height: 12),
          FormErrorBanner(message: FormErrorBanner.messageFor(l10n, err)),
        ],
        const Divider(height: 40),
        Form(
          key: _resendForm,
          child: EmailField(controller: _email, validator: v.email, textInputAction: TextInputAction.done),
        ),
        const SizedBox(height: 12),
        OutlinedButton(onPressed: _resending ? null : _resend, child: Text(l10n.authResendVerification)),
        if (_resent) ...[const SizedBox(height: 12), FormSuccessBanner(message: l10n.authResendVerificationDone)],
      ],
    );
  }
}
