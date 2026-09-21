import { useState } from 'react';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button } from '../components/ui';
import { money, qty } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

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
  const { t } = useI18n();
  const list = useList<ItemRow>('/items');
  const [term, setTerm] = useState('');

  const columns: Column<ItemRow>[] = [
    { key: 'code', header: t('common.code'), sortable: true, width: '120px' },
    { key: 'name_ar', header: t('common.item'), sortable: true, render: (r) => <span className="bold">{r.name_ar}</span> },
    { key: 'category', header: t('items.category'), render: (r) => r.category?.name ?? '—', defaultHidden: true },
    { key: 'brand', header: t('items.brand'), render: (r) => r.brand?.name ?? '—', defaultHidden: true },
    { key: 'base_uom', header: t('common.unit'), render: (r) => r.base_uom?.name_ar ?? '—' },
    { key: 'on_hand', header: t('items.onHand'), numeric: true, render: (r) => <span className="num">{qty(r.on_hand)}</span> },
    { key: 'reserved', header: t('items.reserved'), numeric: true, render: (r) => <span className="num">{qty(r.reserved)}</span> },
    {
      key: 'available', header: t('items.available'), numeric: true,
      render: (r) => <span className="num bold">{qty(r.available)}</span>,
    },
    {
      key: 'reorder_point', header: t('items.reorderPoint'), numeric: true, sortable: true,
      render: (r) => (
        <span className={`num ${Number(r.available) < Number(r.reorder_point) ? 'neg bold' : ''}`}>
          {qty(r.reorder_point)}
        </span>
      ),
    },
    ...(user?.can_see_cost
      ? [{
          key: 'avg_cost', header: t('items.avgCost'), numeric: true,
          render: (r: ItemRow) => <span className="num">{money(r.avg_cost)}</span>,
        } as Column<ItemRow>]
      : []),
    {
      key: 'flags', header: t('items.flags'),
      render: (r) => (
        <span className="row tight">
          {r.track_batches && <Badge>{t('items.batches')}</Badge>}
          {r.track_expiry && <Badge tone="warn">{t('items.expiry')}</Badge>}
          {!r.is_active && <Badge tone="danger">{t('customers.inactive')}</Badge>}
        </span>
      ),
      defaultHidden: true,
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('items.title')}</h1>
          <div className="desc">{t('items.desc')}</div>
        </div>
        <div className="actions">
          <Button variant="primary" disabledReason={can('item.create') ? null : t('items.noPermissionCreate')}>
            {t('items.new')}
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
        emptyTitle={t('items.empty')}
        emptyDescription={t('items.emptyDesc')}
        toolbar={
          <div className="row">
            <input
              placeholder={t('items.searchPlaceholder')}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.doSearch(term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 220 }}
            />
            <Button size="sm" onClick={() => list.doSearch(term)}>{t('common.search')}</Button>
            <label className="row tight small">
              <input
                type="checkbox"
                checked={Boolean(list.filters.below_reorder)}
                onChange={(e) => list.setFilter('below_reorder', e.target.checked ? 1 : undefined)}
              />
              {t('items.shortagesOnly')}
            </label>
          </div>
        }
      />
    </div>
  );
}
