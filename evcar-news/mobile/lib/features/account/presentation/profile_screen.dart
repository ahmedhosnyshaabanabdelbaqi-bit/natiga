import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/l10n/l10n.dart';
import '../../auth/domain/app_user.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../auth/presentation/auth_gate.dart';
import '../../auth/presentation/widgets/auth_widgets.dart';

/// `/account/profile` — display name and preferred language for emails and
/// notifications (`PATCH /me`).
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.accountProfileTitle)),
      body: AuthGate(
        returnTo: AppRoutes.profile,
        builder: (context, user) => _ProfileForm(key: ValueKey(user.id), user: user),
      ),
    );
  }
}

class _ProfileForm extends ConsumerStatefulWidget {
  const _ProfileForm({super.key, required this.user});

  final AppUser user;

  @override
  ConsumerState<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends ConsumerState<_ProfileForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: widget.user.displayName);
  late String _locale = widget.user.locale == 'en' ? 'en' : 'ar';
  bool _busy = false;
  Object? _error;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(authControllerProvider.notifier).updateProfile(displayName: _name.text.trim(), locale: _locale);
      messenger.showSnackBar(SnackBar(content: Text(l10n.accountProfileSaved)));
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
    final apiErr = err is ApiException ? err : null;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  initialValue: widget.user.email,
                  enabled: false,
                  textDirection: TextDirection.ltr,
                  decoration: InputDecoration(
                    labelText: l10n.authEmailLabel,
                    prefixIcon: const Icon(Icons.alternate_email),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _name,
                  validator: AuthValidators(l10n).displayName,
                  autofillHints: const [AutofillHints.name],
                  decoration: InputDecoration(
                    labelText: l10n.authDisplayNameLabel,
                    errorText: apiErr?.fieldMessage('displayName'),
                    prefixIcon: const Icon(Icons.person_outline),
                  ),
                ),
                const SizedBox(height: 16),
                Text(l10n.accountPreferredLanguageLabel, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: [
                    ButtonSegment(value: 'ar', label: Text(l10n.settingsLanguageArabic)),
                    ButtonSegment(value: 'en', label: Text(l10n.settingsLanguageEnglish)),
                  ],
                  selected: {_locale},
                  onSelectionChanged: (s) => setState(() => _locale = s.first),
                ),
                if (err != null) ...[
                  const SizedBox(height: 12),
                  FormErrorBanner(message: FormErrorBanner.messageFor(l10n, err)),
                ],
                const SizedBox(height: 20),
                BusyButton(label: l10n.commonSave, busy: _busy, onPressed: _save),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
