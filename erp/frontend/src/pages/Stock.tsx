import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Alert, Badge } from '../components/ui';
import { money, qty, date, statusOf } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

interface BalanceRow {
  id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  warehouse_id: number;
  warehouse_name: string;
  warehouse_type: string;
  batch_no: string | null;
  expiry_date: string | null;
  status_bucket: string;
  qty_base: string;
  total_value?: string;
}

export default function Stock() {
  const { user } = useAuth();
  const { t } = useI18n();
  const list = useList<BalanceRow>('/stock/balances');
  const [term, setTerm] = useState('');
  const [buckets, setBuckets] = useState<Array<{ key: string; label: string; sellable: boolean }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    void api.get('/stock/buckets').then(({ data }) => setBuckets(data.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const map = new Map<number, { id: number; name: string }>();
    for (const row of list.rows) map.set(row.warehouse_id, { id: row.warehouse_id, name: row.warehouse_name });
    if (map.size > 0) setWarehouses((prev) => (prev.length >= map.size ? prev : [...map.values()]));
  }, [list.rows]);

  const columns: Column<BalanceRow>[] = [
    { key: 'item_code', header: t('common.code'), width: '110px', render: (r) => <span className="num">{r.item_code}</span> },
    { key: 'item_name', header: t('common.item'), render: (r) => <span className="bold">{r.item_name}</span> },
    { key: 'warehouse_name', header: t('common.warehouse'), render: (r) => (
      <span>{r.warehouse_name}{r.warehouse_type === 'van' && <> <Badge tone="info">{t('stock.van')}</Badge></>}</span>
    ) },
    { key: 'batch_no', header: t('stock.batch'), render: (r) => <span className="num">{r.batch_no ?? '—'}</span>, defaultHidden: true },
    {
      key: 'expiry_date', header: t('stock.expiryDate'),
      render: (r) => {
        if (!r.expiry_date) return '—';
        const expired = new Date(r.expiry_date) <= new Date();
        return <span className={`num ${expired ? 'neg bold' : ''}`}>{date(r.expiry_date)}</span>;
      },
      defaultHidden: true,
    },
    {
      key: 'status_bucket', header: t('common.status'),
      render: (r) => {
        const s = statusOf(r.status_bucket);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: 'qty_base', header: t('common.qty'), numeric: true, render: (r) => <span className="num bold">{qty(r.qty_base)}</span> },
    ...(user?.can_see_cost
      ? [{ key: 'total_value', header: t('stock.value'), numeric: true, render: (r: BalanceRow) => <span className="num">{money(r.total_value)}</span> } as Column<BalanceRow>]
      : []),
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('stock.title')}</h1>
          <div className="desc">{t('stock.desc')}</div>
        </div>
      </div>

      <Alert tone="info">{t('stock.bucketsNote')}</Alert>

      <DataTable
        storageKey="stock-balances"
        columns={columns}
        rows={list.rows}
        meta={list.meta}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onPage={list.setPage}
        rowKey={(r) => r.id}
        emptyTitle={t('stock.empty')}
        emptyDescription={t('stock.emptyDesc')}
        toolbar={
          <div className="row">
            <input
              placeholder={t('stock.searchItem')}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.setFilter('search', term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 200 }}
            />
            <select className="btn btn-sm" value={String(list.filters.warehouse_id ?? '')} onChange={(e) => list.setFilter('warehouse_id', e.target.value || undefined)}>
              <option value="">{t('stock.allWarehouses')}</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select className="btn btn-sm" value={String(list.filters.status_bucket ?? '')} onChange={(e) => list.setFilter('status_bucket', e.target.value || undefined)}>
              <option value="">{t('common.allStatuses')}</option>
              {buckets.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </div>
        }
      />
    </div>
  );
}
