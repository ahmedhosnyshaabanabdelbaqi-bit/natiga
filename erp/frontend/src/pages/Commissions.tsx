import { useEffect, useState } from 'react';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, moneyPlain, pct, date, statusOf, startOfMonth, today } from '../lib/format';
import { Alert, Badge, ErrorState, LoadingState, StatCard } from '../components/ui';

export default function Commissions() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: body } = await api.get('/commissions/statement', { params: { from, to } });
      setData(body.data);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>كشف العمولات</h1>
          <div className="desc">كل مبلغ يمكن تتبعه إلى الفاتورة أو المرتجع والقاعدة وإصدارها.</div>
        </div>
        <div className="actions">
          <input type="date" className="btn" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="btn" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn" onClick={() => window.print()}>طباعة</button>
        </div>
      </div>

      <Alert tone="info">
        العمولة <strong>المقدّرة</strong> لم تُستحق بعد (تنتظر التحصيل حسب القاعدة)، و<strong>المستحقة</strong> قابلة للصرف.
        المرتجعات تُعالج بحركة تسوية عكسية موثقة، لا بإعادة حساب صامت.
      </Alert>

      {error ? <ErrorState error={error} onRetry={() => void load()} />
        : loading ? <LoadingState />
          : data && (
            <>
              <div className="grid cols-4 mb-4">
                <StatCard label="مقدّرة" value={money(data.totals.estimated)} formula="عمولات لم تُستحق بعد لعدم اكتمال التحصيل" />
                <StatCard label="مستحقة" value={money(data.totals.earned)} formula="عمولات استوفت شروط الاستحقاق" />
                <StatCard label="مُسوّاة" value={money(data.totals.settled)} formula="عمولات صُرفت ضمن تسوية معتمدة" />
                <StatCard label="القابل للصرف الآن" value={money(data.totals.payable_now)} />
              </div>

              <div className="card">
                <div className="card-head"><h2>التفاصيل</h2></div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>التاريخ</th><th>المستند</th><th>القاعدة</th><th>الإصدار</th><th>الأساس</th>
                        <th className="n">مبلغ الأساس</th><th className="n">النسبة</th><th className="n">العمولة</th><th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((l: any, i: number) => {
                        const s = statusOf(l.status);
                        return (
                          <tr key={i}>
                            <td className="num">{date(l.entry_date)}</td>
                            <td className="num">{l.source_no}</td>
                            <td>{l.rule ?? '—'}</td>
                            <td className="num">{l.rule_version}</td>
                            <td className="small">{l.rule_base === 'net_sales' ? 'صافي المبيعات' : l.rule_base === 'collections' ? 'التحصيلات' : 'الربح المحقق'}</td>
                            <td className="n num">{moneyPlain(l.base_amount)}</td>
                            <td className="n num">{pct(l.rate_pct)}</td>
                            <td className={`n num bold ${Number(l.amount) < 0 ? 'neg' : ''}`}>{moneyPlain(l.amount)}</td>
                            <td><Badge tone={s.tone}>{s.label}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {data.lines.length === 0 && <div className="state"><div className="title">لا توجد عمولات في هذه الفترة</div></div>}
              </div>
            </>
          )}
    </div>
  );
}
