import { useEffect, useState } from 'react';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, moneyPlain, today, statusOf } from '../lib/format';
import { Alert, Badge, Button, ErrorState, LoadingState, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useI18n, type MessageKey } from '../lib/i18n';

interface Equation {
  formula: string;
  expected: string;
  actual: string;
  variance: string;
  [key: string]: unknown;
}

interface ClosurePayload {
  closure: Record<string, any>;
  goods_equation: Equation;
  cash_equation: Equation & { excluded: { bank_transfers: string; cheques: string; note: string } };
  sync: { complete: boolean; pending_ops: number };
}

const GOODS_ROWS: Array<[string, MessageKey, 1 | -1]> = [
  ['opening', 'closure.goods.opening', 1],
  ['loaded', 'closure.goods.loaded', 1],
  ['returns_in', 'closure.goods.returnsIn', 1],
  ['sold', 'closure.goods.sold', -1],
  ['bonus', 'closure.goods.bonus', -1],
  ['returned_to_warehouse', 'closure.goods.returnedToWh', -1],
  ['transfer_out', 'closure.goods.transferOut', -1],
  ['damaged', 'closure.goods.damaged', -1],
];

const CASH_ROWS: Array<[string, MessageKey, 1 | -1]> = [
  ['opening', 'closure.cash.opening', 1],
  ['collected', 'closure.cash.collected', 1],
  ['custody_received', 'closure.cash.custodyReceived', 1],
  ['deposited', 'closure.cash.deposited', -1],
  ['expenses', 'closure.cash.expenses', -1],
  ['refunds', 'closure.cash.refunds', -1],
];

interface SalesmanOption { id: number; code: string; name: string }

