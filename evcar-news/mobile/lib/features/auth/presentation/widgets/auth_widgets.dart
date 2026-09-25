import 'package:flutter/material.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/errors/app_errors.dart';
import '../../../../core/l10n/l10n.dart';

/// Client-side checks only to give fast feedback; the server's 422 field
/// errors remain authoritative and are shown under the same fields.
class AuthValidators {
  AuthValidators(this.l10n);

  final AppLocalizations l10n;

  static const minPasswordLength = 8;
  static const maxPasswordLength = 128;
  static const maxDisplayNameLength = 100;

  static final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  String? required(String? v) => (v == null || v.trim().isEmpty) ? l10n.authRequired : null;

  String? email(String? v) {
    if (v == null || v.trim().isEmpty) return l10n.authRequired;
    return _email.hasMatch(v.trim()) ? null : l10n.authEmailInvalid;
  }

  String? password(String? v) {
    if (v == null || v.isEmpty) return l10n.authRequired;
    if (v.length < minPasswordLength) return l10n.authPasswordTooShort(minPasswordLength);
    if (v.length > maxPasswordLength) return l10n.authPasswordTooLong(maxPasswordLength);
    return null;
  }

  String? Function(String?) confirm(TextEditingController original) =>
      (v) => (v ?? '') == original.text ? null : l10n.authPasswordsDoNotMatch;

  String? displayName(String? v) {
    if (v == null || v.trim().isEmpty) return l10n.authRequired;
    if (v.trim().length > maxDisplayNameLength) return l10n.authDisplayNameTooLong(maxDisplayNameLength);
    return null;
  }
}

/// Centered, width-limited, scrollable form page.
class AuthFormScaffold extends StatelessWidget {
  const AuthFormScaffold({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: AutofillGroup(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Password input with an accessible show/hide toggle.
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.controller,
    required this.label,
    this.validator,
    this.errorText,
    this.textInputAction = TextInputAction.done,
    this.onSubmitted,
    this.autofillHints = const [AutofillHints.password],
  });

  final TextEditingController controller;
  final String label;
  final FormFieldValidator<String>? validator;
  final String? errorText;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String> autofillHints;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return TextFormField(
      controller: widget.controller,
      obscureText: _obscure,
      enableSuggestions: false,
      autocorrect: false,
      autofillHints: widget.autofillHints,
      textInputAction: widget.textInputAction,
      onFieldSubmitted: widget.onSubmitted,
      validator: widget.validator,
      // Keep the password LTR even in the Arabic UI.
      textDirection: TextDirection.ltr,
      decoration: InputDecoration(
        labelText: widget.label,
        errorText: widget.errorText,
        errorMaxLines: 3,
        prefixIcon: const Icon(Icons.lock_outline),
        suffixIcon: IconButton(
          tooltip: _obscure ? l10n.commonShowPassword : l10n.commonHidePassword,
          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
          onPressed: () => setState(() => _obscure = !_obscure),
        ),
      ),
    );
  }
}

/// Email input (LTR, email keyboard, autofill).
class EmailField extends StatelessWidget {
  const EmailField({
    super.key,
    required this.controller,
    required this.validator,
    this.errorText,
    this.textInputAction = TextInputAction.next,
    this.onSubmitted,
    this.enabled = true,
  });

  final TextEditingController controller;
  final FormFieldValidator<String> validator;
  final String? errorText;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      enabled: enabled,
      keyboardType: TextInputType.emailAddress,
      autofillHints: const [AutofillHints.email, AutofillHints.username],
      autocorrect: false,
      textDirection: TextDirection.ltr,
      textInputAction: textInputAction,
      onFieldSubmitted: onSubmitted,
      validator: validator,
      decoration: InputDecoration(
        labelText: context.l10n.authEmailLabel,
        errorText: errorText,
        errorMaxLines: 3,
        prefixIcon: const Icon(Icons.alternate_email),
      ),
    );
  }
}

/// Error box for form-level errors (icon + text, announced to screen readers).
class FormErrorBanner extends StatelessWidget {
  const FormErrorBanner({super.key, required this.message});

  final String message;

  /// Message for [error]: the server's localized text when available.
  static String messageFor(AppLocalizations l10n, Object error) {
    if (error is ApiException && error.kind == ApiErrorKind.validation && error.message != null) {
      return error.message!;
    }
    return errorMessage(l10n, error);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: scheme.errorContainer, borderRadius: BorderRadius.circular(12)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline, color: scheme.onErrorContainer),
            const SizedBox(width: 8),
            Expanded(
              child: Text(message, style: TextStyle(color: scheme.onErrorContainer)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Success box (icon + text).
class FormSuccessBanner extends StatelessWidget {
  const FormSuccessBanner({super.key, required this.message, this.title});

  final String message;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(12)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.check_circle_outline, color: scheme.onPrimaryContainer),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (title != null)
                    Text(title!, style: theme.textTheme.titleSmall?.copyWith(color: scheme.onPrimaryContainer)),
                  Text(message, style: TextStyle(color: scheme.onPrimaryContainer)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Filled button that shows a spinner while [busy] (and is disabled).
class BusyButton extends StatelessWidget {
  const BusyButton({super.key, required this.label, required this.busy, required this.onPressed});

  final String label;
  final bool busy;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      child: busy
          ? Semantics(
              label: context.l10n.commonLoading,
              child: const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
            )
          : Text(label),
    );
  }
}
