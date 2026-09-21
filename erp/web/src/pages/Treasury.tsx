import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import type { Paginated } from '../api/types';
import {
  Alert,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  type Column,
} from '../components/ui';
import { useTableState } from '../hooks/useTableState';
import { amount, date, money, startOfMonth, today } from '../lib/format';

interface ReceiptRow {
  id: number;
  code: string;
  field_no: string | null;
  receipt_date: string;
  customer: string | null;
  rep: string | null;
  method: string;
  destination: string;
  amount: string;
  allocated_amount: string;
  unallocated: string;
  status: string;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  cheque: 'شيك',
  bank: 'تحويل بنكي',
  card: 'بطاقة',
};

const DESTINATION_LABELS: Record<string, string> = {
  custody: 'عهدة المندوب',
  cash_box: 'خزنة الشركة',
  bank: 'البنك',
};

export function Receipts() {
  const table = useTableState('receipts', { filters: { from: startOfMonth(), to: today() } });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['receipts', table.params],
    queryFn: async () =>
      (await api.get<Paginated<ReceiptRow>>('/treasury/receipts', { params: table.params })).data,
  });

  const columns: Column<ReceiptRow>[] = [
    {
      key: 'code',
      header: 'رقم السند',
      render: (row) => (
        <div>
          <div className="num">{row.code}</div>
          {row.field_no && (
            <div className="num" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              ميداني: {row.field_no}
            </div>
          )}
        </div>
      ),
    },
    { key: 'receipt_date', header: 'التاريخ', render: (row) => date(row.receipt_date) },
    { key: 'customer', header: 'العميل', render: (row) => row.customer ?? '—' },
    { key: 'rep', header: 'المحصّل', render: (row) => row.rep ?? '—' },
    {
      key: 'method',
      header: 'طريقة الدفع',
      render: (row) => (
        <span className={`badge badge-${row.method === 'cash' ? 'ok' : 'brand'}`}>
          {METHOD_LABELS[row.method] ?? row.method}
        </span>
      ),
    },
    {
      key: 'destination',
      header: 'الوجهة',
      render: (row) => DESTINATION_LABELS[row.destination] ?? row.destination,
    },
    { key: 'amount', header: 'القيمة', align: 'end', render: (row) => <span className="num">{amount(row.amount)}</span> },
    {
      key: 'unallocated',
      header: 'غير موزع',
      align: 'end',
      render: (row) => (
        <span className="num" style={Number(row.unallocated) > 0 ? { color: 'var(--warn)' } : {}}>
          {amount(row.unallocated)}
        </span>
      ),
    },
    { key: 'status', header: 'الحالة', render: (row) => <StatusBadge vocabulary="status" value={row.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="سندات القبض"
        subtitle="التحصيلات ووجهتها"
        breadcrumb={['الخزينة', 'سندات القبض']}
      />

      <Alert tone="info">
        التحصيل الميداني يدخل عهدة المحصّل أولًا، ولا يصل خزنة الشركة إلا بمحضر توريد معتمد.
        التوريد ينقل أصلًا بين حسابين ولا ينشئ إيرادًا جديدًا.
      </Alert>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <input
              type="date"
              className="input"
              value={table.state.filters.from ?? ''}
              onChange={(event) => table.setFilter('from', event.target.value)}
              aria-label="من تاريخ"
            />
            <input
              type="date"
              className="input"
              value={table.state.filters.to ?? ''}
              onChange={(event) => table.setFilter('to', event.target.value)}
              aria-label="إلى تاريخ"
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="لا توجد سندات في هذه الفترة" />
        ) : (
          <>
            <DataTable columns={columns} rows={data.data} rowKey={(row) => row.id} />
            <Pagination
              page={data.meta.current_page}
              lastPage={data.meta.last_page}
              total={data.meta.total}
              from={data.meta.from}
              to={data.meta.to}
              perPage={data.meta.per_page}
              onPage={table.setPage}
              onPerPage={table.setPerPage}
            />
          </>
        )}
      </div>
    </>
  );
}

export function Custody() {
  /*
   * With no user_id the API returns the caller's own custody. Reading another
   * user's balance needs treasury.custody.view.all and is refused server-side,
   * so the picker is only meaningful for a supervisor.
   */
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['custody', 'self'],
    queryFn: async () =>
      (
        await api.get<{ user_id: number; cash: string; cheques: string; as_of: string }>(
          '/treasury/custody',
        )
      ).data,
  });

  return (
    <>
      <PageHeader
        title="العهد"
        subtitle="النقدية والشيكات التي في حوزة المحصّلين"
        breadcrumb={['الخزينة', 'العهد']}
      />

      <Alert tone="info">
        عهدة البضاعة منفصلة تمامًا عن عهدة النقدية. الشيك في حوزة المندوب ليس نقدية — يظهر في عمود
        مستقل ولا يُضاف إلى النقدية المتوقعة عند إقفال اليوم.
      </Alert>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : data ? (
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">العهدة النقدية</div>
            <div className="kpi-value num">{money(data.cash)}</div>
            <div className="kpi-footer">نقدية مستلمة ولم تُورَّد بعد</div>
          </div>

          <div className="kpi">
            <div className="kpi-label">شيكات في العهدة</div>
            <div className="kpi-value num">{money(data.cheques)}</div>
            <div className="kpi-footer">ليست نقدية مؤكدة حتى تُحصَّل</div>
          </div>
        </div>
      ) : (
        <EmptyState />
      )}
    </>
  );
}
