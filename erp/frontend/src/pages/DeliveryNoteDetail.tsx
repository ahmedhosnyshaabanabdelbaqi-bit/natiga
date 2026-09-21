import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { moneyPlain, qty, date, statusOf } from '../lib/format';
import { Alert, Badge, Button, ErrorState, Field, LoadingState, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

type Row = Record<string, any>;

export default function DeliveryNoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const { t } = useI18n();

  const [note, setNote] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [receiver, setReceiver] = useState('');
  // الكمية المسلَّمة لكل سطر، مفتاحها معرّف السطر
  const [delivered, setDelivered] = useState<Record<number, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});

  const [failing, setFailing] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [reschedule, setReschedule] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/delivery-notes/${id}`);
      setNote(data.data);
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

  /** يفتح نافذة التأكيد بالكميات المحمّلة كقيمة مبدئية — الحالة الغالبة تسليم كامل. */
  const openConfirm = () => {
    const initial: Record<number, string> = {};
    for (const line of note?.lines ?? []) initial[line.id] = String(Number(line.qty_base));
    setDelivered(initial);
    setRejectReasons({});
    setConfirming(true);
  };

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

  const doConfirm = async () => {
    const ok = await act(() => api.post(`/delivery-notes/${id}/confirm`, {
      receiver_name: receiver || undefined,
      results: (note?.lines ?? []).map((l: Row) => ({
        line_id: l.id,
        delivered_qty_base: delivered[l.id] ?? String(Number(l.qty_base)),
        rejection_reason: rejectReasons[l.id] || undefined,
      })),
    }));
    if (ok) setConfirming(false);
  };

  const doFail = async () => {
    const ok = await act(() => api.post(`/delivery-notes/${id}/fail`, {
      reason: failReason,
      rescheduled_to: reschedule || undefined,
    }));
    if (ok) { setFailing(false); setFailReason(''); setReschedule(''); }
  };

  const doCancel = async () => {
    const ok = await act(() => api.post(`/delivery-notes/${id}/cancel`, { reason: cancelReason }));
    if (ok) { setCancelling(false); setCancelReason(''); }
  };

  const doDispatch = () => act(() => api.post(`/delivery-notes/${id}/dispatch`));

  if (loading) return <LoadingState label={t('common.loading')} />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!note) return null;

  const s = statusOf(note.status);
  const isDelivered = ['delivered', 'partially_delivered'].includes(note.status);
  const totalRejected = (note.lines ?? []).reduce((sum: number, l: Row) => sum + Number(l.rejected_qty_base ?? 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('dn.no')} <span className="num">{note.delivery_no}</span></h1>
          <div className="desc">
            <Badge tone={s.tone}>{s.label}</Badge>
            {note.is_invoiced && <> · <Badge tone="success">{t('dn.isInvoiced')}</Badge></>}
            {note.sales_order && (
              <> · {t('dn.fromOrder')} <Link to={`/sales-orders/${note.sales_order.id}`} className="num">{note.sales_order.order_no}</Link></>
            )}
          </div>
        </div>
        <div className="actions no-print">
          {note.status === 'draft' && (
            <Button
              variant="primary" loading={busy}
              disabledReason={can('delivery_note.post') ? null : t('dn.noPermissionPost')}
              onClick={() => void doDispatch()}
            >
              {t('dn.dispatch')}
            </Button>
          )}
          {note.status === 'out_for_delivery' && (
            <>
              <Button
                variant="primary"
                disabledReason={can('delivery_note.update') ? null : t('dn.noPermissionUpdate')}
                onClick={openConfirm}
              >
                {t('dn.confirm')}
              </Button>
              <Button
                disabledReason={can('delivery_note.update') ? null : t('dn.noPermissionUpdate')}
                onClick={() => setFailing(true)}
              >
                {t('dn.fail')}
              </Button>
            </>
          )}
          {isDelivered && !note.is_invoiced && (
            <Button
              variant="primary"
              disabledReason={can('sales_invoice.create') ? null : t('invoices.noPermissionCreate')}
              onClick={() => navigate(`/sales-invoices/new?delivery_note_id=${note.id}`)}
            >
              {t('dn.invoiceIt')}
            </Button>
          )}
          {['draft', 'out_for_delivery'].includes(note.status) && (
            <Button
              variant="danger"
              disabledReason={can('delivery_note.cancel') ? null : t('common.forbidden')}
              onClick={() => setCancelling(true)}
            >
              {t('dn.cancel')}
            </Button>
          )}
        </div>
      </div>

      {actionError && <Alert tone="error">{actionError.message}</Alert>}

      {note.status === 'out_for_delivery' && note.is_stock_owner && (
        <Alert tone="info">{t('dn.stockOwnerNote')}</Alert>
      )}

      {note.status === 'failed' || note.status === 'rescheduled' ? (
        <Alert tone="error">
          {t('dn.failureReason')}: {note.failure_reason ?? '—'}
          {note.rescheduled_to && <> · {t('dn.rescheduleTo')} {date(note.rescheduled_to)}</>}
        </Alert>
      ) : null}

      <div className="grid cols-2 mb-4">
        <div className="card">
          <div className="card-head"><h2>{t('invoice.data')}</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('common.customer')}</span>
              <Link to={`/customers/${note.customer?.id}`}>{note.customer?.name}</Link></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('dn.deliveryDate')}</span><span className="num">{date(note.delivery_date)}</span></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('common.warehouse')}</span><span>{note.warehouse?.name ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('common.salesman')}</span><span>{note.salesman?.name ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 130 }}>{t('dn.receiver')}</span><span>{note.receiver_name ?? '—'}</span></div>
            {note.delivered_at && (
              <div className="row"><span className="muted" style={{ width: 130 }}>{t('status.delivered')}</span><span className="num">{date(note.delivered_at)}</span></div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>{t('common.status')}</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 150 }}>{t('invoice.stockOwner')}</span>
              <span>{note.is_stock_owner ? t('dn.title') : t('invoice.stockOwnerInvoice')}</span></div>
            <div className="row"><span className="muted" style={{ width: 150 }}>{t('dn.rejectedQty')}</span>
              <span className={`num ${totalRejected > 0 ? 'neg bold' : ''}`}>{qty(totalRejected.toFixed(6))}</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>{t('invoice.lines')}</h2></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: '36%' }}>{t('common.item')}</th>
                <th style={{ width: 120 }}>{t('common.unit')}</th>
                <th className="n">{t('dn.loaded')}</th>
                <th className="n">{t('dn.deliveredQty')}</th>
                <th className="n">{t('dn.rejectedQty')}</th>
                {user?.can_see_cost && <th className="n">{t('common.cost')}</th>}
                <th>{t('dn.rejectionReason')}</th>
              </tr>
            </thead>
            <tbody>
              {(note.lines ?? []).map((line: Row) => (
                <tr key={line.id}>
                  <td className="num">{line.line_no}</td>
                  <td>{line.item?.name_ar ?? '—'}</td>
                  <td>{line.uom?.name_ar ?? '—'}</td>
                  <td className="n num">{qty(line.qty_base)}</td>
                  <td className="n num bold">{qty(line.delivered_qty_base)}</td>
                  <td className={`n num ${Number(line.rejected_qty_base) > 0 ? 'neg' : ''}`}>{qty(line.rejected_qty_base)}</td>
                  {user?.can_see_cost && <td className="n num">{moneyPlain(line.unit_cost)}</td>}
                  <td className="small">{line.rejection_reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirming && (
        <Modal
          title={t('dn.confirmTitle')}
          wide
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" loading={busy} onClick={() => void doConfirm()}>{t('dn.confirm')}</Button>
            </>
          }
        >
          <Alert tone="info">{t('dn.confirmHint')}</Alert>

          <Field label={t('dn.receiver')}>
            <input value={receiver} onChange={(e) => setReceiver(e.target.value)} autoFocus />
          </Field>

          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t('common.item')}</th>
                  <th className="n">{t('dn.loaded')}</th>
                  <th className="n" style={{ width: 120 }}>{t('dn.deliveredQty')}</th>
                  <th className="n">{t('dn.rejectedQty')}</th>
                  <th style={{ width: 180 }}>{t('dn.rejectionReason')}</th>
                </tr>
              </thead>
              <tbody>
                {(note.lines ?? []).map((line: Row) => {
                  const loaded = Number(line.qty_base);
                  const value = delivered[line.id] ?? String(loaded);
                  const rejected = loaded - Number(value || 0);
                  return (
                    <tr key={line.id}>
                      <td>{line.item?.name_ar ?? '—'}</td>
                      <td className="n num">{qty(line.qty_base)}</td>
                      <td className="n">
                        <input
                          type="number" min={0} max={loaded} step="0.000001"
                          value={value}
                          onChange={(e) => setDelivered((d) => ({ ...d, [line.id]: e.target.value }))}
                          style={{ width: 100, textAlign: 'end' }}
                        />
                      </td>
                      <td className={`n num ${rejected > 0 ? 'neg bold' : 'faint'}`}>{qty(rejected.toFixed(6))}</td>
                      <td>
                        {rejected > 0 && (
                          <input
                            value={rejectReasons[line.id] ?? ''}
                            onChange={(e) => setRejectReasons((r) => ({ ...r, [line.id]: e.target.value }))}
                            placeholder={t('dn.rejectionReason')}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {failing && (
        <Modal
          title={t('dn.failTitle')}
          onClose={() => setFailing(false)}
          footer={
            <>
              <Button onClick={() => setFailing(false)}>{t('common.back')}</Button>
              <Button variant="danger" loading={busy} disabled={failReason.trim().length < 3} onClick={() => void doFail()}>
                {t('dn.fail')}
              </Button>
            </>
          }
        >
          <Alert tone="warn">{t('dn.failHint')}</Alert>
          <Field label={t('dn.failureReason')} required>
            <input value={failReason} onChange={(e) => setFailReason(e.target.value)} autoFocus />
          </Field>
          <Field label={t('dn.rescheduleTo')}>
            <input type="date" value={reschedule} onChange={(e) => setReschedule(e.target.value)} />
          </Field>
        </Modal>
      )}

      {cancelling && (
        <Modal
          title={t('dn.cancel')}
          onClose={() => setCancelling(false)}
          footer={
            <>
              <Button onClick={() => setCancelling(false)}>{t('common.back')}</Button>
              <Button variant="danger" loading={busy} disabled={cancelReason.trim().length < 3} onClick={() => void doCancel()}>
                {t('dn.cancel')}
              </Button>
            </>
          }
        >
          <Field label={t('so.cancelReason')} required>
            <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
}
