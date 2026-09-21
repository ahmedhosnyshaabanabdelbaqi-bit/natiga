import 'package:flutter/material.dart';

import '../services/sync_service.dart';
import '../widgets/sync_status_card.dart';

/// The rep's day, with the sync state always visible.
///
/// The queue count is shown on the home screen rather than buried in a
/// settings page, because a rep who cannot see that eight sales are still
/// unsent will close their day believing everything went through.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.sync});

  final SyncService sync;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  QueueSummary? _summary;
  OfflineGrant? _grant;
  bool _busy = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final summary = await widget.sync.queueSummary();
    final grant = await widget.sync.currentGrant();

    if (!mounted) return;
    setState(() {
      _summary = summary;
      _grant = grant;
    });
  }

  Future<void> _synchronise() async {
    setState(() {
      _busy = true;
      _message = null;
    });

    try {
      final result = await widget.sync.push();
      await widget.sync.pull();
      await _refresh();

      if (!mounted) return;
      setState(() {
        _message = result.needsAttention
            ? 'تمت المزامنة مع ${result.rejected + result.conflicts} عملية تحتاج مراجعة.'
            : 'تمت المزامنة: ${result.applied} عملية.';
      });
    } catch (error) {
      if (!mounted) return;
      // A failed sync is never silent: the rep must know the office has not
      // received their work yet.
      setState(() {
        _message = 'تعذرت المزامنة. العمليات محفوظة على الجهاز وسيعاد إرسالها.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = _summary;

    return Scaffold(
      appBar: AppBar(
        title: const Text('يومي'),
        actions: [
          IconButton(
            onPressed: _busy ? null : _synchronise,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            tooltip: 'مزامنة',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_message != null)
              Card(
                color: Theme.of(context).colorScheme.secondaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(_message!),
                ),
              ),

            if (summary != null) SyncStatusCard(summary: summary, grant: _grant),

            const SizedBox(height: 12),

            _ActionTile(
              icon: Icons.people_outline,
              title: 'عملائي وخطة الزيارات',
              subtitle: 'الزيارات المخططة لليوم',
              onTap: () {},
            ),
            _ActionTile(
              icon: Icons.receipt_long_outlined,
              title: 'بيع جديد',
              subtitle: 'من رصيد السيارة',
              onTap: () {},
            ),
            _ActionTile(
              icon: Icons.payments_outlined,
              title: 'تحصيل',
              subtitle: 'سند قبض ميداني',
              onTap: () {},
            ),
            _ActionTile(
              icon: Icons.assignment_return_outlined,
              title: 'مرتجع',
              subtitle: 'استلام مرتجع من عميل',
              onTap: () {},
            ),
            _ActionTile(
              icon: Icons.inventory_2_outlined,
              title: 'رصيد السيارة',
              subtitle: 'المتاح للبيع الآن',
              onTap: () {},
            ),
            _ActionTile(
              icon: Icons.event_available_outlined,
              title: 'إقفال اليوم',
              subtitle: summary != null && !summary.isClean
                  ? 'لا يمكن الإقفال قبل اكتمال المزامنة'
                  : 'جرد النقدية والبضاعة',
              enabled: summary?.isClean ?? false,
              onTap: () {},
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.enabled = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        enabled: enabled,
        leading: Icon(icon, size: 28),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_left),
        onTap: enabled ? onTap : null,
      ),
    );
  }
}
