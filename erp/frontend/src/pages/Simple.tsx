import { useState } from 'react';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button } from '../components/ui';
import { money, date, statusOf } from '../lib/format';
import { useI18n, type MessageKey } from '../lib/i18n';

/* ---------- الموردون ---------- */

export function Suppliers() {
  const { t } = useI18n();
  const list = useList<any>('/suppliers');
  const [term, setTerm] = useState('');

  const columns: Column<any>[] = [
    { key: 'code', header: t('common.code'), sortable: true, width: '110px' },
    { key: 'name', header: t('common.supplier'), sortable: true, render: (r) => <span className="bold">{r.name}</span> },
    { key: 'phone', header: t('common.phone'), render: (r) => <span className="num">{r.phone ?? '—'}</span> },
    { key: 'payment_term_days', header: t('suppliers.paymentTerm'), numeric: true, render: (r) => t('suppliers.days', { n: r.payment_term_days }) },
    { key: 'lead_time_days', header: t('suppliers.leadTime'), numeric: true, render: (r) => t('suppliers.days', { n: r.lead_time_days }), defaultHidden: true },
    { key: 'is_active', header: t('common.status'), render: (r) => (r.is_active ? <Badge tone="success">{t('customers.active')}</Badge> : <Badge>{t('customers.inactive')}</Badge>) },
  ];

  return (
    <div>
      <div className="page-head"><div><h1>{t('suppliers.title')}</h1></div></div>
      <DataTable
        storageKey="suppliers" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id}
        emptyTitle={t('suppliers.empty')}
        toolbar={
          <div className="row">
            <input
              placeholder={t('common.searchPlaceholder')} value={term} onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.doSearch(term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 200 }}
            />
            <Button size="sm" onClick={() => list.doSearch(term)}>{t('common.search')}</Button>
          </div>
        }
      />
    </div>
  );
}

/* ---------- استلام البضاعة ---------- */

export function GoodsReceipts() {
  const { t } = useI18n();
  const list = useList<any>('/goods-receipts');

  const columns: Column<any>[] = [
    { key: 'receipt_no', header: t('grn.no'), sortable: true, render: (r) => <span className="num bold">{r.receipt_no}</span> },
    { key: 'receipt_date', header: t('common.date'), sortable: true, render: (r) => <span className="num">{date(r.receipt_date)}</span> },
    { key: 'supplier', header: t('common.supplier'), render: (r) => r.supplier?.name ?? '—' },
    { key: 'warehouse', header: t('common.warehouse'), render: (r) => r.warehouse?.name ?? '—' },
    { key: 'total_cost', header: t('grn.value'), numeric: true, render: (r) => <span className="num">{money(r.total_cost)}</span> },
    {
      key: 'is_invoiced', header: t('grn.invoicing'),
      render: (r) => (r.is_invoiced ? <Badge tone="success">{t('grn.invoiced')}</Badge> : <Badge tone="warn">{t('grn.notInvoiced')}</Badge>),
    },
    {
      key: 'status', header: t('common.status'),
      render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; },
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('grn.title')}</h1>
          <div className="desc">{t('grn.desc')}</div>
        </div>
      </div>
      <DataTable
        storageKey="goods-receipts" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id}
        emptyTitle={t('grn.empty')}
        toolbar={
          <label className="row tight small">
            <input
              type="checkbox"
              checked={Boolean(list.filters.uninvoiced_only)}
              onChange={(e) => list.setFilter('uninvoiced_only', e.target.checked ? 1 : undefined)}
            />
            {t('grn.uninvoicedOnly')}
          </label>
        }
      />
    </div>
  );
}

/* ---------- فواتير الموردين ---------- */

export function SupplierInvoices() {
  const { t } = useI18n();
  const list = useList<any>('/supplier-invoices');

  const columns: Column<any>[] = [
    { key: 'invoice_no', header: t('pinv.no'), sortable: true, render: (r) => <span className="num bold">{r.invoice_no}</span> },
    { key: 'supplier_invoice_no', header: t('pinv.supplierNo'), render: (r) => <span className="num">{r.supplier_invoice_no ?? '—'}</span>, defaultHidden: true },
    { key: 'invoice_date', header: t('common.date'), sortable: true, render: (r) => <span className="num">{date(r.invoice_date)}</span> },
    { key: 'due_date', header: t('invoice.dueDate'), render: (r) => <span className="num">{date(r.due_date)}</span> },
    { key: 'supplier', header: t('common.supplier'), render: (r) => r.supplier?.name ?? '—' },
    { key: 'total_amount', header: t('common.total'), numeric: true, sortable: true, render: (r) => <span className="num">{money(r.total_amount)}</span> },
    { key: 'paid_amount', header: t('invoices.paid'), numeric: true, render: (r) => <span className="num">{money(r.paid_amount)}</span> },
    {
      key: 'outstanding', header: t('invoices.outstanding'), numeric: true,
      render: (r) => {
        const rest = Number(r.total_amount) - Number(r.paid_amount) - Number(r.returned_amount ?? 0);
        return <span className={`num bold ${rest > 0 ? 'neg' : 'pos'}`}>{money(rest.toFixed(4))}</span>;
      },
    },
    { key: 'status', header: t('common.status'), render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ];

  return (
    <div>
      <div className="page-head"><div><h1>{t('pinv.title')}</h1></div></div>
      <DataTable
        storageKey="supplier-invoices" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id} emptyTitle={t('pinv.empty')}
      />
    </div>
  );
}

