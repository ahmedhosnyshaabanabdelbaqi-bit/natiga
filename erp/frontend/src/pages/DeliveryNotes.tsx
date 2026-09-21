import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/ui';
import { date, statusOf, startOfMonth, today } from '../lib/format';
import { useI18n } from '../lib/i18n';

interface NoteRow {
  id: number;
  delivery_no: string;
  delivery_date: string;
  status: string;
  is_invoiced: boolean;
  receiver_name: string | null;
  customer?: { id: number; code: string; name: string };
  salesman?: { id: number; name: string } | null;
  warehouse?: { id: number; name: string } | null;
  vehicle?: { id: number; plate_no: string } | null;
}

export default function DeliveryNotes() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const list = useList<NoteRow>('/delivery-notes', { from: startOfMonth(), to: today() });
  const [term, setTerm] = useState('');

  const columns: Column<NoteRow>[] = [
    { key: 'delivery_no', header: t('dn.no'), sortable: true, render: (r) => <span className="num bold">{r.delivery_no}</span> },
    { key: 'delivery_date', header: t('dn.deliveryDate'), sortable: true, render: (r) => <span className="num">{date(r.delivery_date)}</span> },
    { key: 'customer', header: t('common.customer'), render: (r) => r.customer?.name ?? '—' },
    { key: 'warehouse', header: t('common.warehouse'), render: (r) => r.warehouse?.name ?? '—', defaultHidden: true },
    { key: 'salesman', header: t('common.salesman'), render: (r) => r.salesman?.name ?? '—', defaultHidden: true },
    { key: 'vehicle', header: t('dn.vehicle'), render: (r) => r.vehicle?.plate_no ?? '—', defaultHidden: true },
    { key: 'receiver_name', header: t('dn.receiver'), render: (r) => r.receiver_name ?? '—' },
    {
      key: 'status', header: t('common.status'),
      render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; },
    },
    {
      key: 'is_invoiced', header: t('so.invoiceStatus'),
      render: (r) => (r.is_invoiced
        ? <Badge tone="success">{t('status.invoiced')}</Badge>
        : <Badge tone="warn">{t('status.pending')}</Badge>),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('dn.title')}</h1>
          <div className="desc">{t('dn.desc')}</div>
        </div>
      </div>

      <DataTable
        storageKey="delivery-notes"
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
        onRowClick={(r) => navigate(`/delivery-notes/${r.id}`)}
        emptyTitle={t('dn.empty')}
        emptyDescription={t('dn.emptyDesc')}
        toolbar={
          <div className="row">
            <input
              placeholder={t('dn.searchPlaceholder')}
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
              <option value="out_for_delivery">{t('status.out_for_delivery')}</option>
              <option value="delivered">{t('status.delivered')}</option>
              <option value="partially_delivered">{t('status.partially_delivered')}</option>
              <option value="failed">{t('status.failed')}</option>
              <option value="cancelled">{t('status.cancelled')}</option>
            </select>
            <label className="row tight small">
              <input
                type="checkbox"
                checked={Boolean(list.filters.uninvoiced_only)}
                onChange={(e) => list.setFilter('uninvoiced_only', e.target.checked ? 1 : undefined)}
              />
              {t('dn.uninvoicedOnly')}
            </label>
          </div>
        }
      />
    </div>
  );
}
