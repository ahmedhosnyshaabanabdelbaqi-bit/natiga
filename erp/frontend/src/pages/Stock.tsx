import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Alert, Badge } from '../components/ui';
import { money, qty, date, statusOf } from '../lib/format';
import { useAuth } from '../lib/auth';

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
    { key: 'item_code', header: 'الكود', width: '110px', render: (r) => <span className="num">{r.item_code}</span> },
    { key: 'item_name', header: 'الصنف', render: (r) => <span className="bold">{r.item_name}</span> },
    { key: 'warehouse_name', header: 'المخزن', render: (r) => (
      <span>{r.warehouse_name}{r.warehouse_type === 'van' && <> <Badge tone="info">سيارة</Badge></>}</span>
    ) },
    { key: 'batch_no', header: 'الدفعة', render: (r) => <span className="num">{r.batch_no ?? '—'}</span>, defaultHidden: true },
    {
      key: 'expiry_date', header: 'الصلاحية',
      render: (r) => {
        if (!r.expiry_date) return '—';
        const expired = new Date(r.expiry_date) <= new Date();
        return <span className={`num ${expired ? 'neg bold' : ''}`}>{date(r.expiry_date)}</span>;
      },
      defaultHidden: true,
    },
    {
      key: 'status_bucket', header: 'الحالة',
      render: (r) => {
        const s = statusOf(r.status_bucket);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: 'qty_base', header: 'الكمية', numeric: true, render: (r) => <span className="num bold">{qty(r.qty_base)}</span> },
    ...(user?.can_see_cost
      ? [{ key: 'total_value', header: 'القيمة', numeric: true, render: (r: BalanceRow) => <span className="num">{money(r.total_value)}</span> } as Column<BalanceRow>]
      : []),
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>أرصدة المخازن</h1>
          <div className="desc">كل رصيد مرتبط بمخزن وحالة ودفعة. لا يمكن تعديل الرصيد مباشرة؛ التغيير يكون بمستند وحركة.</div>
        </div>
      </div>

      <Alert tone="info">
        الحجر والتالف وتحت الفحص لا تُضم إلى المتاح للبيع. البضاعة بالطريق تظهر في مخزن «بضاعة بالطريق» ولا تظهر في المخزنين معًا.
      </Alert>

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
        emptyTitle="لا توجد أرصدة"
        emptyDescription="لم تُسجَّل حركات مخزنية بعد، أو لا توجد نتائج مطابقة."
        toolbar={
          <div className="row">
            <input
              placeholder="بحث عن صنف…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.setFilter('search', term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 200 }}
            />
            <select className="btn btn-sm" value={String(list.filters.warehouse_id ?? '')} onChange={(e) => list.setFilter('warehouse_id', e.target.value || undefined)}>
              <option value="">كل المخازن</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select className="btn btn-sm" value={String(list.filters.status_bucket ?? '')} onChange={(e) => list.setFilter('status_bucket', e.target.value || undefined)}>
              <option value="">كل الحالات</option>
              {buckets.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </div>
        }
      />
    </div>
  );
}
