import { useEffect, useState } from 'react';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, moneyPlain, pct, date, statusOf, startOfMonth, today } from '../lib/format';
import { Alert, Badge, ErrorState, LoadingState, StatCard } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';

const BASE_KEYS: Record<string, MessageKey> = {
  net_sales: 'commissions.base.net_sales',
  collections: 'commissions.base.collections',
  realized_profit: 'commissions.base.realized_profit',
};

export default function Commissions() {
  const { t } = useI18n();
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
          <h1>{t('commissions.title')}</h1>
          <div className="desc">{t('commissions.desc')}</div>
        </div>
        <div className="actions">
          <input type="date" className="btn" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="btn" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn" onClick={() => window.print()}>{t('common.print')}</button>
        </div>
      </div>

      <Alert tone="info">{t('commissions.hint')}</Alert>

      {error ? <ErrorState error={error} onRetry={() => void load()} />
        : loading ? <LoadingState />
          : data && (
            <>
              <div className="grid cols-4 mb-4">
                <StatCard label={t('commissions.estimated')} value={money(data.totals.estimated)} formula={t('commissions.estimatedFormula')} />
                <StatCard label={t('commissions.earned')} value={money(data.totals.earned)} formula={t('commissions.earnedFormula')} />
                <StatCard label={t('commissions.settled')} value={money(data.totals.settled)} formula={t('commissions.settledFormula')} />
                <StatCard label={t('commissions.payableNow')} value={money(data.totals.payable_now)} />
              </div>

              <div className="card">
                <div className="card-head"><h2>{t('commissions.details')}</h2></div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{t('common.date')}</th><th>{t('commissions.doc')}</th><th>{t('commissions.rule')}</th>
                        <th>{t('commissions.version')}</th><th>{t('commissions.base')}</th>
                        <th className="n">{t('commissions.baseAmount')}</th><th className="n">{t('commissions.rate')}</th>
                        <th className="n">{t('commissions.amount')}</th><th>{t('common.status')}</th>
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
                            <td className="small">{BASE_KEYS[l.rule_base] ? t(BASE_KEYS[l.rule_base]) : l.rule_base}</td>
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
                {data.lines.length === 0 && <div className="state"><div className="title">{t('commissions.empty')}</div></div>}
              </div>
            </>
          )}
    </div>
  );
}
