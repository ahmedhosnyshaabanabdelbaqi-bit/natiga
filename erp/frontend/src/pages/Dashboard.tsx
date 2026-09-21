import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, pct, relativeTime, startOfMonth, today } from '../lib/format';
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
    case 'integer': return new Intl.NumberFormat('en-US').format(Number(card.value));
    default: return money(card.value);
  }
}

const ROLE_LABELS: Record<string, string> = {
  management: 'الإدارة',
  salesman: 'المندوب',
  supervisor: 'المشرف',
  warehouse: 'المخازن',
  accounting: 'الحسابات',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
          <h1>لوحة التحكم</h1>
          <div className="desc">
            عرض مخصص لدور: <strong>{ROLE_LABELS[data?.role_view ?? ''] ?? '—'}</strong>
            {data && <> · آخر تحديث {relativeTime(data.generated_at)}</>}
          </div>
        </div>
        <div className="actions">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="btn" aria-label="من تاريخ" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="btn" aria-label="إلى تاريخ" />
          <button className="btn" onClick={() => void load()}>تحديث</button>
        </div>
      </div>

      <Alert tone="info">
        كل مؤشر له تعريف حسابي — اضغط <strong>ⓘ</strong> على البطاقة لعرضه، واضغط البطاقة لفتح المستندات المكوّنة له.
        المبيعات غير التحصيلات، ومجمل الربح غير صافي الربح.
      </Alert>

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
              <Alert tone="warn">
                مؤشرات التكلفة والربح غير معروضة لأن حسابك لا يملك صلاحية مشاهدتها. هذه القيم لا تُرسل من الخادم أصلًا.
              </Alert>
            </div>
          )}
        </>
      )}
    </div>
  );
}
