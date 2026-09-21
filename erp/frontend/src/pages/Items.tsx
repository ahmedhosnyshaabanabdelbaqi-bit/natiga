import { useState } from 'react';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button } from '../components/ui';
import { money, qty } from '../lib/format';
import { useAuth } from '../lib/auth';

interface ItemRow {
  id: number;
  code: string;
  name_ar: string;
  on_hand: string;
  reserved: string;
  available: string;
  avg_cost?: string;
  reorder_point: string;
  is_active: boolean;
  track_expiry: boolean;
  track_batches: boolean;
  category?: { name: string } | null;
  brand?: { name: string } | null;
  base_uom?: { name_ar: string } | null;
}

export default function Items() {
  const { can, user } = useAuth();
  const list = useList<ItemRow>('/items');
  const [term, setTerm] = useState('');

  const columns: Column<ItemRow>[] = [
    { key: 'code', header: 'الكود', sortable: true, width: '120px' },
    { key: 'name_ar', header: 'اسم الصنف', sortable: true, render: (r) => <span className="bold">{r.name_ar}</span> },
    { key: 'category', header: 'التصنيف', render: (r) => r.category?.name ?? '—', defaultHidden: true },
    { key: 'brand', header: 'العلامة', render: (r) => r.brand?.name ?? '—', defaultHidden: true },
    { key: 'base_uom', header: 'الوحدة', render: (r) => r.base_uom?.name_ar ?? '—' },
    { key: 'on_hand', header: 'الرصيد الفعلي', numeric: true, render: (r) => <span className="num">{qty(r.on_hand)}</span> },
    { key: 'reserved', header: 'المحجوز', numeric: true, render: (r) => <span className="num">{qty(r.reserved)}</span> },
    {
      key: 'available', header: 'المتاح للبيع', numeric: true,
      render: (r) => <span className="num bold">{qty(r.available)}</span>,
    },
    {
      key: 'reorder_point', header: 'حد الطلب', numeric: true, sortable: true,
      render: (r) => (
        <span className={`num ${Number(r.available) < Number(r.reorder_point) ? 'neg bold' : ''}`}>
          {qty(r.reorder_point)}
        </span>
      ),
    },
    ...(user?.can_see_cost
      ? [{
          key: 'avg_cost', header: 'متوسط التكلفة', numeric: true,
          render: (r: ItemRow) => <span className="num">{money(r.avg_cost)}</span>,
        } as Column<ItemRow>]
      : []),
    {
      key: 'flags', header: 'خصائص',
      render: (r) => (
        <span className="row tight">
          {r.track_batches && <Badge>دفعات</Badge>}
          {r.track_expiry && <Badge tone="warn">صلاحية</Badge>}
          {!r.is_active && <Badge tone="danger">غير نشط</Badge>}
        </span>
      ),
      defaultHidden: true,
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>الأصناف</h1>
          <div className="desc">
            المتاح للبيع = الرصيد الصالح للبيع − المحجوز. الحجر والتالف وتحت الفحص لا تدخل ضمنه.
          </div>
        </div>
        <div className="actions">
          <Button variant="primary" disabledReason={can('item.create') ? null : 'لا تملك صلاحية إضافة صنف.'}>
            + صنف جديد
          </Button>
        </div>
      </div>

      <DataTable
        storageKey="items"
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
        emptyTitle="لا توجد أصناف"
        emptyDescription="ابدأ بإضافة الأصناف أو استوردها من ملف Excel."
        toolbar={
          <div className="row">
            <input
              placeholder="بحث بالاسم أو الكود…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.doSearch(term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 220 }}
            />
            <Button size="sm" onClick={() => list.doSearch(term)}>بحث</Button>
            <label className="row tight small">
              <input
                type="checkbox"
                checked={Boolean(list.filters.below_reorder)}
                onChange={(e) => list.setFilter('below_reorder', e.target.checked ? 1 : undefined)}
              />
              النواقص فقط
            </label>
          </div>
        }
      />
    </div>
  );
}
