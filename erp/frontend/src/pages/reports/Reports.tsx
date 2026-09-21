import { useEffect, useState, type ReactNode } from 'react';
import { api, toApiError, type ApiError } from '../../lib/api';
import { money, moneyPlain, qty, pct, startOfMonth, today } from '../../lib/format';
import { Alert, Badge, Button, ErrorState, LoadingState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';

/** إطار موحّد لكل تقرير: فلاتر + تصدير + طباعة + حالات واضحة. */
function ReportShell({
  title, description, filters, children, onExport, loading, error, onRetry, generatedAt,
}: {
  title: string;
  description?: string;
  filters?: ReactNode;
  children: ReactNode;
  onExport?: () => void;
  loading?: boolean;
  error?: ApiError | null;
  onRetry?: () => void;
  generatedAt?: string | null;
}) {
  const { t } = useI18n();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {description && <div className="desc">{description}</div>}
        </div>
        <div className="actions no-print">
          {onExport && <Button onClick={onExport}>{t('common.export')}</Button>}
          <Button onClick={() => window.print()}>{t('common.print')}</Button>
        </div>
      </div>

      {filters && <div className="card mb-4"><div className="filters">{filters}</div></div>}

      {error ? <ErrorState error={error} onRetry={onRetry} />
        : loading ? <LoadingState />
          : children}

      {generatedAt && <div className="tiny faint mt-3">{t('common.generatedAt')}: {generatedAt}</div>}
    </div>
  );
}

/** تصدير CSV مع BOM حتى تُقرأ العربية في Excel بشكل صحيح. */
function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function usePeriod() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  return { from, to, setFrom, setTo };
}

function PeriodFilters({ from, to, setFrom, setTo, extra }: ReturnType<typeof usePeriod> & { extra?: ReactNode }) {
  const { t } = useI18n();

  return (
    <>
      <div className="field">
        <label>{t('common.from')}</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('common.to')}</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {extra}
    </>
  );
}

