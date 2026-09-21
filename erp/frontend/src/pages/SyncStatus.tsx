import { useEffect, useState } from 'react';
import { api, toApiError, type ApiError } from '../lib/api';
import { Alert, Badge, Button, ErrorState, LoadingState } from '../components/ui';
import { dateTime, relativeTime, statusOf } from '../lib/format';

interface Status {
  device_uid: string;
  last_sync_at: string | null;
  offline_authorized_until: string | null;
  is_active: boolean;
  pending: number;
  applied: number;
  rejected: number;
  conflicts: number;
}

interface Operation {
  id: number;
  operation_uuid: string;
  idempotency_key: string;
  op_type: string;
  status: string;
  server_doc_no: string | null;
  error_code: string | null;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
}

export default function SyncStatus() {
  const [deviceUid, setDeviceUid] = useState(() => localStorage.getItem('erp.device_uid') ?? '');
  const [status, setStatus] = useState<Status | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = async () => {
    if (!deviceUid.trim()) return;
    localStorage.setItem('erp.device_uid', deviceUid.trim());
    setLoading(true);
    setError(null);
    try {
      const [s, ops] = await Promise.all([
        api.get('/sync/status'),
        api.get('/sync/operations', { params: { per_page: 50 } }),
      ]);
      setStatus(s.data.data);
      setOperations(ops.data.data);
    } catch (e) {
      setError(toApiError(e));
      setStatus(null);
      setOperations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (deviceUid) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>حالة المزامنة</h1>
          <div className="desc">العمليات المعلقة والمرفوضة والمتعارضة مع سبب الخطأ وإمكانية إعادة المحاولة.</div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="filters">
          <div className="field">
            <label>معرّف الجهاز</label>
            <input value={deviceUid} onChange={(e) => setDeviceUid(e.target.value)} dir="ltr" placeholder="ANDROID-..." />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <Button onClick={() => void load()} disabledReason={deviceUid.trim() ? null : 'أدخل معرّف الجهاز.'}>عرض الحالة</Button>
          </div>
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}

      {status && (
        <>
          {!status.is_active && (
            <Alert tone="error">
              هذا الجهاز موقوف. الإيقاف يسري عند اتصاله بالشبكة أو عند انتهاء تفويض العمل دون اتصال —
              لا يوجد إلغاء فوري على جهاز منفصل عن الشبكة.
            </Alert>
          )}

          {status.conflicts > 0 && (
            <Alert tone="warn">
              يوجد <span className="num bold">{status.conflicts}</span> عملية متعارضة تحتاج مراجعة بشرية.
              العمليات الأصلية محفوظة ولم تُسقط.
            </Alert>
          )}

          <div className="grid cols-4 mb-4">
            <Stat label="معلّقة" value={status.pending} tone={status.pending ? 'warn' : ''} />
            <Stat label="مُطبَّقة" value={status.applied} tone="success" />
            <Stat label="مرفوضة" value={status.rejected} tone={status.rejected ? 'danger' : ''} />
            <Stat label="متعارضة" value={status.conflicts} tone={status.conflicts ? 'danger' : ''} />
          </div>

          <div className="card mb-4">
            <div className="card-body row" style={{ gap: 28 }}>
              <div><div className="small muted">آخر مزامنة</div><div className="bold">{relativeTime(status.last_sync_at)}</div></div>
              <div><div className="small muted">تفويض العمل دون اتصال حتى</div><div className="bold num">{dateTime(status.offline_authorized_until)}</div></div>
              <div><div className="small muted">حالة الجهاز</div>
                <div>{status.is_active ? <Badge tone="success">نشط</Badge> : <Badge tone="danger">موقوف</Badge>}</div></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>سجل العمليات</h2></div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>النوع</th><th>المفتاح</th><th>الحالة</th><th>المستند المركزي</th><th>الخطأ</th><th>الاستلام</th></tr>
                </thead>
                <tbody>
                  {operations.map((op) => {
                    const s = statusOf(op.status);
                    return (
                      <tr key={op.id}>
                        <td>{op.op_type}</td>
                        <td className="num tiny">{op.idempotency_key}</td>
                        <td><Badge tone={s.tone}>{s.label}</Badge></td>
                        <td className="num">{op.server_doc_no ?? '—'}</td>
                        <td className="small">
                          {op.error_code && <div className="neg bold tiny">{op.error_code}</div>}
                          {op.error_message}
                        </td>
                        <td className="num tiny">{dateTime(op.received_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {operations.length === 0 && <div className="state"><div className="title">لا توجد عمليات مزامنة</div></div>}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value num ${tone === 'danger' ? 'neg' : tone === 'success' ? 'pos' : ''}`}>{value}</div>
    </div>
  );
}
