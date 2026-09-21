import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, date, moneyPlain } from '../lib/format';
import { Alert, Badge, ErrorState, LoadingState, StatCard } from '../components/ui';

interface Credit {
  outstanding_invoices: string;
  approved_uninvoiced_orders: string;
  offline_reserved: string;
  total_exposure: string;
  credit_limit: string;
  available_credit: string;
  overdue_amount: string;
}

interface StatementLine {
  date: string;
  doc_type: string;
  doc_no: string;
  debit: string;
  credit: string;
  running_balance: string;
}

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<Record<string, any> | null>(null);
  const [credit, setCredit] = useState<Credit | null>(null);
  const [statement, setStatement] = useState<StatementLine[]>([]);
  const [closing, setClosing] = useState('0');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, stmt] = await Promise.all([
        api.get(`/customers/${id}`),
        api.get(`/customers/${id}/statement`),
      ]);
      setCustomer(detail.data.data.customer);
      setCredit(detail.data.data.credit);
      setStatement(stmt.data.data.lines ?? []);
      setClosing(stmt.data.data.closing_balance ?? '0');
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <LoadingState label="جارٍ تحميل بيانات العميل…" />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!customer) return null;

  const overLimit = credit && Number(credit.total_exposure) > Number(credit.credit_limit);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{customer.name}</h1>
          <div className="desc">
            <span className="num">{customer.code}</span>
            {customer.is_blocked && <> · <Badge tone="danger">موقوف: {customer.block_reason}</Badge></>}
          </div>
        </div>
        <div className="actions no-print">
          <button className="btn" onClick={() => window.print()}>طباعة كشف الحساب</button>
          <Link className="btn btn-primary" to={`/sales-invoices/new?customer=${customer.id}`}>فاتورة جديدة</Link>
        </div>
      </div>

      {overLimit && (
        <Alert tone="warn">
          التعرض الائتماني الحالي ({moneyPlain(credit!.total_exposure)}) يتجاوز الحد المقرر ({moneyPlain(credit!.credit_limit)}).
          أي بيع آجل جديد سيحتاج موافقة مسجلة.
        </Alert>
      )}

      {credit && (
        <div className="grid auto mb-4">
          <StatCard
            label="مستحقات مفوترة"
            value={money(credit.outstanding_invoices)}
            formula="مجموع (إجمالي الفاتورة − المسدد − المرتجع) للفواتير المرحّلة"
          />
          <StatCard
            label="طلبات معتمدة غير مفوترة"
            value={money(credit.approved_uninvoiced_orders)}
            formula="الجزء غير المفوتر من أوامر البيع المعتمدة الآجلة"
            note="لا يُحتسب مرتين مع الفواتير"
          />
          <StatCard
            label="حصص أوفلاين محجوزة"
            value={money(credit.offline_reserved)}
            formula="المتبقي من حصص الائتمان الممنوحة لأجهزة المناديب"
          />
          <StatCard
            label="إجمالي التعرض"
            value={money(credit.total_exposure)}
            formula="المستحقات + الطلبات غير المفوترة + الحصص المحجوزة، دون عدّ مزدوج"
          />
          <StatCard label="الحد الائتماني" value={money(credit.credit_limit)} />
          <StatCard label="المتاح للبيع الآجل" value={money(credit.available_credit)} />
          <StatCard
            label="المتأخرات"
            value={money(credit.overdue_amount)}
            formula="المديونيات التي تجاوز تاريخ استحقاقها اليوم"
          />
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>كشف الحساب</h2></div>
        {statement.length === 0 ? (
          <div className="state"><div className="title">لا توجد حركات في الفترة</div></div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>نوع المستند</th>
                  <th>الرقم</th>
                  <th className="n">مدين</th>
                  <th className="n">دائن</th>
                  <th className="n">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {statement.map((line, i) => (
                  <tr key={`${line.doc_no}-${i}`}>
                    <td className="num">{date(line.date)}</td>
                    <td>{line.doc_type}</td>
                    <td className="num">{line.doc_no}</td>
                    <td className="n num">{Number(line.debit) ? moneyPlain(line.debit) : '—'}</td>
                    <td className="n num">{Number(line.credit) ? moneyPlain(line.credit) : '—'}</td>
                    <td className="n num bold">{moneyPlain(line.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>رصيد آخر المدة</td>
                  <td className="n num">{money(closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