function useReport<T>(endpoint: string, params: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const key = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void api.get(endpoint, { params })
      .then(({ data: body }) => { if (!cancelled) setData(body.data); })
      .catch((e) => { if (!cancelled) setError(toApiError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, key]);

  return { data, loading, error, reload: () => setLoading(true) };
}

/* ======================= تقرير المبيعات ======================= */

export function SalesReport() {
  const period = usePeriod();
  const [groupBy, setGroupBy] = useState('day');
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, loading, error } = useReport<any>('/reports/sales', { from: period.from, to: period.to, group_by: groupBy });

  return (
    <ReportShell
      title={t('reports.sales.title')}
      description={t('reports.sales.desc')}
      loading={loading}
      error={error}
      generatedAt={data?.generated_at}
      onExport={data ? () => exportCsv(
        `sales-${period.from}-${period.to}.csv`,
        [t('reports.sales.item'), t('common.qty'), t('reports.sales.netSales'), t('reports.sales.discounts'), t('common.tax'), t('reports.sales.invoiceCount')],
        data.rows.map((r: any) => [r.label, r.qty, r.net_sales, r.discounts, r.tax, r.invoices]),
      ) : undefined}
      filters={
        <PeriodFilters
          {...period}
          extra={
            <div className="field">
              <label>{t('reports.sales.groupBy')}</label>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <option value="day">{t('reports.sales.byDay')}</option>
                <option value="customer">{t('reports.sales.byCustomer')}</option>
                <option value="salesman">{t('reports.sales.bySalesman')}</option>
                <option value="item">{t('reports.sales.byItem')}</option>
                <option value="brand">{t('reports.sales.byBrand')}</option>
                <option value="branch">{t('reports.sales.byBranch')}</option>
              </select>
            </div>
          }
        />
      }
    >
      {data && (
        <>
          <div className="grid auto mb-4">
            <Summary label={t('reports.sales.netSales')} value={money(data.summary_all_results.net_sales)} />
            <Summary label={t('reports.sales.returns')} value={money(data.summary_all_results.returns_amount)} />
            <Summary label={t('reports.sales.invoiceCount')} value={String(data.summary_all_results.invoices_count)} />
            {user?.can_see_cost && <Summary label={t('reports.sales.costOfSales')} value={money(data.summary_all_results.cost_of_sales)} />}
            {data.summary_all_results.gross_profit && (
              <>
                <Summary label={t('reports.sales.grossProfit')} value={money(data.summary_all_results.gross_profit)} />
                <Summary label={t('reports.sales.grossMargin')} value={pct(data.summary_all_results.gross_margin_pct)} />
              </>
            )}
          </div>

          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('reports.sales.item')}</th>
                    <th className="n">{t('common.qty')}</th>
                    <th className="n">{t('reports.sales.netSales')}</th>
                    <th className="n">{t('reports.sales.discounts')}</th>
                    <th className="n">{t('common.tax')}</th>
                    <th className="n">{t('reports.sales.invoices')}</th>
                    {user?.can_see_cost && <><th className="n">{t('common.cost')}</th><th className="n">{t('reports.sales.grossProfit')}</th></>}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{r.label}</td>
                      <td className="n num">{qty(r.qty)}</td>
                      <td className="n num bold">{moneyPlain(r.net_sales)}</td>
                      <td className="n num">{moneyPlain(r.discounts)}</td>
                      <td className="n num">{moneyPlain(r.tax)}</td>
                      <td className="n num">{r.invoices}</td>
                      {user?.can_see_cost && (
                        <>
                          <td className="n num">{moneyPlain(r.cost)}</td>
                          <td className="n num pos">{moneyPlain(r.gross_profit)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.rows.length === 0 && <div className="state"><div className="title">{t('reports.sales.empty')}</div></div>}
          </div>
        </>
      )}
    </ReportShell>
  );
}

/* ======================= تقييم المخزون ======================= */

export function InventoryValuationReport() {
  const { t } = useI18n();
  const { data, loading, error } = useReport<any>('/reports/inventory-valuation', {});

  return (
    <ReportShell
      title={t('reports.inv.title')}
      description={t('reports.inv.desc')}
      loading={loading}
      error={error}
      generatedAt={data?.generated_at}
      onExport={data ? () => exportCsv(
        'inventory-valuation.csv',
        [t('common.code'), t('common.item'), t('common.qty'), t('items.avgCost'), t('stock.value')],
        data.rows.map((r: any) => [r.code, r.name_ar, r.qty_on_hand, r.avg_cost, r.total_value]),
      ) : undefined}
    >
      {data && (
        <>
          {data.reconciled ? (
            <Alert tone="success">{t('reports.inv.reconciled', { value: moneyPlain(data.total_value) })}</Alert>
          ) : (
            <Alert tone="error">
              {t('reports.inv.mismatch', {
                value: moneyPlain(data.total_value),
                gl: moneyPlain(data.gl_inventory_balance),
              })}
            </Alert>
          )}

          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>{t('common.code')}</th><th>{t('common.item')}</th><th className="n">{t('common.qty')}</th><th className="n">{t('items.avgCost')}</th><th className="n">{t('stock.value')}</th></tr>
                </thead>
                <tbody>
                  {data.rows.map((r: any) => (
                    <tr key={r.item_id}>
                      <td className="num">{r.code}</td>
                      <td>{r.name_ar}</td>
                      <td className="n num">{qty(r.qty_on_hand)}</td>
                      <td className="n num">{moneyPlain(r.avg_cost)}</td>
                      <td className="n num bold">{moneyPlain(r.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4}>{t('common.total')}</td><td className="n num">{money(data.total_value)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}

/* ======================= أعمار الديون ======================= */

export function AgingReport() {
  const { t } = useI18n();
  const [asOf, setAsOf] = useState(today());
  const { data, loading, error } = useReport<any>('/reports/aging', { as_of: asOf });

  return (
    <ReportShell
      title={t('reports.aging.title')}
      description={t('reports.aging.desc')}
      loading={loading}
      error={error}
      onExport={data ? () => exportCsv(
        `aging-${asOf}.csv`,
        [t('common.customer'), t('reports.aging.current'), '1-30', '31-60', '61-90', '+90', t('common.total')],
        data.rows.map((r: any) => [r.customer_name, r.current, r.days_1_30, r.days_31_60, r.days_61_90, r.days_90_plus, r.total]),
      ) : undefined}
      filters={
        <div className="field">
          <label>{t('reports.aging.asOf')}</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
      }
    >
      {data && (
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('common.customer')}</th><th className="n">{t('reports.aging.current')}</th><th className="n">1–30</th>
                  <th className="n">31–60</th><th className="n">61–90</th><th className="n">+90</th><th className="n">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.customer_id}>
                    <td>{r.customer_name ?? `#${r.customer_id}`}</td>
                    <td className="n num">{moneyPlain(r.current)}</td>
                    <td className="n num">{moneyPlain(r.days_1_30)}</td>
                    <td className="n num">{moneyPlain(r.days_31_60)}</td>
                    <td className="n num">{moneyPlain(r.days_61_90)}</td>
                    <td className="n num neg">{moneyPlain(r.days_90_plus)}</td>
                    <td className="n num bold">{moneyPlain(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('common.allResultsTotals')}</td>
                  <td className="n num">{moneyPlain(data.totals_all_results.current)}</td>
                  <td className="n num">{moneyPlain(data.totals_all_results.days_1_30)}</td>
                  <td className="n num">{moneyPlain(data.totals_all_results.days_31_60)}</td>
                  <td className="n num">{moneyPlain(data.totals_all_results.days_61_90)}</td>
                  <td className="n num">{moneyPlain(data.totals_all_results.days_90_plus)}</td>
                  <td className="n num">{moneyPlain(data.totals_all_results.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {data.rows.length === 0 && <div className="state"><div className="title">{t('reports.aging.empty')}</div></div>}
        </div>
      )}
    </ReportShell>
  );
}

/* ======================= ميزان المراجعة ======================= */

export function TrialBalanceReport() {
  const { t } = useI18n();
  const period = usePeriod();
  const { data, loading, error } = useReport<any>('/reports/trial-balance', { from: period.from, to: period.to });

  return (
    <ReportShell
      title={t('reports.tb.title')}
      loading={loading}
      error={error}
      filters={<PeriodFilters {...period} />}
      onExport={data ? () => exportCsv(
        `trial-balance-${period.from}.csv`,
        [t('common.code'), t('reports.tb.account'), t('customer.debit'), t('customer.credit'), t('customer.balance')],
        data.rows.map((r: any) => [r.code, r.name_ar, r.total_debit, r.total_credit, r.balance]),
      ) : undefined}
    >
      {data && (
        <>
          {data.totals.balanced
            ? <Alert tone="success">{t('reports.tb.balanced')}</Alert>
            : <Alert tone="error">{t('reports.tb.unbalanced')}</Alert>}

          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{t('common.code')}</th><th>{t('reports.tb.account')}</th><th className="n">{t('customer.debit')}</th><th className="n">{t('customer.credit')}</th><th className="n">{t('customer.balance')}</th></tr></thead>
                <tbody>
                  {data.rows.map((r: any) => (
                    <tr key={r.account_id}>
                      <td className="num">{r.code}</td>
                      <td>{r.name_ar}</td>
                      <td className="n num">{moneyPlain(r.total_debit)}</td>
                      <td className="n num">{moneyPlain(r.total_credit)}</td>
                      <td className="n num bold">{moneyPlain(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>{t('common.total')}</td>
                    <td className="n num">{moneyPlain(data.totals.debit)}</td>
                    <td className="n num">{moneyPlain(data.totals.credit)}</td>
                    <td className="n num">{data.totals.balanced ? '0.00' : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}

/* ======================= قائمة الدخل ======================= */

export function IncomeStatementReport() {
  const { t } = useI18n();
  const period = usePeriod();
  const { data, loading, error } = useReport<any>('/reports/income-statement', { from: period.from, to: period.to });

  return (
    <ReportShell title={t('reports.income.title')} loading={loading} error={error} filters={<PeriodFilters {...period} />}>
      {data && (
        <>
          <Alert tone="warn">{data.caveat}</Alert>

          <div className="grid auto mb-4">
            <Summary label={t('reports.income.revenue')} value={money(data.summary.revenue)} />
            <Summary label={t('reports.income.salesReturns')} value={money(data.summary.sales_returns)} />
            <Summary label={t('reports.income.netRevenue')} value={money(data.summary.net_revenue)} />
            <Summary label={t('reports.sales.costOfSales')} value={money(data.summary.cost_of_sales)} />
            <Summary label={t('reports.sales.grossProfit')} value={money(data.summary.gross_profit)} />
            <Summary label={t('reports.income.opex')} value={money(data.summary.operating_expenses)} />
            <Summary label={t('reports.income.netProfit')} value={money(data.summary.net_profit)} />
          </div>

          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{t('common.code')}</th><th>{t('reports.tb.account')}</th><th>{t('reports.income.type')}</th><th className="n">{t('reports.income.value')}</th></tr></thead>
                <tbody>
                  {data.lines.map((r: any, i: number) => (
                    <tr key={i}>
                      <td className="num">{r.code}</td>
                      <td>{r.name_ar}</td>
                      <td>{r.type === 'revenue' ? <Badge tone="success">{t('reports.income.typeRevenue')}</Badge> : <Badge tone="warn">{t('reports.income.typeExpense')}</Badge>}</td>
                      <td className="n num">{moneyPlain(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}

/* ======================= أداء المناديب ======================= */

export function SalesmenReport() {
  const { t } = useI18n();
  const period = usePeriod();
  const { user } = useAuth();
  const { data, loading, error } = useReport<any>('/reports/salesmen', { from: period.from, to: period.to });

  return (
    <ReportShell
      title={t('reports.salesmen.title')}
      description={t('reports.salesmen.desc')}
      loading={loading}
      error={error}
      filters={<PeriodFilters {...period} />}
      onExport={data ? () => exportCsv(
        `salesmen-${period.from}.csv`,
        [t('common.code'), t('common.salesman'), t('reports.salesmen.planned'), t('reports.salesmen.executed'), t('reports.salesmen.productive'), t('reports.sales.netSales'), t('reports.salesmen.collections'), t('reports.salesmen.receivables')],
        data.rows.map((r: any) => [r.code, r.name, r.planned_visits, r.executed_visits, r.productive_visits_pct, r.net_sales, r.collections, r.receivables]),
      ) : undefined}
    >
      {data && (
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('common.salesman')}</th>
                  <th className="n">{t('reports.salesmen.planned')}</th><th className="n">{t('reports.salesmen.executed')}</th>
                  <th className="n">{t('reports.salesmen.productive')}</th>
                  <th className="n">{t('reports.sales.netSales')}</th><th className="n">{t('reports.salesmen.collections')}</th>
                  <th className="n">{t('reports.salesmen.receivables')}</th>
                  <th className="n">{t('reports.salesmen.newCustomers')}</th><th className="n">{t('reports.salesmen.inactive')}</th>
                  {user?.can_see_cost && <th className="n">{t('common.cost')}</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.salesman_id}>
                    <td className="bold">{r.name}</td>
                    <td className="n num">{r.planned_visits}</td>
                    <td className="n num">{r.executed_visits}</td>
                    <td className="n num">{pct(r.productive_visits_pct)}</td>
                    <td className="n num bold">{moneyPlain(r.net_sales)}</td>
                    <td className="n num">{moneyPlain(r.collections)}</td>
                    <td className="n num neg">{moneyPlain(r.receivables)}</td>
                    <td className="n num">{r.new_customers}</td>
                    <td className="n num">{r.inactive_customers}</td>
                    {user?.can_see_cost && <td className="n num">{moneyPlain(r.cost_of_sales)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length === 0 && <div className="state"><div className="title">{t('reports.salesmen.empty')}</div></div>}
        </div>
      )}
    </ReportShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value num" style={{ fontSize: 19 }}>{value}</div>
    </div>
  );
}
