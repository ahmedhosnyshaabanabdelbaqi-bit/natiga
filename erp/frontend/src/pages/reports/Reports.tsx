import { useEffect, useState, type ReactNode } from 'react';
import { api, toApiError, type ApiError } from '../../lib/api';
import { money, moneyPlain, qty, pct, startOfMonth, today } from '../../lib/format';
import { Alert, Badge, Button, ErrorState, LoadingState } from '../../components/ui';
import { useAuth } from '../../lib/auth';

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
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {description && <div className="desc">{description}</div>}
        </div>
        <div className="actions no-print">
          {onExport && <Button onClick={onExport}>تصدير CSV</Button>}
          <Button onClick={() => window.print()}>طباعة</Button>
        </div>
      </div>

      {filters && <div className="card mb-4"><div className="filters">{filters}</div></div>}

      {error ? <ErrorState error={error} onRetry={onRetry} />
        : loading ? <LoadingState />
          : children}

      {generatedAt && <div className="tiny faint mt-3">وقت توليد التقرير: {generatedAt}</div>}
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
  return (
    <>
      <div className="field">
        <label>من تاريخ</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="field">
        <label>إلى تاريخ</label>
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
  const { data, loading, error } = useReport<any>('/reports/sales', { from: period.from, to: period.to, group_by: groupBy });

  return (
    <ReportShell
      title="تقرير المبيعات"
      description="صافي المبيعات = الإجمالي − الخصومات − المرتجعات. لا يشمل الضريبة ولا مصاريف التوصيل."
      loading={loading}
      error={error}
      generatedAt={data?.generated_at}
      onExport={data ? () => exportCsv(
        `sales-${period.from}-${period.to}.csv`,
        ['البند', 'الكمية', 'صافي المبيعات', 'الخصومات', 'الضريبة', 'عدد الفواتير'],
        data.rows.map((r: any) => [r.label, r.qty, r.net_sales, r.discounts, r.tax, r.invoices]),
      ) : undefined}
      filters={
        <PeriodFilters
          {...period}
          extra={
            <div className="field">
              <label>التجميع حسب</label>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <option value="day">اليوم</option>
                <option value="customer">العميل</option>
                <option value="salesman">المندوب</option>
                <option value="item">الصنف</option>
                <option value="brand">العلامة التجارية</option>
                <option value="branch">الفرع</option>
              </select>
            </div>
          }
        />
      }
    >
      {data && (
        <>
          <div className="grid auto mb-4">
            <Summary label="صافي المبيعات" value={money(data.summary_all_results.net_sales)} />
            <Summary label="المرتجعات" value={money(data.summary_all_results.returns_amount)} />
            <Summary label="عدد الفواتير" value={String(data.summary_all_results.invoices_count)} />
            {user?.can_see_cost && <Summary label="تكلفة المبيعات" value={money(data.summary_all_results.cost_of_sales)} />}
            {data.summary_all_results.gross_profit && (
              <>
                <Summary label="مجمل الربح" value={money(data.summary_all_results.gross_profit)} />
                <Summary label="هامش مجمل الربح" value={pct(data.summary_all_results.gross_margin_pct)} />
              </>
            )}
          </div>

          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>البند</th>
                    <th className="n">الكمية</th>
                    <th className="n">صافي المبيعات</th>
                    <th className="n">الخصومات</th>
                    <th className="n">الضريبة</th>
                    <th className="n">الفواتير</th>
                    {user?.can_see_cost && <><th className="n">التكلفة</th><th className="n">مجمل الربح</th></>}
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
            {data.rows.length === 0 && <div className="state"><div className="title">لا توجد مبيعات في هذه الفترة</div></div>}
          </div>
        </>
      )}
    </ReportShell>
  );
}

/* ======================= تقييم المخزون ======================= */

