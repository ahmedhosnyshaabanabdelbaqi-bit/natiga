import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/app_routes.dart';
import '../../core/l10n/l10n.dart';

/// Shown by personal features (garage, charging log, reminders, …) to guests.
///
/// Browsing stays open to everyone (REQUIREMENTS §1/§14); this only explains
/// why *this* feature needs an account and offers sign-in/registration that
/// return to [returnTo] afterwards.
class SignInRequiredView extends StatelessWidget {
  const SignInRequiredView({super.key, required this.returnTo, this.message});

  /// Location to come back to after signing in (e.g. `/garage`).
  final String returnTo;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.account_circle_outlined, size: 56, color: theme.colorScheme.primary),
              const SizedBox(height: 16),
              Semantics(
                header: true,
                child: Text(
                  l10n.commonSignInRequiredTitle,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                message ?? l10n.commonSignInRequiredMessage,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton(
                    onPressed: () => context.push(AppRoutes.login(from: returnTo)),
                    child: Text(l10n.commonSignIn),
                  ),
                  OutlinedButton(
                    onPressed: () => context.push(AppRoutes.register(from: returnTo)),
                    child: Text(l10n.commonCreateAccount),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
