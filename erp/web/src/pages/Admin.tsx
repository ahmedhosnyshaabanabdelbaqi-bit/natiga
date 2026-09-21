import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { PostingMatrixResponse } from '../api/types';
import {
  Alert,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  type Column,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { amount, dateTime, relativeTime } from '../lib/format';

/* ------------------------------------------------------------ posting matrix */

/**
 * The posting matrix an accountant signs off before go-live.
 *
 * This is not documentation: the engine refuses to post any document whose
 * account hook is unmapped, so an incomplete matrix blocks trading rather than
 * quietly guessing an account.
 */
export function PostingMatrix() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['posting-matrix'],
    queryFn: async () => (await api.get<PostingMatrixResponse>('/admin/posting-matrix')).data,
  });

  const save = useMutation({
    mutationFn: async () =>
      api.put('/admin/posting-matrix', {
        mappings: Object.entries(draft).map(([key, account_id]) => ({ key, account_id })),
      }),
    onSuccess: () => {
      setSaved(true);
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ['posting-matrix'] });
    },
  });

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  const columns: Column<PostingMatrixResponse['rows'][number]>[] = [
    { key: 'label', header: 'الغرض', render: (row) => row.label },
    { key: 'key', header: 'المفتاح', render: (row) => <code className="num">{row.key}</code> },
    {
      key: 'account',
      header: 'الحساب المرتبط',
      render: (row) =>
        row.account ? (
          <span>
            <span className="num">{row.account.code}</span> — {row.account.name}
          </span>
        ) : (
          <span className="badge badge-danger">غير مربوط</span>
        ),
    },
    {
      key: 'state',
      header: 'الحالة',
      align: 'center',
      render: (row) =>
        row.is_mapped ? (
          <span className="badge badge-ok">جاهز</span>
        ) : (
          <span className="badge badge-danger">يمنع الترحيل</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="مصفوفة الترحيل المحاسبي"
        subtitle="ربط كل عملية بحسابها في دليل الحسابات"
        breadcrumb={['الإعدادات', 'مصفوفة الترحيل']}
      />

      {saved && <Alert tone="ok">تم حفظ الربط.</Alert>}
      {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}

      {data && !data.is_ready && (
        <Alert tone="danger">
          يوجد {data.missing.length} حساب غير مربوط. النظام سيرفض ترحيل أي مستند يحتاج أحدها، ولن
          يخمّن حسابًا بديلًا.
        </Alert>
      )}

      {data?.is_ready && (
        <Alert tone="ok">
          جميع الحسابات مربوطة. راجع الربط مع المحاسب المسؤول واعتمده قبل بدء التشغيل الفعلي.
        </Alert>
      )}

      {data && <Alert tone="info">{data.note}</Alert>}

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data ? (
          <EmptyState />
        ) : (
          <DataTable columns={columns} rows={data.rows} rowKey={(row) => row.key} />
        )}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- approvals */

interface ApprovalRow {
  id: number;
  doc_type: string;
  doc_id: number;
  level: number;
  reason_code: string | null;
  amount: string;
  note: string | null;
  requested_by: string | null;
  status: string;
  created_at: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  sales_order: 'أمر بيع',
  sales_invoice: 'فاتورة مبيعات',
  expense: 'مصروف',
  stock_adjustment: 'تسوية مخزون',
  cash_transfer: 'توريد نقدية',
};

const REASON_LABELS: Record<string, string> = {
  'credit.limit_exceeded': 'تجاوز الحد الائتماني',
  'credit.customer_on_hold': 'عميل موقوف ائتمانيًا',
  expense_threshold: 'تجاوز حد المصروف',
  discount_override: 'خصم استثنائي',
};

export function Approvals() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [note, setNote] = useState<Record<number, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['approvals'],
    queryFn: async () =>
      (await api.get<{ data: ApprovalRow[] }>('/admin/approvals')).data.data,
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: 'approved' | 'rejected' }) =>
      api.post(`/admin/approvals/${id}/decide`, { decision, note: note[id] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] }),
  });

  const columns: Column<ApprovalRow>[] = [
    {
      key: 'doc',
      header: 'المستند',
      render: (row) => (
        <div>
          <div>{DOC_TYPE_LABELS[row.doc_type] ?? row.doc_type}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }} className="num">
            #{row.doc_id}
          </div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'سبب الطلب',
      render: (row) => (
        <div>
          <div>{REASON_LABELS[row.reason_code ?? ''] ?? row.reason_code ?? '—'}</div>
          {row.note && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{row.note}</div>
          )}
        </div>
      ),
    },
    { key: 'amount', header: 'القيمة', align: 'end', render: (row) => <span className="num">{amount(row.amount)}</span> },
    { key: 'requested_by', header: 'مقدم الطلب', render: (row) => row.requested_by ?? '—' },
    { key: 'created_at', header: 'منذ', render: (row) => relativeTime(row.created_at) },
    {
      key: 'actions',
      header: 'القرار',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            className="input"
            style={{ width: 150 }}
            placeholder="ملاحظة"
            value={note[row.id] ?? ''}
            onChange={(event) => setNote((n) => ({ ...n, [row.id]: event.target.value }))}
            aria-label="ملاحظة القرار"
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={decide.isPending || !can('approvals.decide')}
            onClick={() => decide.mutate({ id: row.id, decision: 'approved' })}
          >
            اعتماد
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={decide.isPending || !can('approvals.decide')}
            onClick={() => decide.mutate({ id: row.id, decision: 'rejected' })}
          >
            رفض
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="الموافقات المعلقة"
        subtitle="القرارات التي توقف عندها التشغيل بانتظار مسؤول مختص"
        breadcrumb={['الإعدادات', 'الموافقات']}
      />

      {decide.error && <Alert tone="danger">{errorMessage(decide.error)}</Alert>}

      <Alert tone="info">
        لا يجوز اعتماد طلب تقدمت به بنفسك؛ النظام يرفض ذلك على السيرفر.
      </Alert>

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="لا توجد طلبات معلقة" hint="كل شيء تم البت فيه." />
        ) : (
          <DataTable columns={columns} rows={data} rowKey={(row) => row.id} />
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ sync conflicts */

interface ConflictRow {
  id: number;
  operation_id: string;
  kind: string;
  details: Record<string, unknown>;
  status: string;
  created_at: string;
}

const CONFLICT_LABELS: Record<string, string> = {
  'stock.insufficient': 'رصيد غير كافٍ وقت المزامنة',
  'credit.limit_exceeded': 'تجاوز الحد الائتماني',
  'credit.customer_on_hold': 'عميل موقوف ائتمانيًا',
  receipt_allocation_mismatch: 'تعذر توزيع التحصيل على الفواتير',
  'sales.return_exceeds_sold': 'مرتجع يتجاوز الكمية المباعة',
};

/**
 * Conflicts a human must decide.
 *
 * Nothing here was resolved by "last write wins". The original field operation
 * is preserved in full so the decision is made with the facts, not a guess.
 */
export function SyncConflicts() {
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sync-conflicts'],
    queryFn: async () =>
      (await api.get<{ data: ConflictRow[] }>('/sync/conflicts')).data.data,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, resolution }: { id: number; resolution: string }) =>
      api.post(`/sync/conflicts/${id}/resolve`, { resolution }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-conflicts'] }),
  });

  const columns: Column<ConflictRow>[] = [
    {
      key: 'kind',
      header: 'نوع التعارض',
      render: (row) => (
        <div>
          <div>{CONFLICT_LABELS[row.kind] ?? row.kind}</div>
          <div className="num" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {row.operation_id.slice(0, 8)}
          </div>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'التفاصيل',
      render: (row) => (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>عرض العملية الأصلية</summary>
          <pre
            dir="ltr"
            style={{
              fontSize: 11,
              background: 'var(--surface-2)',
              padding: 8,
              borderRadius: 6,
              maxWidth: 420,
              overflow: 'auto',
              marginTop: 6,
            }}
          >
            {JSON.stringify(row.details, null, 2)}
          </pre>
        </details>
      ),
    },
    { key: 'created_at', header: 'منذ', render: (row) => relativeTime(row.created_at) },
    { key: 'status', header: 'الحالة', render: (row) => <StatusBadge vocabulary="sync_status" value={row.status} /> },
    {
      key: 'actions',
      header: 'القرار',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {(['accepted', 'adjusted', 'rejected'] as const).map((resolution) => (
            <button
              key={resolution}
              type="button"
              className="btn btn-sm"
              disabled={resolve.isPending || !can('sync.conflict.resolve')}
              onClick={() => resolve.mutate({ id: row.id, resolution })}
            >
              {resolution === 'accepted' ? 'قبول' : resolution === 'adjusted' ? 'تسوية' : 'رفض'}
            </button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="تعارضات المزامنة"
        subtitle="عمليات ميدانية اصطدمت بحالة السيرفر وتحتاج قرارًا بشريًا"
        breadcrumb={['العمل الميداني', 'تعارضات المزامنة']}
      />

      <Alert tone="info">
        لم يُحسم أي من هذه التعارضات تلقائيًا. الأموال وأرصدة المخزون لا تُحسم بقاعدة «آخر تعديل
        يفوز»، والعملية الميدانية الأصلية محفوظة كما أرسلها الجهاز.
      </Alert>

      {resolve.error && <Alert tone="danger">{errorMessage(resolve.error)}</Alert>}

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="لا توجد تعارضات مفتوحة" hint="كل العمليات الميدانية تمت مزامنتها." />
        ) : (
          <DataTable columns={columns} rows={data} rowKey={(row) => row.id} />
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ rep positions */

interface PositionRow {
  rep_id: number;
  name: string;
  lat: string;
  lng: string;
  accuracy_m: string | null;
  recorded_at: string;
  age_minutes: number;
  is_recent: boolean;
}

/**
 * Last known positions.
 *
 * Presented with the age and accuracy of each fix and an explicit disclaimer,
 * because a stale reading is evidence of a weak signal, not of a rep's conduct.
 */
export function RepPositions() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['rep-positions'],
    queryFn: async () =>
      (
        await api.get<{ positions: PositionRow[]; disclaimer: string }>('/field/rep-positions')
      ).data,
    refetchInterval: 60_000,
  });

  const columns: Column<PositionRow>[] = [
    { key: 'name', header: 'المندوب', render: (row) => row.name },
    {
      key: 'recorded_at',
      header: 'آخر تحديث',
      render: (row) => (
        <div>
          <div>{relativeTime(row.recorded_at)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
            {dateTime(row.recorded_at)}
          </div>
        </div>
      ),
    },
    {
      key: 'accuracy_m',
      header: 'دقة القراءة',
      align: 'end',
      render: (row) =>
        row.accuracy_m ? <span className="num">±{Math.round(Number(row.accuracy_m))} م</span> : '—',
    },
    {
      key: 'freshness',
      header: 'حداثة القراءة',
      render: (row) =>
        row.is_recent ? (
          <span className="badge badge-ok">حديثة</span>
        ) : (
          <span className="badge badge-warn">قديمة ({row.age_minutes} دقيقة)</span>
        ),
    },
    {
      key: 'location',
      header: 'الموقع',
      render: (row) => (
        <a
          href={`https://www.openstreetmap.org/?mlat=${row.lat}&mlon=${row.lng}#map=16/${row.lat}/${row.lng}`}
          target="_blank"
          rel="noreferrer"
          className="num"
        >
          {Number(row.lat).toFixed(4)}, {Number(row.lng).toFixed(4)}
        </a>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="مواقع المناديب"
        subtitle="آخر موقع معروف لكل مندوب"
        breadcrumb={['العمل الميداني', 'المواقع']}
      />

      {data && <Alert tone="warn">{data.disclaimer}</Alert>}

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.positions.length === 0 ? (
          <EmptyState
            title="لا توجد قراءات مواقع"
            hint="لا يتم تسجيل الموقع إلا أثناء وردية نشطة وبإذن صريح من المندوب."
          />
        ) : (
          <DataTable columns={columns} rows={data.positions} rowKey={(row) => row.rep_id} />
        )}
      </div>
    </>
  );
}
