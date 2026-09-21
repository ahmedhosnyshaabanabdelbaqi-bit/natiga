import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { Alert, Button, Field, useDraft, useUnsavedGuard } from '../components/ui';
import { moneyPlain, today } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { emptyLine, draftTotals, resolveItemForLine, useItemSearch } from '../lib/lineDraft';

export default function NewSalesOrder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { can } = useAuth();
  const { t } = useI18n();

  const [draft, setDraft, clearDraft] = useDraft('new-sales-order', {
    customer_id: params.get('customer') ?? '',
    warehouse_id: '',
    order_date: today(),
    required_date: '',
    customer_po_no: '',
    payment_type: 'credit' as 'credit' | 'cash',
    is_backorder_allowed: true,
    notes: '',
    lines: [emptyLine()],
  });

  const [customers, setCustomers] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string; type: string }>>([]);
  const [credit, setCredit] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [approveNow, setApproveNow] = useState(false);

  const { itemQuery, setItemQuery, itemResults, activeLine, setActiveLine, reset: resetItemSearch } = useItemSearch();

  const dirty = draft.lines.some((l) => l.item_id !== '') || draft.customer_id !== '';
  useUnsavedGuard(dirty && !submitting);

  useEffect(() => {
    void api.get('/customers', { params: { per_page: 200 } })
      .then(({ data }) => setCustomers(data.data))
      .catch(() => undefined);

    void api.get('/stock/balances', { params: { per_page: 200 } })
      .then(({ data }) => {
        const map = new Map<number, { id: number; name: string; type: string }>();
        for (const row of data.data) {
          map.set(row.warehouse_id, { id: row.warehouse_id, name: row.warehouse_name, type: row.warehouse_type });
        }
        setWarehouses([...map.values()]);
      })
      .catch(() => undefined);
  }, []);

  // التعرض الائتماني يُقرأ من الخادم — نفس الحساب الذي سيرفض أو يقبل عند الاعتماد
  useEffect(() => {
    if (!draft.customer_id) { setCredit(null); return; }
    void api.get('/sales-orders/credit-check', { params: { customer_id: draft.customer_id } })
      .then(({ data }) => setCredit(data.data))
      .catch(() => setCredit(null));
  }, [draft.customer_id]);

  const totals = useMemo(() => draftTotals(draft.lines), [draft.lines]);

  const validLines = draft.lines.filter((l) => l.item_id !== '' && Number(l.qty_uom) > 0);

  const problems: string[] = [];
  if (!draft.customer_id) problems.push(t('newInvoice.selectCustomer'));
  if (!draft.warehouse_id) problems.push(t('newInvoice.selectWarehouse'));
  if (validLines.length === 0) problems.push(t('newInvoice.needLine'));

  const overLimit =
    draft.payment_type === 'credit' &&
    credit &&
    Number(credit.total_exposure) + Number(totals.total) > Number(credit.credit_limit);

  const selectItem = async (lineKey: string, item: Record<string, any>) => {
    const resolved = await resolveItemForLine(item.id, draft.customer_id);

    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.key === lineKey
          ? { ...l, item_id: item.id, item_label: `${item.code} — ${item.name_ar}`, ...resolved }
          : l,
      ),
    }));

    resetItemSearch();
  };

  const submit = async () => {
    setTouched(true);
    if (problems.length > 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const { data } = await api.post('/sales-orders', {
        customer_id: Number(draft.customer_id),
        warehouse_id: Number(draft.warehouse_id),
        order_date: draft.order_date,
        required_date: draft.required_date || undefined,
        customer_po_no: draft.customer_po_no || undefined,
        payment_type: draft.payment_type,
        is_backorder_allowed: draft.is_backorder_allowed,
        notes: draft.notes || undefined,
        approve: approveNow || undefined,
        lines: validLines.map((l) => ({
          item_id: Number(l.item_id),
          uom_id: Number(l.uom_id),
          qty_uom: l.qty_uom,
          unit_price: l.is_free ? '0' : l.unit_price,
          discount_pct: l.discount_pct || '0',
          is_free: l.is_free,
        })),
      });

      clearDraft();
      navigate(`/sales-orders/${data.data.id}`);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { width: '100%', padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6 };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('so.title')}</h1>
          <div className="desc">{t('so.desc')}</div>
        </div>
        <div className="actions">
          <Button
            variant="primary"
            loading={submitting}
            disabledReason={
              !can('sales_order.create') ? t('so.noPermissionCreate')
                : problems.length > 0 && touched ? problems[0]
                  : null
            }
            onClick={() => void submit()}
          >
            {approveNow ? t('so.approve') : t('common.save')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert tone="error">
          <strong>{error.message}</strong>
          {error.context && (
            <div className="tiny mt-2">
              {Object.entries(error.context).map(([k, v]) => (
                <div key={k}>{k}: <span className="num">{String(v)}</span></div>
              ))}
            </div>
          )}
        </Alert>
      )}

      {touched && problems.length > 0 && (
        <Alert tone="warn">
          <div className="bold mb-2">{t('newInvoice.completeFields')}</div>
          <ul style={{ paddingInlineStart: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </Alert>
      )}

      {overLimit && (
        <Alert tone="warn">
          {t('newInvoice.overLimitWarning', {
            available: moneyPlain(credit!.available_credit),
            required: moneyPlain(totals.total),
          })}
        </Alert>
      )}

      <div className="card mb-4">
        <div className="card-head"><h2>{t('invoice.data')}</h2></div>
        <div className="card-body">
          <div className="form-row">
            <Field label={t('common.customer')} required error={touched && !draft.customer_id ? t('common.required') : undefined}>
              <select value={draft.customer_id} onChange={(e) => setDraft((d) => ({ ...d, customer_id: e.target.value }))}>
                <option value="">{t('newInvoice.choose')}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </Field>

            <Field label={t('newInvoice.warehouseLabel')} required error={touched && !draft.warehouse_id ? t('common.required') : undefined}>
              <select value={draft.warehouse_id} onChange={(e) => setDraft((d) => ({ ...d, warehouse_id: e.target.value }))}>
                <option value="">{t('newInvoice.choose')}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>

            <Field label={t('so.orderDate')} required>
              <input type="date" value={draft.order_date} onChange={(e) => setDraft((d) => ({ ...d, order_date: e.target.value }))} />
            </Field>

            <Field label={t('so.requiredDate')}>
              <input type="date" value={draft.required_date} onChange={(e) => setDraft((d) => ({ ...d, required_date: e.target.value }))} />
            </Field>

            <Field label={t('invoice.paymentType')} required>
              <select value={draft.payment_type} onChange={(e) => setDraft((d) => ({ ...d, payment_type: e.target.value as 'credit' | 'cash' }))}>
                <option value="credit">{t('invoices.credit')}</option>
                <option value="cash">{t('invoices.cash')}</option>
              </select>
            </Field>
          </div>

          <div className="row mt-2" style={{ gap: 18, flexWrap: 'wrap' }}>
            <label className="row tight small">
              <input
                type="checkbox"
                checked={draft.is_backorder_allowed}
                onChange={(e) => setDraft((d) => ({ ...d, is_backorder_allowed: e.target.checked }))}
              />
              {t('so.backorderAllowed')}
            </label>

            <label className="row tight small">
              <input
                type="checkbox"
                checked={approveNow}
                disabled={!can('sales_order.approve')}
                onChange={(e) => setApproveNow(e.target.checked)}
              />
              {t('so.approve')} — <span className="muted">{t('so.approveHint')}</span>
            </label>
          </div>

          {credit && (
            <div className="row small muted mt-2" style={{ flexWrap: 'wrap' }}>
              <span>{t('so.creditLimit')}: <span className="num">{moneyPlain(credit.credit_limit)}</span></span>
              <span>·</span>
              <span>{t('so.creditExposure')}: <span className="num">{moneyPlain(credit.total_exposure)}</span></span>
              <span>·</span>
              <span>{t('so.uninvoicedOrders')}: <span className="num">{moneyPlain(credit.approved_uninvoiced_orders)}</span></span>
              <span>·</span>
              <span>{t('so.availableCredit')}: <span className="num bold">{moneyPlain(credit.available_credit)}</span></span>
            </div>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-head">
          <h2>{t('invoice.lines')}</h2>
          <div className="spacer" />
          <Button size="sm" onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine()] }))}>
            {t('newInvoice.addLine')}
          </Button>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ minWidth: 240 }}>{t('common.item')}</th>
                <th style={{ width: 130 }}>{t('common.unit')}</th>
                <th className="n" style={{ width: 100 }}>{t('common.qty')}</th>
                <th className="n" style={{ width: 120 }}>{t('common.price')}</th>
                <th className="n" style={{ width: 90 }}>{t('newInvoice.discountPct')}</th>
                <th style={{ width: 70 }}>{t('newInvoice.free')}</th>
                <th className="n" style={{ width: 120 }}>{t('common.total')}</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line) => {
                const gross = Number(line.qty_uom || 0) * Number(line.unit_price || 0);
                const net = line.is_free ? 0 : gross - (gross * Number(line.discount_pct || 0)) / 100;

                return (
                  <tr key={line.key}>
                    <td style={{ position: 'relative' }}>
                      {line.item_id ? (
                        <div className="row tight">
                          <span className="bold small">{line.item_label}</span>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setDraft((d) => ({
                              ...d,
                              lines: d.lines.map((l) => (l.key === line.key ? { ...emptyLine(), key: l.key } : l)),
                            }))}
                          >{t('newInvoice.changeItem')}</button>
                        </div>
                      ) : (
                        <>
                          <input
                            placeholder={t('newInvoice.searchItem')}
                            value={activeLine === line.key ? itemQuery : ''}
                            onFocus={() => setActiveLine(line.key)}
                            onChange={(e) => setItemQuery(e.target.value)}
                            style={inputStyle}
                          />
                          {activeLine === line.key && itemResults.length > 0 && (
                            <div className="search-results" style={{ insetInlineEnd: 'auto', insetInlineStart: 0, width: 300 }}>
                              {itemResults.map((item) => (
                                <div key={item.id} className="row" onMouseDown={() => void selectItem(line.key, item)}>
                                  <div>{item.name_ar}</div>
                                  <div className="meta">{item.code} · {t('newInvoice.availableQty')}: {item.available}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </td>

                    <td>
                      <select
                        value={line.uom_id}
                        disabled={line.uom_options.length === 0}
                        onChange={(e) => setDraft((d) => ({
                          ...d, lines: d.lines.map((l) => (l.key === line.key ? { ...l, uom_id: Number(e.target.value) } : l)),
                        }))}
                        style={inputStyle}
                      >
                        {line.uom_options.length === 0 && <option value="">—</option>}
                        {line.uom_options.map((u) => <option key={u.id} value={u.id}>{u.label} ×{u.factor}</option>)}
                      </select>
                    </td>

                    <td>
                      <input
                        type="number" min="0" step="0.001" value={line.qty_uom}
                        onChange={(e) => setDraft((d) => ({
                          ...d, lines: d.lines.map((l) => (l.key === line.key ? { ...l, qty_uom: e.target.value } : l)),
                        }))}
                        style={{ ...inputStyle, textAlign: 'end' }}
                      />
                    </td>

                    <td>
                      <input
                        type="number" min="0" step="0.01" value={line.unit_price} disabled={line.is_free}
                        onChange={(e) => setDraft((d) => ({
                          ...d, lines: d.lines.map((l) => (l.key === line.key ? { ...l, unit_price: e.target.value } : l)),
                        }))}
                        style={{ ...inputStyle, textAlign: 'end' }}
                      />
                    </td>

                    <td>
                      <input
                        type="number" min="0" max="100" step="0.01" value={line.discount_pct} disabled={line.is_free}
                        onChange={(e) => setDraft((d) => ({
                          ...d, lines: d.lines.map((l) => (l.key === line.key ? { ...l, discount_pct: e.target.value } : l)),
                        }))}
                        style={{ ...inputStyle, textAlign: 'end' }}
                      />
                    </td>

                    <td className="center">
                      <input
                        type="checkbox" checked={line.is_free}
                        onChange={(e) => setDraft((d) => ({
                          ...d, lines: d.lines.map((l) => (l.key === line.key ? { ...l, is_free: e.target.checked } : l)),
                        }))}
                      />
                    </td>

                    <td className="n num bold">{net.toFixed(2)}</td>

                    <td className="center">
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={draft.lines.length === 1}
                        onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))}
                      >×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card-body">
          <div className="row" style={{ justifyContent: 'flex-end', gap: 24 }}>
            <span className="muted">{t('invoice.subtotal')}: <span className="num">{totals.subtotal}</span></span>
            <span className="muted">{t('common.discount')}: <span className="num">{totals.discount}</span></span>
            <span className="bold">{t('common.total')}: <span className="num" style={{ fontSize: 18 }}>{totals.total}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
