import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { AgingRow, TrialBalanceResponse } from '../api/types';
import {
  Alert,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  type Column,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { amount, percent, qty, startOfMonth, today } from '../lib/format';

/* -------------------------------------------------------------- sales report */

interface SalesRow {
  key: string;
  label: string;
  qty: string;
  net_sales: string;
  tax: string;
  discount: string;
  documents: number;
  cogs?: string;
  gross_profit?: string;
  margin_pct?: string;
}

const DIMENSIONS: [string, string][] = [
  ['customer', 'العميل'],
  ['rep', 'المندوب'],
  ['item', 'الصنف'],
  ['brand', 'العلامة التجارية'],
  ['category', 'التصنيف'],
  ['region', 'المنطقة'],
  ['branch', 'الفرع'],
  ['day', 'اليوم'],
];

export function SalesReport() {
  const { can } = useAuth();
  const [dimension, setDimension] = useState('customer');
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const showProfit = can('reports.profit.view');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-sales', dimension, from, to],
    queryFn: async () =>
      (
        await api.get<{
          dimension: string;
          period: { from: string; to: string };
          rows: SalesRow[];
          totals: Record<string, string>;
        }>('/reports/sales', { params: { dimension, from, to } })
      ).data,
  });

  const columns: Column<SalesRow>[] = [
    { key: 'label', header: DIMENSIONS.find(([d]) => d === dimension)?.[1] ?? '', render: (row) => row.label },
    { key: 'documents', header: 'عدد المستندات', align: 'end', render: (row) => <span className="num">{row.documents}</span> },
    { key: 'qty', header: 'الكمية', align: 'end', render: (row) => <span className="num">{qty(row.qty)}</span> },
    { key: 'discount', header: 'الخصم', align: 'end', render: (row) => <span className="num">{amount(row.discount)}</span> },
    { key: 'net_sales', header: 'صافي المبيعات', align: 'end', render: (row) => <span className="num">{amount(row.net_sales)}</span> },
  ];

  if (showProfit) {
    columns.push(
      { key: 'cogs', header: 'التكلفة', align: 'end', render: (row) => <span className="num">{amount(row.cogs)}</span> },
      { key: 'gross_profit', header: 'مجمل الربح', align: 'end', render: (row) => <span className="num">{amount(row.gross_profit)}</span> },
      {
        key: 'margin_pct',
        header: 'هامش الربح',
        align: 'end',
        render: (row) => <span className="num">{percent(row.margin_pct)}</span>,
      },
    );
  }

  return (
    <>
      <PageHeader
        title="تحليل المبيعات"
        subtitle="المبيعات موزعة على البعد الذي تختاره"
        breadcrumb={['التقارير', 'المبيعات']}
        actions={
          <>
            <select
              className="select"
              style={{ width: 'auto' }}
              value={dimension}
              onChange={(event) => setDimension(event.target.value)}
              aria-label="بُعد التحليل"
            >
              {DIMENSIONS.map(([value, text]) => (
                <option key={value} value={value}>
                  حسب {text}
                </option>
              ))}
            </select>
            <input type="date" className="input" style={{ width: 'auto' }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" />
            <input type="date" className="input" style={{ width: 'auto' }} value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" />
          </>
        }
      />

      {showProfit && (
        <Alert tone="info">
          «مجمل الربح» هو صافي المبيعات ناقص تكلفة البضاعة المباعة فقط. لا يشمل المصروفات
          التشغيلية، وليس صافي الربح.
        </Alert>
      )}

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState title="لا توجد مبيعات في هذه الفترة" />
        ) : (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(row) => row.key}
            footer={
              /* Totals for the entire filtered result, not just what is shown. */
              <tr>
                <td>الإجمالي العام</td>
                <td />
                <td className="t-end num">{qty(data.totals.qty)}</td>
                <td className="t-end num">{amount(data.totals.discount)}</td>
                <td className="t-end num">{amount(data.totals.net_sales)}</td>
                {showProfit && (
                  <>
                    <td className="t-end num">{amount(data.totals.cogs)}</td>
                    <td className="t-end num">{amount(data.totals.gross_profit)}</td>
                    <td />
                  </>
                )}
              </tr>
            }
          />
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- aging */

export function AgingReport() {
  const [asOf, setAsOf] = useState(today());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-aging', asOf],
    queryFn: async () =>
      (await api.get<{ as_of: string; rows: AgingRow[] }>('/reports/aging', { params: { as_of: asOf } })).data,
  });

  const columns: Column<AgingRow>[] = [
    { key: 'code', header: 'الكود', render: (row) => <span className="num">{row.code}</span> },
    { key: 'name', header: 'العميل', render: (row) => row.name },
    { key: 'not_due', header: 'لم يستحق', align: 'end', render: (row) => <span className="num">{amount(row.not_due)}</span> },
    { key: 'd1_30', header: '1–30 يوم', align: 'end', render: (row) => <span className="num">{amount(row.d1_30)}</span> },
    { key: 'd31_60', header: '31–60 يوم', align: 'end', render: (row) => <span className="num" style={{ color: 'var(--warn)' }}>{amount(row.d31_60)}</span> },
    { key: 'd61_90', header: '61–90 يوم', align: 'end', render: (row) => <span className="num" style={{ color: 'var(--warn)' }}>{amount(row.d61_90)}</span> },
    { key: 'd90_plus', header: 'أكثر من 90', align: 'end', render: (row) => <span className="num" style={{ color: 'var(--danger)', fontWeight: 600 }}>{amount(row.d90_plus)}</span> },
    { key: 'total', header: 'الإجمالي', align: 'end', render: (row) => <span className="num" style={{ fontWeight: 600 }}>{amount(row.total)}</span> },
  ];

  const totals = (data?.rows ?? []).reduce(
    (acc, row) => ({
      not_due: acc.not_due + Number(row.not_due),
      d1_30: acc.d1_30 + Number(row.d1_30),
      d31_60: acc.d31_60 + Number(row.d31_60),
      d61_90: acc.d61_90 + Number(row.d61_90),
      d90_plus: acc.d90_plus + Number(row.d90_plus),
      total: acc.total + Number(row.total),
    }),
    { not_due: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 },
  );

  return (
    <>
      <PageHeader
        title="أعمار الديون"
        subtitle="المديونيات موزعة حسب تاريخ الاستحقاق، لا تاريخ الفاتورة"
        breadcrumb={['التقارير', 'أعمار الديون']}
        actions={
          <input
            type="date"
            className="input"
            style={{ width: 'auto' }}
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            aria-label="كما في تاريخ"
          />
        }
      />

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState title="لا توجد مديونيات قائمة" />
        ) : (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(row) => row.customer_id}
            footer={
              <tr>
                <td colSpan={2}>الإجمالي ({data.rows.length} عميل)</td>
                <td className="t-end num">{amount(totals.not_due)}</td>
                <td className="t-end num">{amount(totals.d1_30)}</td>
                <td className="t-end num">{amount(totals.d31_60)}</td>
                <td className="t-end num">{amount(totals.d61_90)}</td>
                <td className="t-end num">{amount(totals.d90_plus)}</td>
                <td className="t-end num">{amount(totals.total)}</td>
              </tr>
            }
          />
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- trial balance */

