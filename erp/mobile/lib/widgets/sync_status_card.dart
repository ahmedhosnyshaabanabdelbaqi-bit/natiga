import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/sync_service.dart';

/// Honest sync state.
///
/// Shows what is outstanding, what was refused and why, and how long the
/// offline authority has left. It does not claim "all synced" while anything
/// is queued, and it does not present a stale pull as fresh data.
class SyncStatusCard extends StatelessWidget {
  const SyncStatusCard({super.key, required this.summary, this.grant});

  final QueueSummary summary;
  final OfflineGrant? grant;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lastPull = summary.lastPullAt == null
        ? null
        : DateTime.tryParse(summary.lastPullAt!)?.toLocal();

    final staleHours =
        lastPull == null ? null : DateTime.now().difference(lastPull).inHours;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  summary.isClean ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined,
                  color: summary.isClean ? Colors.green.shade700 : Colors.orange.shade800,
                ),
                const SizedBox(width: 8),
                Text(
                  summary.isClean ? 'كل العمليات مُرسلة' : 'يوجد عمليات لم تُرسل',
                  style: theme.textTheme.titleMedium,
                ),
              ],
            ),

            const Divider(height: 20),

            _Row(label: 'بانتظار الإرسال', value: '${summary.pending}'),
            if (summary.rejected > 0)
              _Row(
                label: 'مرفوضة',
                value: '${summary.rejected}',
                emphasis: Colors.red.shade700,
              ),
            if (summary.conflicts > 0)
              _Row(
                label: 'تعارضات تحتاج مراجعة',
                value: '${summary.conflicts}',
                emphasis: Colors.red.shade700,
              ),

            _Row(
              label: 'آخر مزامنة',
              value: lastPull == null
                  ? 'لم تتم بعد'
                  : DateFormat('yyyy/MM/dd — HH:mm', 'ar').format(lastPull),
              emphasis: (staleHours ?? 0) > 24 ? Colors.orange.shade800 : null,
            ),

            if (grant != null)
              _Row(
                label: 'تفويض البيع دون اتصال',
                value: 'ينتهي ${DateFormat('MM/dd HH:mm', 'ar').format(grant!.validTo.toLocal())}',
              )
            else
              _Row(
                label: 'تفويض البيع دون اتصال',
                value: 'منتهٍ — طلب مبدئي فقط',
                emphasis: Colors.orange.shade800,
              ),

            if (!summary.isClean) ...[
              const SizedBox(height: 10),
              Text(
                'لا يمكن إقفال اليوم نهائيًا قبل اكتمال مزامنة كل العمليات، '
                'أو باستثناء موثق من المشرف.',
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.orange.shade900),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.emphasis});

  final String label;
  final String value;
  final Color? emphasis;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodyMedium),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: emphasis,
                ),
          ),
        ],
      ),
    );
  }
}