export default function DayClosure() {
  const { can, user } = useAuth();
  const { t } = useI18n();
  const [date, setDate] = useState(today());
  const [salesmen, setSalesmen] = useState<SalesmanOption[]>([]);
  const [salesmanId, setSalesmanId] = useState<string>(() => (user?.salesman ? String(user.salesman.id) : ''));
  const [data, setData] = useState<ClosurePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const [closing, setClosing] = useState(false);
  const [cashActual, setCashActual] = useState('');
  const [goodsActual, setGoodsActual] = useState('');
  const [explanation, setExplanation] = useState('');
  const [syncReason, setSyncReason] = useState('');
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // المشرف والحسابات يختارون المندوب؛ المندوب يرى يومه مباشرة
  useEffect(() => {
    void api.get('/salesmen')
      .then(({ data }) => {
        setSalesmen(data.data);
        setSalesmanId((current) => current || (data.data[0] ? String(data.data[0].id) : ''));
      })
      .catch(() => setSalesmen([]));
  }, []);

  const load = async () => {
    if (!salesmanId) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: body } = await api.get('/day-closures', { params: { date, salesman_id: salesmanId } });
      setData(body.data);
      setCashActual(body.data.cash_equation.actual);
      setGoodsActual(body.data.goods_equation.actual);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, salesmanId]);

  const submitClose = async () => {
    if (!data) return;
    setActionError(null);
    try {
      await api.post(`/day-closures/${data.closure.id}/close`, {
        cash_actual: cashActual || undefined,
        goods_actual_value: goodsActual || undefined,
        variance_explanation: explanation || undefined,
        sync_exception_reason: syncReason || undefined,
      });
      setClosing(false);
      setSyncReason('');
      setExplanation('');
      await load();
    } catch (e) {
      setActionError(toApiError(e));
    }
  };

  const submitReopen = async () => {
    if (!data) return;
    setActionError(null);
    try {
      await api.post(`/day-closures/${data.closure.id}/reopen`, { reason: reopenReason });
      setReopening(false);
      setReopenReason('');
      await load();
    } catch (e) {
      setActionError(toApiError(e));
    }
  };

  const salesmanPicker = salesmen.length > 0 && (
    <select className="btn" value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} aria-label={t('common.salesman')}>
      {salesmen.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
    </select>
  );

  if (!salesmanId && !loading) {
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>{t('closure.title')}</h1>
            <div className="desc">{t('closure.selectSalesman')}</div>
          </div>
          <div className="actions">{salesmanPicker}</div>
        </div>
        <Alert tone="info">{t('closure.noSalesmanAccount')}</Alert>
      </div>
    );
  }

  if (loading) return <LoadingState label={t('closure.calculating')} />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!data) return null;

  const status = statusOf(data.closure.status);
  const isClosed = data.closure.status === 'closed';
  const cashVariance = Number(data.cash_equation.variance);
  const goodsVariance = Number(data.goods_equation.variance);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('closure.title')}</h1>
          <div className="desc">
            <span className="num">{data.closure.closure_no}</span> · <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </div>
        <div className="actions">
          {salesmanPicker}
          <input type="date" className="btn" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button onClick={() => void load()}>{t('closure.recalculate')}</Button>
          <Button
            variant="primary"
            disabledReason={
              !can('day_closure.close') ? t('closure.noPermissionClose')
                : isClosed ? t('closure.alreadyClosed')
                  : null
            }
            onClick={() => setClosing(true)}
          >
            {t('closure.close')}
          </Button>
          {isClosed && (
            <Button
              variant="danger"
              disabledReason={can('day_closure.reopen') ? null : t('closure.noPermissionReopen')}
              onClick={() => setReopening(true)}
            >
              {t('closure.reopen')}
            </Button>
          )}
        </div>
      </div>

      {actionError && <Alert tone="error">{actionError.message}</Alert>}

      {!data.sync.complete && (
        <Alert tone="warn">{t('closure.syncPending', { n: data.sync.pending_ops })}</Alert>
      )}

      {data.closure.sync_exception_granted && (
        <Alert tone="warn">{t('closure.syncException', { reason: data.closure.sync_exception_reason ?? '—' })}</Alert>
      )}

      <div className="grid cols-2">
        <EquationCard
          title={t('closure.goodsEquation')}
          formula={data.goods_equation.formula}
          rows={GOODS_ROWS.map(([key, labelKey, sign]) => ({ label: t(labelKey), value: String(data.goods_equation[key] ?? '0'), sign }))}
          expected={data.goods_equation.expected}
          actual={data.goods_equation.actual}
          variance={goodsVariance}
        />

        <EquationCard
          title={t('closure.cashEquation')}
          formula={data.cash_equation.formula}
          rows={CASH_ROWS.map(([key, labelKey, sign]) => ({ label: t(labelKey), value: String(data.cash_equation[key] ?? '0'), sign }))}
          expected={data.cash_equation.expected}
          actual={data.cash_equation.actual}
          variance={cashVariance}
          footer={
            <div className="tiny faint mt-3">
              {data.cash_equation.excluded.note}
              <div className="mt-2">
                {t('closure.bankTransfers')}: <span className="num">{moneyPlain(data.cash_equation.excluded.bank_transfers)}</span>
                {' · '}{t('closure.cheques')}: <span className="num">{moneyPlain(data.cash_equation.excluded.cheques)}</span>
              </div>
            </div>
          }
        />
      </div>

      {closing && (
        <Modal
          title={t('closure.close')}
          onClose={() => setClosing(false)}
          footer={
            <>
              <Button variant="primary" onClick={() => void submitClose()}>{t('closure.confirmClose')}</Button>
              <Button onClick={() => setClosing(false)}>{t('invoice.undo')}</Button>
            </>
          }
        >
          <Alert tone="info">{t('closure.modalWarning')}</Alert>

          <label className="field">
            <span>{t('closure.actualCash')}</span>
            <input type="number" step="0.01" value={cashActual} onChange={(e) => setCashActual(e.target.value)} dir="ltr" />
            <span className="help">{t('closure.expectedHint', { value: moneyPlain(data.cash_equation.expected) })}</span>
          </label>

          <label className="field">
            <span>{t('closure.actualGoods')}</span>
            <input type="number" step="0.01" value={goodsActual} onChange={(e) => setGoodsActual(e.target.value)} dir="ltr" />
            <span className="help">{t('closure.expectedHint', { value: moneyPlain(data.goods_equation.expected) })}</span>
          </label>

          <label className="field">
            <span>{t('closure.varianceExplanation')}</span>
            <textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          </label>

          {!data.sync.complete && (
            <label className="field">
              <span>{t('closure.syncExceptionReason')} <span className="req">*</span></span>
              <textarea rows={2} value={syncReason} onChange={(e) => setSyncReason(e.target.value)} />
              <span className="help">{t('closure.syncExceptionHint')}</span>
            </label>
          )}
        </Modal>
      )}

      {reopening && (
        <Modal
          title={t('closure.reopenTitle')}
          onClose={() => setReopening(false)}
          footer={
            <>
              <Button variant="danger" disabledReason={reopenReason.trim().length < 5 ? t('closure.reopenReasonRequired') : null} onClick={() => void submitReopen()}>
                {t('closure.reopenConfirm')}
              </Button>
              <Button onClick={() => setReopening(false)}>{t('invoice.undo')}</Button>
            </>
          }
        >
          <Alert tone="warn">{t('closure.reopenWarning')}</Alert>
          <label className="field">
            <span>{t('common.reason')} <span className="req">*</span></span>
            <textarea rows={3} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
          </label>
        </Modal>
      )}
    </div>
  );
}

function EquationCard({
  title, formula, rows, expected, actual, variance, footer,
}: {
  title: string;
  formula: string;
  rows: Array<{ label: string; value: string; sign: 1 | -1 }>;
  expected: string;
  actual: string;
  variance: number;
  footer?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2></div>
      <div className="card-body">
        <div className="tiny faint mb-3" style={{ lineHeight: 1.8 }}>{formula}</div>

        <table className="data">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.sign === 1 ? '+' : '−'} {r.label}</td>
                <td className="n num">{moneyPlain(r.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{t('closure.expected')}</td>
              <td className="n num">{money(expected)}</td>
            </tr>
            <tr>
              <td>{t('closure.actual')}</td>
              <td className="n num">{money(actual)}</td>
            </tr>
            <tr>
              <td>{t('closure.variance')}</td>
              <td className={`n num ${variance === 0 ? 'pos' : 'neg'}`}>
                {money(String(variance))}
                {variance !== 0 && (
                  <div className="tiny">
                    {variance < 0 ? t('closure.shortage') : t('closure.excess')} — {t('closure.varianceNeedsReport')}
                  </div>
                )}
              </td>
            </tr>
          </tfoot>
        </table>

        {footer}
      </div>
    </div>
  );
}
