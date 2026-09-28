import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/domain/auth_state.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/garage_repository.dart';
import '../domain/user_vehicle.dart';

/// Id of the signed-in user (null for guests / while restoring). Personal
/// providers watch it so they reload on sign-in and drop data on sign-out.
final personalUserIdProvider = Provider<String?>((ref) {
  return ref.watch(authControllerProvider.select((s) => s is AuthSignedIn ? s.user.id : null));
});

/// The signed-in user's cars (primary first). Empty for guests.
final garageVehiclesProvider = FutureProvider.autoDispose<List<UserVehicle>>((ref) async {
  final userId = ref.watch(personalUserIdProvider);
  if (userId == null) return const [];
  return ref.watch(garageRepositoryProvider).list();
});

final garageVehicleProvider = FutureProvider.autoDispose.family<UserVehicle, String>((ref, id) async {
  ref.watch(personalUserIdProvider);
  return ref.watch(garageRepositoryProvider).get(id);
});

/// Max cars per user (server rule, 409 GARAGE_LIMIT_REACHED).
const garageMaxVehicles = 20;
