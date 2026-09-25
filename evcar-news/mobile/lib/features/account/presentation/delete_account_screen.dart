import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/l10n/l10n.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../auth/presentation/auth_gate.dart';
import '../../auth/presentation/widgets/auth_widgets.dart';

/// `/account/delete` — permanent account + personal data deletion
/// (`DELETE /me {password}`), with an explicit acknowledgement.
class DeleteAccountScreen extends StatelessWidget {
  const DeleteAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.accountDeleteTitle)),
      body: AuthGate(returnTo: AppRoutes.deleteAccount, builder: (context, user) => const _DeleteForm()),
    );
  }
}

class _DeleteForm extends ConsumerStatefulWidget {
  const _DeleteForm();

  @override
  ConsumerState<_DeleteForm> createState() => _DeleteFormState();
}

class _DeleteFormState extends ConsumerState<_DeleteForm> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  bool _acknowledged = false;
  bool _busy = false;
  Object? _error;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false) || !_acknowledged) return;
    setState(() => _busy = true);
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    try {
      await ref.read(authControllerProvider.notifier).deleteAccount(_password.text);
      router.go(AppRoutes.account);
      messenger.showSnackBar(SnackBar(content: Text(l10n.accountDeleted)));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final err = _error;
    final apiErr = err is ApiException ? err : null;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.warning_amber_rounded, color: theme.colorScheme.onErrorContainer),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        l10n.accountDeleteWarning,
                        style: TextStyle(color: theme.colorScheme.onErrorContainer),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Form(
                key: _formKey,
                child: PasswordField(
                  controller: _password,
                  label: l10n.accountDeletePasswordLabel,
                  validator: AuthValidators(l10n).required,
                  errorText: apiErr?.fieldMessage('password'),
                ),
              ),
              const SizedBox(height: 8),
              CheckboxListTile(
                value: _acknowledged,
                onChanged: (v) => setState(() => _acknowledged = v ?? false),
                title: Text(l10n.accountDeleteAcknowledge),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
              ),
              if (err != null) ...[
                const SizedBox(height: 8),
                FormErrorBanner(message: FormErrorBanner.messageFor(l10n, err)),
              ],
              const SizedBox(height: 16),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: theme.colorScheme.error,
                  foregroundColor: theme.colorScheme.onError,
                ),
                onPressed: _busy || !_acknowledged ? null : _delete,
                icon: _busy
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.delete_forever_outlined),
                label: Text(l10n.accountDeleteButton),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