export function InventoryValuationReport() {
  const { data, loading, error } = useReport<any>('/reports/inventory-valuation', {});

  return (
    <ReportShell
      title="تقييم المخزون"
      description="بالمتوسط المرجح المتحرك. القيمة يجب أن تطابق رصيد حساب المخزون في دفتر الأستاذ."
      loading={loading}
      error={error}
      generatedAt={data?.generated_at}
      onExport={data ? () => exportCsv(
        'inventory-valuation.csv',
        ['الكود', 'الصنف', 'الكمية', 'متوسط التكلفة', 'القيمة'],
        data.rows.map((r: any) => [r.code, r.name_ar, r.qty_on_hand, r.avg_cost, r.total_value]),
      ) : undefined}
    >
      {data && (
        <>
          {data.reconciled ? (
            <Alert tone="success">
              المطابقة سليمة: قيمة المخزون <span className="num">{moneyPlain(data.total_value)}</span> تساوي رصيد حساب المخزون في الأستاذ.
            </Alert>
          ) : (
            <Alert tone="error">
              فرق في المطابقة: قيمة المخزون <span className="num">{moneyPlain(data.total_value)}</span> مقابل رصيد الأستاذ
              <span className="num"> {moneyPlain(data.gl_inventory_balance)}</span>. راجع الحركات غير المرحّلة قبل الاعتماد على هذا التقرير.
            </Alert>
          )}

          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>الكود</th><th>الصنف</th><th className="n">الكمية</th><th className="n">متوسط التكلفة</th><th className="n">القيمة</th></tr>
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
                  <tr><td colSpan={4}>الإجمالي</td><td className="n num">{money(data.total_value)}</td></tr>
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
  const [asOf, setAsOf] = useState(today());
  const { data, loading, error } = useReport<any>('/reports/aging', { as_of: asOf });

  return (
    <ReportShell
      title="أعمار الديون"
      description="التصنيف حسب تاريخ الاستحقاق، لا حسب تاريخ الفاتورة."
      loading={loading}
      error={error}
      onExport={data ? () => exportCsv(
        `aging-${asOf}.csv`,
        ['العميل', 'جارٍ', '1-30', '31-60', '61-90', '+90', 'الإجمالي'],
        data.rows.map((r: any) => [r.customer_name, r.current, r.days_1_30, r.days_31_60, r.days_61_90, r.days_90_plus, r.total]),
      ) : undefined}
      filters={
        <div className="field">
          <label>حتى تاريخ</label>
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
                  <th>العميل</th><th className="n">جارٍ</th><th className="n">1–30</th>
                  <th className="n">31–60</th><th className="n">61–90</th><th className="n">+90</th><th className="n">الإجمالي</th>
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
                  <td>مجموع كل النتائج</td>
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
          {data.rows.length === 0 && <div className="state"><div className="title">لا توجد مديونيات قائمة</div></div>}
        </div>
      )}
    </ReportShell>
  );
}

/* ======================= ميزان المراجعة ======================= */

export function TrialBalanceReport() {
  const period = usePeriod();
  const { data, loading, error } = useReport<any>('/reports/trial-balance', { from: period.from, to: period.to });

  return (
    <ReportShell
      title="ميزان المراجعة"
      loading={loading}
      error={error}
      filters={<PeriodFilters {...period} />}
      onExport={data ? () => exportCsv(
        `trial-balance-${period.from}.csv`,
        ['الكود', 'الحساب', 'مدين', 'دائن', 'الرصيد'],
        data.rows.map((r: any) => [r.code, r.name_ar, r.total_debit, r.total_credit, r.balance]),
      ) : undefined}
    >
      {data && (
        <>
          {data.totals.balanced
            ? <Alert tone="success">الميزان متوازن: المدين يساوي الدائن.</Alert>
            : <Alert tone="error">الميزان غير متوازن — راجع القيود قبل الاعتماد على هذا التقرير.</Alert>}

          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>الكود</th><th>الحساب</th><th className="n">مدين</th><th className="n">دائن</th><th className="n">الرصيد</th></tr></thead>
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
                    <td colSpan={2}>الإجمالي</td>
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
  const period = usePeriod();
  const { data, loading, error } = useReport<any>('/reports/income-statement', { from: period.from, to: period.to });

  return (
    <ReportShell title="قائمة الدخل" loading={loading} error={error} filters={<PeriodFilters {...period} />}>
      {data && (
        <>
          <Alert tone="warn">{data.caveat}</Alert>

          <div className="grid auto mb-4">
            <Summary label="الإيرادات" value={money(data.summary.revenue)} />
            <Summary label="مردودات المبيعات" value={money(data.summary.sales_returns)} />
            <Summary label="صافي الإيراد" value={money(data.summary.net_revenue)} />
            <Summary label="تكلفة المبيعات" value={money(data.summary.cost_of_sales)} />
            <Summary label="مجمل الربح" value={money(data.summary.gross_profit)} />
            <Summary label="المصروفات التشغيلية" value={money(data.summary.operating_expenses)} />
            <Summary label="صافي الربح" value={money(data.summary.net_profit)} />
          </div>

          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>الكود</th><th>الحساب</th><th>النوع</th><th className="n">القيمة</th></tr></thead>
                <tbody>
                  {data.lines.map((r: any, i: number) => (
                    <tr key={i}>
                      <td className="num">{r.code}</td>
                      <td>{r.name_ar}</td>
                      <td>{r.type === 'revenue' ? <Badge tone="success">إيراد</Badge> : <Badge tone="warn">مصروف</Badge>}</td>
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
  const period = usePeriod();
  const { user } = useAuth();
  const { data, loading, error } = useReport<any>('/reports/salesmen', { from: period.from, to: period.to });

  return (
    <ReportShell
      title="أداء المناديب"
      description="المخطط مقابل المنفذ، والزيارات المنتجة، والمبيعات والتحصيلات والمديونيات."
      loading={loading}
      error={error}
      filters={<PeriodFilters {...period} />}
      onExport={data ? () => exportCsv(
        `salesmen-${period.from}.csv`,
        ['الكود', 'المندوب', 'زيارات مخططة', 'زيارات منفذة', 'نسبة المنتجة', 'صافي المبيعات', 'التحصيلات', 'المديونيات'],
        data.rows.map((r: any) => [r.code, r.name, r.planned_visits, r.executed_visits, r.productive_visits_pct, r.net_sales, r.collections, r.receivables]),
      ) : undefined}
    >
      {data && (
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>المندوب</th>
                  <th className="n">مخطط</th><th className="n">منفذ</th><th className="n">منتجة %</th>
                  <th className="n">صافي المبيعات</th><th className="n">التحصيلات</th><th className="n">المديونيات</th>
                  <th className="n">عملاء جدد</th><th className="n">غير نشطين</th>
                  {user?.can_see_cost && <th className="n">التكلفة</th>}
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
          {data.rows.length === 0 && <div className="state"><div className="title">لا يوجد مناديب نشطون</div></div>}
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
