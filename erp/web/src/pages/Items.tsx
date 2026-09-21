import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { ItemRow, Paginated } from '../api/types';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  type Column,
} from '../components/ui';
import { useDebounced } from '../hooks/useDebounced';
import { useTableState } from '../hooks/useTableState';
import { useAuth } from '../hooks/useAuth';
import { amount, qty } from '../lib/format';

export function Items() {
  const { can } = useAuth();
  const table = useTableState('items');
  const [search, setSearch] = useState(table.state.q);
  const debouncedSearch = useDebounced(search);
  const showCost = can('inventory.cost.view');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['items', { ...table.params, q: debouncedSearch }],
    queryFn: async () =>
      (
        await api.get<Paginated<ItemRow>>('/items', {
          params: { ...table.params, q: debouncedSearch || undefined },
        })
      ).data,
  });

  const columns: Column<ItemRow>[] = [
    {
      key: 'code',
      header: 'الكود',
      sortable: true,
      render: (row) => <span className="num">{row.code}</span>,
    },
    {
      key: 'name',
      header: 'اسم الصنف',
      sortable: true,
      render: (row) => (
        <div>
          <div>{row.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
            {[row.category, row.brand].filter(Boolean).join(' • ') || '—'}
          </div>
        </div>
      ),
    },
    { key: 'base_unit', header: 'الوحدة', render: (row) => row.base_unit ?? '—' },
    {
      key: 'properties',
      header: 'خصائص',
      render: (row) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {row.track_batches && <span className="badge badge-brand">تشغيلات</span>}
          {row.track_expiry && <span className="badge badge-warn">صلاحية</span>}
          {row.is_weighted && <span className="badge badge-neutral">وزن/طول</span>}
        </div>
      ),
    },
    {
      key: 'qty_on_hand',
      header: 'الرصيد',
      align: 'end',
      render: (row) => <span className="num">{qty(row.qty_on_hand)}</span>,
    },
    {
      key: 'reorder_point',
      header: 'حد الطلب',
      align: 'end',
      sortable: true,
      render: (row) => {
        const below = Number(row.qty_on_hand) <= Number(row.reorder_point)
          && Number(row.reorder_point) > 0;
        return (
          <span className="num" style={below ? { color: 'var(--danger)', fontWeight: 600 } : {}}>
            {qty(row.reorder_point)}
          </span>
        );
      },
    },
    {
      key: 'default_sale_price',
      header: 'سعر البيع',
      align: 'end',
      sortable: true,
      render: (row) => <span className="num">{amount(row.default_sale_price)}</span>,
    },
  ];

  // The cost columns are only added when the server actually sends them — the
  // payload itself is filtered by permission, not just the display.
  if (showCost) {
    columns.push(
      {
        key: 'avg_cost',
        header: 'متوسط التكلفة',
        align: 'end',
        render: (row) => <span className="num">{amount(row.avg_cost)}</span>,
      },
      {
        key: 'stock_value',
        header: 'قيمة المخزون',
        align: 'end',
        render: (row) => <span className="num">{amount(row.stock_value)}</span>,
      },
    );
  }

  columns.push({
    key: 'status',
    header: 'الحالة',
    render: (row) => (
      <span className={`badge badge-${row.status === 'active' ? 'ok' : 'neutral'}`}>
        {row.status === 'active' ? 'نشط' : row.status === 'suspended' ? 'موقوف' : 'موقوف نهائيًا'}
      </span>
    ),
  });

  return (
    <>
      <PageHeader
        title="الأصناف"
        subtitle="ملف الأصناف والوحدات والأرصدة"
        breadcrumb={['المخازن', 'الأصناف']}
      />

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <input
              className="input"
              type="search"
              placeholder="بحث بالكود أو الاسم…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                table.setSearch(event.target.value);
              }}
              aria-label="بحث"
            />

            <select
              className="select"
              value={table.state.filters.status ?? ''}
              onChange={(event) => table.setFilter('status', event.target.value)}
              aria-label="تصفية بالحالة"
            >
              <option value="">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="suspended">موقوف</option>
              <option value="discontinued">موقوف نهائيًا</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={table.state.filters.below_reorder === '1'}
                onChange={(event) =>
                  table.setFilter('below_reorder', event.target.checked ? '1' : '')
                }
              />
              تحت حد الطلب فقط
            </label>

            <button type="button" className="btn btn-sm" onClick={table.reset}>
              إعادة ضبط
            </button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            title="لا توجد أصناف مطابقة"
            hint="جرّب تغيير كلمة البحث أو إلغاء التصفية."
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data.data}
              rowKey={(row) => row.id}
              sort={table.state.sort}
              direction={table.state.direction}
              onSort={table.toggleSort}
            />
            <Pagination
              page={data.meta.current_page}
              lastPage={data.meta.last_page}
              total={data.meta.total}
              from={data.meta.from}
              to={data.meta.to}
              perPage={data.meta.per_page}
              onPage={table.setPage}
              onPerPage={table.setPerPage}
            />
          </>
        )}
      </div>
    </>
  );
}
