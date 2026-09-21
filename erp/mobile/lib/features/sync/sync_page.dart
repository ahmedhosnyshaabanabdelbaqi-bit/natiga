import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../data/local_db.dart';
import '../../data/sync_client.dart';

/// شاشة المزامنة: عدد المعلق والمرفوض والمتعارض وسبب كل خطأ وإعادة المحاولة.
class SyncPage extends StatefulWidget {
  const SyncPage({super.key});

  @override
  State<SyncPage> createState() => _SyncPageState();
}

class _SyncPageState extends State<SyncPage> {
  final _client = SyncClient();

  bool _busy = false;
  String? _message;
  Map<String, int> _counts = const {};
  List<Map<String, dynamic>> _operations = const [];
  String? _lastSync;
  String? _authorisedUntil;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final db = await LocalDb.instance();
    final rows = await db.query('outbox', orderBy: 'device_seq DESC', limit: 60);
    final counts = await LocalDb.queueCounts();

    if (!mounted) return;
    setState(() {
      _operations = rows;
      _counts = counts;
    });

    final last = await LocalDb.state('last_sync_at');
    final until = await LocalDb.state('offline_authorized_until');
    if (mounted) setState(() {
      _lastSync = last;
      _authorisedUntil = until;
    });
  }

  Future<void> _sync() async {
    setState(() {
      _busy = true;
      _message = null;
    });

    final pullError = await _client.pull();
    final result = await _client.push();

    if (!mounted) return;

    setState(() {
      _busy = false;
      _message = result.error ??
          pullError ??
          'تمت المزامنة: ${result.applied} مُطبّقة'
              '${result.replayed > 0 ? '، ${result.replayed} مؤكدة مسبقًا (لم تتكرر)' : ''}'
              '${result.conflicts > 0 ? '، ${result.conflicts} متعارضة' : ''}'
              '${result.rejected > 0 ? '، ${result.rejected} مرفوضة' : ''}';
    });

    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              _StatChip(label: 'معلقة', value: _counts['pending'] ?? 0, color: AppTheme.warn),
              _StatChip(label: 'مُطبّقة', value: _counts['synced'] ?? 0, color: AppTheme.success),
              _StatChip(label: 'متعارضة', value: _counts['conflict'] ?? 0, color: AppTheme.danger),
              _StatChip(label: 'مرفوضة', value: _counts['rejected'] ?? 0, color: AppTheme.danger),
            ],
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('آخر مزامنة: ${_lastSync ?? 'لم تتم بعد'}'),
                  const SizedBox(height: 6),
                  Text('تفويض العمل دون اتصال حتى: ${_authorisedUntil?.isNotEmpty == true ? _authorisedUntil : 'غير ممنوح'}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _busy ? null : _sync,
            icon: _busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.sync),
            label: const Text('مزامنة الآن'),
          ),
          if (_message != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_message!),
            ),
          ],
          const SizedBox(height: 20),
          Text('سجل العمليات', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (_operations.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: Text('لا توجد عمليات بعد.')),
            ),
          ..._operations.map(_operationTile),
        ],
      ),
    );
  }

  Widget _operationTile(Map<String, dynamic> op) {
    final status = op['status'] as String;
    final (color, label) = switch (status) {
      'synced' => (AppTheme.success, 'مُطبّقة'),
      'conflict' => (AppTheme.danger, 'تعارض'),
      'rejected' => (AppTheme.danger, 'مرفوضة'),
      'failed' => (AppTheme.warn, 'فشل الإرسال'),
      _ => (AppTheme.warn, 'معلقة'),
    };

    final conflict = op['conflict_details'] as String?;

    return Card(
      child: ListTile(
        title: Text('${op['op_type']}  ·  ${op['server_doc_no'] ?? op['field_no'] ?? '—'}'),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('التسلسل ${op['device_seq']} · محاولات ${op['attempts']}'),
            if (op['error_message'] != null)
              Text(op['error_message'] as String, style: const TextStyle(color: AppTheme.danger)),
            if (conflict != null)
              Text(jsonDecode(conflict).toString(),
                  style: const TextStyle(fontSize: 11, color: Colors.black54)),
          ],
        ),
        trailing: Chip(
          label: Text(label, style: TextStyle(color: color, fontSize: 11)),
          backgroundColor: color.withValues(alpha: 0.1),
          side: BorderSide.none,
        ),
        isThreeLine: op['error_message'] != null,
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final int value;
  final Color color;

  const _StatChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Text('$value', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
            Text(label, style: const TextStyle(fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
