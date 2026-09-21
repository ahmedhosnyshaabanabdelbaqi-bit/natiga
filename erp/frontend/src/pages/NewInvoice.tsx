import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { Alert, Button, Field, useDraft, useUnsavedGuard } from '../components/ui';
import { money, moneyPlain, today } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

interface LineDraft {
  key: string;
  item_id: number | '';
  item_label: string;
  uom_id: number | '';
  uom_options: Array<{ id: number; label: string; factor: string }>;
  qty_uom: string;
  unit_price: string;
  discount_pct: string;
  is_free: boolean;
}

interface Totals {
  subtotal: string;
  discount: string;
  total: string;
}

const emptyLine = (): LineDraft => ({
  key: Math.random().toString(36).slice(2),
  item_id: '', item_label: '', uom_id: '', uom_options: [],
  qty_uom: '1', unit_price: '0', discount_pct: '0', is_free: false,
});

export default function NewInvoice() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, can } = useAuth();
  const { t } = useI18n();

  const [draft, setDraft, clearDraft] = useDraft('new-invoice', {
    customer_id: params.get('customer') ?? '',
    warehouse_id: '',
    invoice_date: today(),
    payment_type: 'credit' as 'credit' | 'cash',
    notes: '',
    lines: [emptyLine()],
  });

  const [customers, setCustomers] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string; type: string }>>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [itemResults, setItemResults] = useState<Array<Record<string, any>>>([]);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [credit, setCredit] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const dirty = draft.lines.some((l) => l.item_id !== '') || draft.customer_id !== '';
  useUnsavedGuard(dirty && !submitting);

  useEffect(() => {
    void api.get('/customers', { params: { per_page: 200 } })
      .then(({ data }) => setCustomers(data.data))
      .catch(() => undefined);

    void api.get('/stock/balances', { params: { per_page: 1 } }).catch(() => undefined);

    // المخازن المتاحة تُشتق من الأرصدة المسموح بها للمستخدم
    void api.get('/stock/buckets').catch(() => undefined);

    void api.get('/items', { params: { per_page: 1 } }).catch(() => undefined);
  }, []);

  useEffect(() => {
    // مخزن المندوب الافتراضي هو سيارته
    if (!draft.warehouse_id && user?.salesman?.warehouse_id) {
      setDraft((d) => ({ ...d, warehouse_id: String(user.salesman!.warehouse_id) }));
    }
  }, [user, draft.warehouse_id, setDraft]);

  useEffect(() => {
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

  useEffect(() => {
    if (!draft.customer_id) { setCredit(null); return; }
    void api.get(`/customers/${draft.customer_id}`)
      .then(({ data }) => setCredit(data.data.credit))
      .catch(() => setCredit(null));
  }, [draft.customer_id]);

  useEffect(() => {
    if (itemQuery.trim().length < 2) { setItemResults([]); return; }
    const timer = window.setTimeout(() => {
      void api.get('/items', { params: { search: itemQuery, per_page: 8 } })
        .then(({ data }) => setItemResults(data.data))
        .catch(() => setItemResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [itemQuery]);

  const totals: Totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    for (const line of draft.lines) {
      if (line.is_free) continue;
      const gross = Number(line.qty_uom || 0) * Number(line.unit_price || 0);
      const disc = (gross * Number(line.discount_pct || 0)) / 100;
      subtotal += gross;
      discount += disc;
    }
    return {
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      total: (subtotal - discount).toFixed(2),
    };
  }, [draft.lines]);

  const overLimit =
    draft.payment_type === 'credit' &&
    credit &&
    Number(credit.total_exposure) + Number(totals.total) > Number(credit.credit_limit);

  const validLines = draft.lines.filter((l) => l.item_id !== '' && Number(l.qty_uom) > 0);

  const problems: string[] = [];
  if (!draft.customer_id) problems.push(t('newInvoice.selectCustomer'));
  if (!draft.warehouse_id) problems.push(t('newInvoice.selectWarehouse'));
  if (validLines.length === 0) problems.push(t('newInvoice.needLine'));

  const selectItem = async (lineKey: string, item: Record<string, any>) => {
    const { data } = await api.get(`/items/${item.id}`);
    const detail = data.data;

    const options = (detail.uoms ?? []).map((u: any) => ({
      id: u.uom_id,
      label: u.uom?.name_ar ?? String(u.uom_id),
      factor: u.factor,
    }));

    const defaultUom = options[0]?.id ?? '';
    let price = '0';

    if (defaultUom && draft.customer_id) {
      try {
        const { data: priceData } = await api.get('/items/price', {
          params: { item_id: item.id, uom_id: defaultUom, qty: 1, customer_id: draft.customer_id },
        });
        price = priceData.data.price;
      } catch { /* السعر يُدخل يدويًا إن لم توجد قاعدة */ }
    }

    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.key === lineKey
          ? { ...l, item_id: item.id, item_label: `${item.code} — ${item.name_ar}`, uom_id: defaultUom, uom_options: options, unit_price: price }
          : l,
      ),
    }));

    setItemQuery('');
    setItemResults([]);
    setActiveLine(null);
  };

  const submit = async () => {
    setTouched(true);
    if (problems.length > 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const { data } = await api.post('/sales-invoices', {
        customer_id: Number(draft.customer_id),
        warehouse_id: Number(draft.warehouse_id),
        invoice_date: draft.invoice_date,
        payment_type: draft.payment_type,
        channel: user?.salesman ? 'van_sale' : 'counter',
        notes: draft.notes || undefined,
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
      navigate(`/sales-invoices/${data.data.id}`);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('newInvoice.title')}</h1>
          <div className="desc">{t('newInvoice.desc')}</div>
        </div>
        <div className="actions">
          <Button onClick={() => { clearDraft(); setDraft({ customer_id: '', warehouse_id: '', invoice_date: today(), payment_type: 'credit', notes: '', lines: [emptyLine()] }); }}>
            {t('newInvoice.clearDraft')}
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabledReason={
              !can('sales_invoice.create') ? t('invoices.noPermissionCreate')
                : problems.length > 0 && touched ? problems[0]
                  : null
            }
            onClick={() => void submit()}
          >
            {t('newInvoice.savePost')}
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
          <ul style={{ paddingInlineStart: 18 }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
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
        <div className="card-head"><h2>{t('newInvoice.invoiceData')}</h2></div>
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
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}{w.type === 'van' ? ` (${t('stock.van')})` : ''}</option>
                ))}
              </select>
            </Field>

            <Field label={t('common.date')} required>
              <input type="date" value={draft.invoice_date} onChange={(e) => setDraft((d) => ({ ...d, invoice_date: e.target.value }))} />
            </Field>

            <Field label={t('invoice.paymentType')} required help={draft.payment_type === 'credit' ? t('newInvoice.creditHint') : t('newInvoice.cashHint')}>
              <select value={draft.payment_type} onChange={(e) => setDraft((d) => ({ ...d, payment_type: e.target.value as 'credit' | 'cash' }))}>
                <option value="credit">{t('invoices.credit')}</option>
                <option value="cash">{t('invoices.cash')}</option>
              </select>
            </Field>
          </div>

          {credit && (
            <div className="row small muted mt-2">
              <span>{t('customers.creditLimit')}: <span className="num">{moneyPlain(credit.credit_limit)}</span></span>
              <span>·</span>
              <span>{t('newInvoice.currentExposure')}: <span className="num">{moneyPlain(credit.total_exposure)}</span></span>
              <span>·</span>
              <span>{t('newInvoice.available')}: <span className="num bold">{moneyPlain(credit.available_credit)}</span></span>
            </div>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-head">
          <h2>{t('invoice.lines')}</h2>
          <div className="spacer" />
          <Button size="sm" onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine()] }))}>{t('newInvoice.addLine')}</Button>
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
                            style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6 }}
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
                          ...d,
                          lines: d.lines.map((l) => (l.key === line.key ? { ...l, uom_id: Number(e.target.value) } : l)),
                        }))}
                        style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6 }}
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
                        style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, textAlign: 'end' }}
                      />
                    </td>

                    <td>
                      <input
                        type="number" min="0" step="0.01" value={line.unit_price} disabled={line.is_free}
                        onChange={(e) => setDraft((d) => ({
                          ...d, lines: d.lines.map((l) => (l.key === line.key ? { ...l, unit_price: e.target.value } : l)),
                        }))}
                        style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, textAlign: 'end' }}
                      />
                    </td>

                    <td>
                      <input
                        type="number" min="0" max="100" step="0.01" value={line.discount_pct} disabled={line.is_free}
                        onChange={(e) => setDraft((d) => ({
                          ...d, lines: d.lines.map((l) => (l.key === line.key ? { ...l, discount_pct: e.target.value } : l)),
                        }))}
                        style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, textAlign: 'end' }}
                      />
                    </td>

                    <td className="center">
                      <input
                        type="checkbox" checked={line.is_free}
                        title={t('newInvoice.freeHint')}
                        onChange={(e) => setDraft((d) => ({
                          ...d, lines: d.lines.map((l) => (l.key === line.key ? { ...l, is_free: e.target.checked } : l)),
                        }))}
                      />
                    </td>

                    <td className="n num bold">{net.toFixed(2)}</td>

                    <td>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={draft.lines.length === 1}
                        onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))}
                      >✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="row" style={{ justifyContent: 'flex-start', gap: 32 }}>
            <div><div className="small muted">{t('newInvoice.beforeDiscount')}</div><div className="num bold">{money(totals.subtotal)}</div></div>
            <div><div className="small muted">{t('common.discount')}</div><div className="num bold">{money(totals.discount)}</div></div>
            <div><div className="small muted">{t('newInvoice.net')}</div><div className="num bold" style={{ fontSize: 20 }}>{money(totals.total)}</div></div>
          </div>
          <div className="tiny faint mt-3">{t('newInvoice.estimateNote')}</div>
        </div>
      </div>
    </div>
  );
}
