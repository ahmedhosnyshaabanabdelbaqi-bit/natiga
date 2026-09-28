import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../garage/application/garage_providers.dart';
import '../data/reminders_repository.dart';
import '../domain/reminder.dart';

/// Which reminders the list shows.
enum RemindersFilter { open, completed }

/// The signed-in user's reminders; `open` is sorted soonest first by the
/// server. Guests get an empty list (the screen asks them to sign in).
final remindersProvider = FutureProvider.autoDispose.family<List<Reminder>, RemindersFilter>((ref, filter) async {
  final userId = ref.watch(personalUserIdProvider);
  if (userId == null) return const [];
  return ref.watch(remindersRepositoryProvider).list(status: filter.name);
});

final reminderProvider = FutureProvider.autoDispose.family<Reminder, String>((ref, id) {
  ref.watch(personalUserIdProvider);
  return ref.watch(remindersRepositoryProvider).get(id);
});