export function TrialBalance() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['trial-balance', from, to],
    queryFn: async () =>
      (await api.get<TrialBalanceResponse>('/reports/trial-balance', { params: { from, to } })).data,
  });

  return (
    <>
      <PageHeader
        title="ميزان المراجعة"
        subtitle="أرصدة الحسابات القابلة للترحيل خلال الفترة"
        breadcrumb={['التقارير', 'ميزان المراجعة']}
        actions={
          <>
            <input type="date" className="input" style={{ width: 'auto' }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" />
            <input type="date" className="input" style={{ width: 'auto' }} value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" />
          </>
        }
      />

      {data && !data.is_balanced && (
        <Alert tone="danger">
          الميزان غير متوازن. هذا يعني أن شيئًا كتب في دفتر اليومية خارج محرك الترحيل — راجع
          القيود قبل الاعتماد على أي تقرير مالي.
        </Alert>
      )}

      {data && data.is_balanced && (
        <Alert tone="ok">
          الميزان متوازن: إجمالي المدين يساوي إجمالي الدائن.
        </Alert>
      )}

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState title="لا توجد حركة في هذه الفترة" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>اسم الحساب</th>
                  <th className="t-end">مدين</th>
                  <th className="t-end">دائن</th>
                  <th className="t-end">رصيد مدين</th>
                  <th className="t-end">رصيد دائن</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.code}>
                    <td className="num">{row.code}</td>
                    <td>{row.name}</td>
                    <td className="t-end num">{amount(row.debit)}</td>
                    <td className="t-end num">{amount(row.credit)}</td>
                    <td className="t-end num">{amount(row.balance_debit)}</td>
                    <td className="t-end num">{amount(row.balance_credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>الإجمالي</td>
                  <td className="t-end num">{amount(data.totals.debit)}</td>
                  <td className="t-end num">{amount(data.totals.credit)}</td>
                  <td className="t-end num">{amount(data.totals.balance_debit)}</td>
                  <td className="t-end num">{amount(data.totals.balance_credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------- rep performance */

interface RepRow {
  id: number;
  name: string;
  net_sales: string;
  cogs: string;
  gross_profit: string;
  collections: string;
  returns: string;
  visits_done: number;
  visits_productive: number;
  visits_planned: number;
  visit_achievement: string;
  productive_rate: string;
  target: string | null;
  target_achievement: string | null;
}

export function RepPerformance() {
  const { can } = useAuth();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const showProfit = can('reports.profit.view');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['rep-performance', from, to],
    queryFn: async () =>
      (
        await api.get<{ rows: RepRow[]; totals: Record<string, string> }>(
          '/reports/rep-performance',
          { params: { from, to } },
        )
      ).data,
  });

  const columns: Column<RepRow>[] = [
    { key: 'name', header: 'المندوب', render: (row) => row.name },
    { key: 'net_sales', header: 'صافي المبيعات', align: 'end', render: (row) => <span className="num">{amount(row.net_sales)}</span> },
    { key: 'returns', header: 'المرتجعات', align: 'end', render: (row) => <span className="num">{amount(row.returns)}</span> },
    /* Sales and collections are separate facts and are never merged. */
    { key: 'collections', header: 'التحصيلات', align: 'end', render: (row) => <span className="num">{amount(row.collections)}</span> },
    {
      key: 'visits',
      header: 'الزيارات (منفذ / مخطط)',
      align: 'center',
      render: (row) => (
        <span className="num">
          {row.visits_done} / {row.visits_planned}
        </span>
      ),
    },
    {
      key: 'productive_rate',
      header: 'نسبة الزيارات المنتجة',
      align: 'end',
      render: (row) => <span className="num">{percent(row.productive_rate)}</span>,
    },
    {
      key: 'target_achievement',
      header: 'تحقيق المستهدف',
      align: 'end',
      render: (row) =>
        row.target_achievement === null ? (
          <span style={{ color: 'var(--text-faint)' }}>لا يوجد مستهدف</span>
        ) : (
          <span
            className="num"
            style={{
              fontWeight: 600,
              color: Number(row.target_achievement) >= 100 ? 'var(--accent)' : 'var(--warn)',
            }}
          >
            {percent(row.target_achievement)}
          </span>
        ),
    },
  ];

  if (showProfit) {
    columns.splice(3, 0, {
      key: 'gross_profit',
      header: 'مجمل الربح',
      align: 'end',
      render: (row) => <span className="num">{amount(row.gross_profit)}</span>,
    });
  }

  return (
    <>
      <PageHeader
        title="أداء المناديب"
        subtitle="المخطط مقابل المنفذ، والمبيعات مقابل التحصيلات"
        breadcrumb={['التقارير', 'أداء المناديب']}
        actions={
          <>
            <input type="date" className="input" style={{ width: 'auto' }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" />
            <input type="date" className="input" style={{ width: 'auto' }} value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" />
          </>
        }
      />

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState title="لا يوجد مناديب لهم عملاء مسندون" />
        ) : (
          <DataTable columns={columns} rows={data.rows} rowKey={(row) => row.id} />
        )}
      </div>
    </>
  );
}
