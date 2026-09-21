import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, moneyPlain, qty, date, statusOf } from '../lib/format';
import { Alert, Badge, Button, ErrorState, Field, LoadingState, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

type Row = Record<string, any>;

export default function SalesOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { t } = useI18n();

  const [order, setOrder] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [shortages, setShortages] = useState<Row[]>([]);

  const [approving, setApproving] = useState(false);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/sales-orders/${id}`);
      setOrder(data.data);
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

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setActionError(toApiError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const doApprove = async () => {
    const ok = await act(async () => {
      const { data } = await api.post(`/sales-orders/${id}/approve`, {
        credit_override: override || undefined,
        credit_override_reason: override ? overrideReason : undefined,
      });
      // الاعتماد قد ينجح مع نقص جزئي إن كان التأجيل مسموحًا — نعرضه بدل ابتلاعه
      setShortages(data.data?.shortages ?? []);
    });
    if (ok) {
      setApproving(false);
      setOverride(false);
      setOverrideReason('');
    }
  };

  const doCancel = async () => {
    const ok = await act(() => api.post(`/sales-orders/${id}/cancel`, { reason }));
    if (ok) { setCancelling(false); setReason(''); }
  };

  const doClose = async () => {
    const ok = await act(() => api.post(`/sales-orders/${id}/close`, { reason: reason || undefined }));
    if (ok) { setClosing(false); setReason(''); }
  };

  const createDelivery = async () => {
    setActionError(null);
    setBusy(true);
    try {
      const { data } = await api.post('/delivery-notes', { sales_order_id: Number(id) });
      navigate(`/delivery-notes/${data.data.id}`);
    } catch (e) {
      setActionError(toApiError(e));
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label={t('common.loading')} />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!order) return null;

  const s = statusOf(order.status);
  const isApproved = order.status === 'approved';
  const hasRemaining = (order.lines ?? []).some(
    (l: Row) => Number(l.qty_base) - Number(l.delivered_qty_base) > 0,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('so.no')} <span className="num">{order.order_no}</span></h1>
          <div className="desc">
            <Badge tone={s.tone}>{s.label}</Badge>
            {' · '}{t('so.deliveryStatus')}: <Badge tone={statusOf(order.delivery_status).tone}>{statusOf(order.delivery_status).label}</Badge>
            {' · '}{t('so.invoiceStatus')}: <Badge tone={statusOf(order.invoice_status).tone}>{statusOf(order.invoice_status).label}</Badge>
          </div>
        </div>
        <div className="actions no-print">
          {order.status === 'draft' && (
            <Button
              variant="primary"
              loading={busy}
              disabledReason={can('sales_order.approve') ? null : t('so.noPermissionApprove')}
              onClick={() => setApproving(true)}
            >
              {t('so.approve')}
            </Button>
          )}
          {isApproved && hasRemaining && (
            <Button
              variant="primary"
              loading={busy}
              disabledReason={can('delivery_note.create') ? null : t('dn.noPermissionPost')}
              onClick={() => void createDelivery()}
            >
              {t('so.createDelivery')}
            </Button>
          )}
          {isApproved && (
            <Button loading={busy} onClick={() => setClosing(true)}>{t('so.close')}</Button>
          )}
          {['draft', 'approved'].includes(order.status) && (
            <Button
              variant="danger"
              disabledReason={can('sales_order.cancel') ? null : t('common.forbidden')}
              onClick={() => setCancelling(true)}
            >
              {t('so.cancel')}
            </Button>
          )}
        </div>
      </div>

      {actionError && <Alert tone="error">{actionError.message}</Alert>}

      {shortages.length > 0 && (
        <Alert tone="warn">{t('so.shortage', { count: shortages.length })}</Alert>
      )}

      {order.credit_override && (
        <Alert tone="warn">
          {t('so.creditExposure')} — {order.credit_override_reason}
        </Alert>
      )}

      <div className="grid cols-2 mb-4">
        <div className="card">
          <div className="card-head"><h2>{t('invoice.data')}</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('common.customer')}</span>
              <Link to={`/customers/${order.customer?.id}`}>{order.customer?.name}</Link></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('so.orderDate')}</span><span className="num">{date(order.order_date)}</span></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('so.requiredDate')}</span><span className="num">{order.required_date ? date(order.required_date) : '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('common.warehouse')}</span><span>{order.warehouse?.name ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('common.salesman')}</span><span>{order.salesman?.name ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('invoice.paymentType')}</span>
              <span>{order.payment_type === 'cash' ? t('invoices.cash') : t('invoices.credit')}</span></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('so.backorderAllowed')}</span>
              <span>{order.is_backorder_allowed ? t('common.yes') : t('common.no')}</span></div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>{t('invoice.amounts')}</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 150 }}>{t('invoice.subtotal')}</span><span className="num">{money(order.subtotal)}</span></div>
            <div className="row"><span className="muted" style={{ width: 150 }}>{t('invoice.lineDiscount')}</span><span className="num">{money(order.line_discount_amount)}</span></div>
            <div className="row"><span className="muted" style={{ width: 150 }}>{t('common.tax')}</span><span className="num">{money(order.tax_amount)}</span></div>
            <div className="divider" />
            <div className="row"><span className="bold" style={{ width: 150 }}>{t('common.total')}</span>
              <span className="num bold" style={{ fontSize: 18 }}>{money(order.total_amount)}</span></div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-head"><h2>{t('invoice.lines')}</h2></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: '32%' }}>{t('common.item')}</th>
                <th style={{ width: 120 }}>{t('common.unit')}</th>
                <th className="n">{t('common.qty')}</th>
                <th className="n">{t('so.reserved')}</th>
                <th className="n">{t('so.delivered')}</th>
                <th className="n">{t('so.invoiced')}</th>
                <th className="n">{t('so.remaining')}</th>
                <th className="n">{t('common.price')}</th>
                <th className="n">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {(order.lines ?? []).map((line: Row) => {
                const remaining = Number(line.qty_base) - Number(line.delivered_qty_base);
                return (
                  <tr key={line.id}>
                    <td className="num">{line.line_no}</td>
                    <td>{line.item?.name_ar ?? '—'}{line.is_free && <> <Badge tone="success">{t('invoice.gift')}</Badge></>}</td>
                    <td>{line.uom?.name_ar ?? '—'}</td>
                    <td className="n num">{qty(line.qty_uom)}</td>
                    <td className="n num">{qty(line.reserved_qty_base)}</td>
                    <td className="n num">{qty(line.delivered_qty_base)}</td>
                    <td className="n num">{qty(line.invoiced_qty_base)}</td>
                    <td className={`n num ${remaining > 0 ? 'bold' : 'faint'}`}>{qty(remaining.toFixed(6))}</td>
                    <td className="n num">{moneyPlain(line.unit_price)}</td>
                    <td className="n num bold">{moneyPlain(line.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>{t('so.deliveryNotes')}</h2></div>
          <div className="card-body stack">
            {(order.delivery_notes ?? []).length === 0 && <span className="muted">—</span>}
            {(order.delivery_notes ?? []).map((n: Row) => (
              <div className="row" key={n.id}>
                <Link to={`/delivery-notes/${n.id}`} className="num">{n.delivery_no}</Link>
                <span className="num muted">{date(n.delivery_date)}</span>
                <Badge tone={statusOf(n.status).tone}>{statusOf(n.status).label}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>{t('so.invoices')}</h2></div>
          <div className="card-body stack">
            {(order.invoices ?? []).length === 0 && <span className="muted">—</span>}
            {(order.invoices ?? []).map((n: Row) => (
              <div className="row" key={n.id}>
                <Link to={`/sales-invoices/${n.id}`} className="num">{n.invoice_no}</Link>
                <span className="num muted">{date(n.invoice_date)}</span>
                <span className="num">{money(n.total_amount)}</span>
                <Badge tone={statusOf(n.status).tone}>{statusOf(n.status).label}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {approving && (
        <Modal
          title={t('so.approve')}
          onClose={() => setApproving(false)}
          footer={
            <>
              <Button onClick={() => setApproving(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" loading={busy} onClick={() => void doApprove()}>{t('so.approve')}</Button>
            </>
          }
        >
          <Alert tone="info">{t('so.approveHint')}</Alert>
          <label className="row tight" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            {t('so.overrideCredit')}
          </label>
          {override && (
            <Field label={t('so.overrideReason')} required>
              <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </Field>
          )}
        </Modal>
      )}

      {cancelling && (
        <Modal
          title={t('so.cancel')}
          onClose={() => setCancelling(false)}
          footer={
            <>
              <Button onClick={() => setCancelling(false)}>{t('common.back')}</Button>
              <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => void doCancel()}>
                {t('so.cancel')}
              </Button>
            </>
          }
        >
          <Field label={t('so.cancelReason')} required>
            <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </Modal>
      )}

      {closing && (
        <Modal
          title={t('so.close')}
          onClose={() => setClosing(false)}
          footer={
            <>
              <Button onClick={() => setClosing(false)}>{t('common.back')}</Button>
              <Button variant="primary" loading={busy} onClick={() => void doClose()}>{t('so.close')}</Button>
            </>
          }
        >
          <Alert tone="warn">{t('so.closeHint')}</Alert>
          <Field label={t('so.cancelReason')}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