/* ---------- سندات القبض ---------- */

export function Receipts() {
  const { t } = useI18n();
  const list = useList<any>('/customer-receipts');

  const METHOD_KEYS: Record<string, MessageKey> = {
    cash: 'receipts.method.cash',
    bank_transfer: 'receipts.method.bank_transfer',
    cheque: 'receipts.method.cheque',
    card: 'receipts.method.card',
  };

  const columns: Column<any>[] = [
    { key: 'voucher_no', header: t('receipts.no'), sortable: true, render: (r) => <span className="num bold">{r.voucher_no}</span> },
    { key: 'field_no', header: t('invoices.fieldNo'), render: (r) => <span className="num">{r.field_no ?? '—'}</span>, defaultHidden: true },
    { key: 'receipt_date', header: t('common.date'), sortable: true, render: (r) => <span className="num">{date(r.receipt_date)}</span> },
    { key: 'customer', header: t('common.customer'), render: (r) => r.customer?.name ?? '—' },
    { key: 'salesman', header: t('receipts.collector'), render: (r) => r.salesman?.name ?? '—' },
    {
      key: 'payment_method', header: t('receipts.method'),
      render: (r) => (
        <span>
          {METHOD_KEYS[r.payment_method] ? t(METHOD_KEYS[r.payment_method]) : r.payment_method}
          {r.payment_method === 'cheque' && <> <Badge tone="warn">{t('receipts.notConfirmedCash')}</Badge></>}
        </span>
      ),
    },
    { key: 'amount', header: t('common.amount'), numeric: true, sortable: true, render: (r) => <span className="num bold">{money(r.amount)}</span> },
    { key: 'allocated_amount', header: t('receipts.allocated'), numeric: true, render: (r) => <span className="num">{money(r.allocated_amount)}</span> },
    { key: 'status', header: t('common.status'), render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('receipts.title')}</h1>
          <div className="desc">{t('receipts.desc')}</div>
        </div>
      </div>
      <DataTable
        storageKey="receipts" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id} emptyTitle={t('receipts.empty')}
        toolbar={
          <div className="row">
            <input type="date" className="btn btn-sm" value={String(list.filters.from ?? '')} onChange={(e) => list.setFilter('from', e.target.value)} />
            <input type="date" className="btn btn-sm" value={String(list.filters.to ?? '')} onChange={(e) => list.setFilter('to', e.target.value)} />
          </div>
        }
      />
    </div>
  );
}

/* ---------- التحويلات المخزنية ---------- */

export function Transfers() {
  const { t } = useI18n();
  const list = useList<any>('/stock/transfers');

  const PURPOSE_KEYS: Record<string, MessageKey> = {
    van_load: 'transfers.purpose.van_load',
    van_return: 'transfers.purpose.van_return',
    inter_warehouse: 'transfers.purpose.inter_warehouse',
    van_to_van: 'transfers.purpose.van_to_van',
  };

  const columns: Column<any>[] = [
    { key: 'transfer_no', header: t('transfers.no'), sortable: true, render: (r) => <span className="num bold">{r.transfer_no}</span> },
    { key: 'transfer_date', header: t('common.date'), sortable: true, render: (r) => <span className="num">{date(r.transfer_date)}</span> },
    { key: 'from', header: t('transfers.fromWh'), render: (r) => r.from_warehouse?.name ?? '—' },
    { key: 'to', header: t('transfers.toWh'), render: (r) => r.to_warehouse?.name ?? '—' },
    { key: 'purpose', header: t('transfers.purpose'), render: (r) => (PURPOSE_KEYS[r.purpose] ? t(PURPOSE_KEYS[r.purpose]) : r.purpose) },
    { key: 'status', header: t('common.status'), render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('transfers.title')}</h1>
          <div className="desc">{t('transfers.desc')}</div>
        </div>
      </div>
      <DataTable
        storageKey="transfers" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id} emptyTitle={t('transfers.empty')}
        toolbar={
          <select className="btn btn-sm" value={String(list.filters.status ?? '')} onChange={(e) => list.setFilter('status', e.target.value || undefined)}>
            <option value="">{t('common.allStatuses')}</option>
            <option value="draft">{t('transfers.status.draft')}</option>
            <option value="sent">{t('transfers.status.sent')}</option>
            <option value="partially_received">{t('transfers.status.partial')}</option>
            <option value="received">{t('transfers.status.received')}</option>
          </select>
        }
      />
    </div>
  );
}
