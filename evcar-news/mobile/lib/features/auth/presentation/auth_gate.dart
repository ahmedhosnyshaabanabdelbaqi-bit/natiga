import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/async_state_view.dart';
import '../../../shared/widgets/sign_in_required_view.dart';
import '../domain/app_user.dart';
import '../domain/auth_state.dart';
import 'auth_controller.dart';

/// Shows [builder] for signed-in users, an explanation + sign-in buttons for
/// guests (returning to [returnTo]), and a loading/retry state while the
/// session is being restored.
class AuthGate extends ConsumerWidget {
  const AuthGate({super.key, required this.returnTo, required this.builder, this.guestMessage});

  final String returnTo;
  final Widget Function(BuildContext context, AppUser user) builder;
  final String? guestMessage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return switch (auth) {
      AuthSignedIn(:final user) => builder(context, user),
      AuthGuest() => SignInRequiredView(returnTo: returnTo, message: guestMessage),
      AuthRestoring(:final error) =>
        error == null
            ? const StateMessageView(kind: StateKind.loading)
            : StateMessageView(
                kind: AsyncStateView.kindForError(error),
                onRetry: () => ref.read(authControllerProvider.notifier).restore(),
              ),
    };
  }
}
