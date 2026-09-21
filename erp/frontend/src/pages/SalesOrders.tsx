import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button } from '../components/ui';
import { money, date, statusOf, startOfMonth, today } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

interface OrderRow {
  id: number;
  order_no: string;
  order_date: string;
  required_date: string | null;
  status: string;
  delivery_status: string;
  invoice_status: string;
  payment_type: string;
  total_amount: string;
  customer_po_no: string | null;
  customer?: { id: number; code: string; name: string };
  salesman?: { id: number; name: string } | null;
  warehouse?: { id: number; name: string } | null;
}

export default function SalesOrders() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { t } = useI18n();
  const list = useList<OrderRow>('/sales-orders', { from: startOfMonth(), to: today() });
  const [term, setTerm] = useState('');

  const columns: Column<OrderRow>[] = [
    { key: 'order_no', header: t('so.no'), sortable: true, render: (r) => <span className="num bold">{r.order_no}</span> },
    { key: 'order_date', header: t('so.orderDate'), sortable: true, render: (r) => <span className="num">{date(r.order_date)}</span> },
    { key: 'required_date', header: t('so.requiredDate'), render: (r) => <span className="num">{r.required_date ? date(r.required_date) : '—'}</span>, defaultHidden: true },
    { key: 'customer', header: t('common.customer'), render: (r) => r.customer?.name ?? '—' },
    { key: 'salesman', header: t('common.salesman'), render: (r) => r.salesman?.name ?? '—', defaultHidden: true },
    { key: 'customer_po_no', header: t('so.no'), render: (r) => r.customer_po_no ?? '—', defaultHidden: true },
    { key: 'total_amount', header: t('common.total'), numeric: true, sortable: true, render: (r) => <span className="num">{money(r.total_amount)}</span> },
    {
      key: 'status', header: t('common.status'),
      render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; },
    },
    {
      // الحالات الثلاث مستقلة: أمر مسلَّم بالكامل قد يكون غير مفوتر
      key: 'delivery_status', header: t('so.deliveryStatus'),
      render: (r) => { const s = statusOf(r.delivery_status); return <Badge tone={s.tone}>{s.label}</Badge>; },
    },
    {
      key: 'invoice_status', header: t('so.invoiceStatus'),
      render: (r) => { const s = statusOf(r.invoice_status); return <Badge tone={s.tone}>{s.label}</Badge>; },
    },
  ];

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
            disabledReason={can('sales_order.create') ? null : t('so.noPermissionCreate')}
            onClick={() => navigate('/sales-orders/new')}
          >
            {t('so.title')} +
          </Button>
        </div>
      </div>

      <DataTable
        storageKey="sales-orders"
        columns={columns}
        rows={list.rows}
        meta={list.meta}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onPage={list.setPage}
        onSort={(key, direction) => list.setSort({ key, direction })}
        sort={list.sort}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/sales-orders/${r.id}`)}
        emptyTitle={t('so.empty')}
        emptyDescription={t('so.emptyDesc')}
        toolbar={
          <div className="row">
            <input
              placeholder={t('so.searchPlaceholder')}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.doSearch(term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 170 }}
            />
            <input type="date" className="btn btn-sm" value={String(list.filters.from ?? '')} onChange={(e) => list.setFilter('from', e.target.value)} />
            <input type="date" className="btn btn-sm" value={String(list.filters.to ?? '')} onChange={(e) => list.setFilter('to', e.target.value)} />
            <select className="btn btn-sm" value={String(list.filters.status ?? '')} onChange={(e) => list.setFilter('status', e.target.value || undefined)}>
              <option value="">{t('common.allStatuses')}</option>
              <option value="draft">{t('status.draft')}</option>
              <option value="approved">{t('status.approved')}</option>
              <option value="closed">{t('status.closed')}</option>
              <option value="cancelled">{t('status.cancelled')}</option>
            </select>
            <label className="row tight small">
              <input
                type="checkbox"
                checked={Boolean(list.filters.open_only)}
                onChange={(e) => list.setFilter('open_only', e.target.checked ? 1 : undefined)}
              />
              {t('so.openOnly')}
            </label>
          </div>
        }
      />
    </div>
  );
}
