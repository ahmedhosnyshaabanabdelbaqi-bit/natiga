import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, errorMessage } from '../api/client';
import type { Dashboard as DashboardData } from '../api/types';
import { EmptyState, ErrorState, KpiTile, LoadingState, PageHeader } from '../components/ui';
import { amount, dateTime, formatKpi, startOfMonth, today } from '../lib/format';

interface TrendPoint {
  date: string;
  net_sales: string;
  cogs: string;
  invoices: number;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', from, to],
    queryFn: async () =>
      (await api.get<DashboardData>('/dashboard', { params: { from, to } })).data,
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  if (!data) return <EmptyState />;

  const trend = (data.lists.sales_trend ?? []) as TrendPoint[];

  return (
    <>
      <PageHeader
        title="لوحة التحكم"
        subtitle={`آخر تحديث: ${dateTime(data.generated_at)}`}
        actions={
          <>
            <input
              type="date"
              className="input"
              style={{ width: 'auto' }}
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="من تاريخ"
            />
            <input
              type="date"
              className="input"
              style={{ width: 'auto' }}
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              aria-label="إلى تاريخ"
            />
          </>
        }
      />

      <div className="kpi-grid">
        {data.cards.map((card) => (
          <KpiTile
            key={card.key}
            label={card.label}
            value={formatKpi(card.value, card.format)}
            definition={card.definition}
            footer={`${data.period.from} ← ${data.period.to}`}
            onOpen={card.drilldown ? () => navigate(card.drilldown!) : undefined}
          />
        ))}
      </div>

      {trend.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <h2 className="card-title">صافي المبيعات وتكلفتها يوميًا</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              القيم بالجنيه، بدون الضريبة
            </span>
          </div>
          <div className="card-body" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--text-faint)"
                  width={70}
                  tickFormatter={(value: number) => amount(value)}
                />
                <Tooltip
                  formatter={(value, name) => [
                    amount(value as string | number),
                    name === 'net_sales' ? 'صافي المبيعات' : 'تكلفة المبيعات',
                  ]}
                  contentStyle={{ fontSize: 12, fontFamily: 'var(--font)' }}
                />
                <Line
                  type="monotone"
                  dataKey="net_sales"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  dot={false}
                  name="net_sales"
                />
                <Line
                  type="monotone"
                  dataKey="cogs"
                  stroke="var(--warn)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  name="cogs"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid-2">
        <DashboardList
          title="الموافقات المعلقة"
          rows={(data.lists.pending_approvals ?? []) as Record<string, unknown>[]}
          emptyHint="لا توجد طلبات بانتظار البت."
          columns={[
            ['doc_type', 'المستند'],
            ['reason_code', 'السبب'],
            ['amount', 'القيمة'],
          ]}
          onOpen={() => navigate('/admin/approvals')}
        />

        <DashboardList
          title="أعلى العملاء"
          rows={(data.lists.top_customers ?? []) as Record<string, unknown>[]}
          emptyHint="لا توجد مبيعات في الفترة المحددة."
          columns={[
            ['name', 'العميل'],
            ['net_sales', 'صافي المبيعات'],
            ['invoices', 'عدد الفواتير'],
          ]}
          onOpen={() => navigate('/reports/sales')}
        />

        <DashboardList
          title="أصناف تحت حد الطلب"
          rows={(data.lists.below_reorder ?? []) as Record<string, unknown>[]}
          emptyHint="لا توجد نواقص حاليًا."
          columns={[
            ['name', 'الصنف'],
            ['available', 'المتاح'],
            ['reorder_point', 'حد الطلب'],
          ]}
          onOpen={() => navigate('/purchasing/reorder')}
        />

        <DashboardList
          title="فواتيري المتأخرة"
          rows={(data.lists.my_overdue ?? []) as Record<string, unknown>[]}
          emptyHint="لا توجد فواتير متأخرة."
          columns={[
            ['customer', 'العميل'],
            ['outstanding', 'المتبقي'],
            ['days_overdue', 'أيام التأخير'],
          ]}
          onOpen={() => navigate('/sales/invoices?overdue=1')}
        />
      </div>
    </>
  );
}

function DashboardList({
  title,
  rows,
  columns,
  emptyHint,
  onOpen,
}: {
  title: string;
  rows: Record<string, unknown>[];
  columns: [string, string][];
  emptyHint: string;
  onOpen?: () => void;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
        {onOpen && (
          <button type="button" className="btn btn-sm" onClick={onOpen}>
            عرض الكل
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState hint={emptyHint} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {columns.map(([key, header]) => (
                  <th key={key}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row, index) => (
                <tr key={index}>
                  {columns.map(([key]) => {
                    const value = row[key];
                    const numeric = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value);
                    return (
                      <td key={key} className={numeric ? 't-end' : ''}>
                        <span className={numeric ? 'num' : ''}>
                          {numeric ? amount(value as string) : String(value ?? '—')}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
