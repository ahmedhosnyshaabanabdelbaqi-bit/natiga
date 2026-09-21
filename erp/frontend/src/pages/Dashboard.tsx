import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, integer, pct, relativeTime, startOfMonth, today } from '../lib/format';
import { useI18n, type MessageKey } from '../lib/i18n';
import { Alert, ErrorState, StatCard, TableSkeleton } from '../components/ui';
import { useAuth } from '../lib/auth';

interface Card {
  key: string;
  label: string;
  value: string;
  format: 'money' | 'integer' | 'percent';
  formula: string | null;
  note: string | null;
  drilldown: string | null;
  caveat?: string;
}

interface DashboardData {
  role_view: string;
  period: { from: string; to: string };
  generated_at: string;
  cards: Card[];
  dictionary: Record<string, { label: string; formula: string; note?: string }>;
}

/** كل مؤشر يُعرض بتنسيقه المعلن من الخادم: عملة أو نسبة أو عدد. */
function formatValue(card: Card): string {
  switch (card.format) {
    case 'percent': return pct(card.value);
    case 'integer': return integer(card.value);
    default: return money(card.value);
  }
}

const ROLE_KEYS: Record<string, MessageKey> = {
  management: 'dash.role.management',
  salesman: 'dash.role.salesman',
  supervisor: 'dash.role.supervisor',
  warehouse: 'dash.role.warehouse',
  accounting: 'dash.role.accounting',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();

  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: body } = await api.get('/dashboard', { params: { from, to } });
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
          <h1>{t('dash.title')}</h1>
          <div className="desc">
            {t('dash.roleView', { role: '' })}
            <strong>{ROLE_KEYS[data?.role_view ?? ''] ? t(ROLE_KEYS[data!.role_view]) : '—'}</strong>
            {data && <> · {t('common.lastUpdate')} {relativeTime(data.generated_at)}</>}
          </div>
        </div>
        <div className="actions">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="btn" aria-label={t('common.from')} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="btn" aria-label={t('common.to')} />
          <button className="btn" onClick={() => void load()}>{t('common.refresh')}</button>
        </div>
      </div>

      <Alert tone="info">{t('dash.hint')}</Alert>

      {error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : loading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : (
        <>
          <div className="grid auto">
            {data?.cards.map((card) => (
              <StatCard
                key={card.key}
                label={card.label}
                value={formatValue(card)}
                formula={card.formula}
                note={card.note}
                caveat={card.caveat}
                onClick={card.drilldown ? () => navigate(card.drilldown!) : undefined}
              />
            ))}
          </div>

          {!user?.can_see_cost && (
            <div className="mt-4">
              <Alert tone="warn">{t('dash.noCostWarning')}</Alert>
            </div>
          )}
        </>
      )}
    </div>
  );
}
