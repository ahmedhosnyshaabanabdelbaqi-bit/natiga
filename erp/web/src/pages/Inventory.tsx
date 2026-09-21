import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Paginated, StockBalanceRow } from '../api/types';
import {
  Alert,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  type Column,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useDebounced } from '../hooks/useDebounced';
import { useTableState } from '../hooks/useTableState';
import { amount, date, qty } from '../lib/format';

interface WarehouseOption {
  id: number;
  code: string;
  name: string;
  kind: string;
}

export function StockBalances() {
  const { can } = useAuth();
  const table = useTableState('stock-balances');
  const [search, setSearch] = useState(table.state.q);
  const debouncedSearch = useDebounced(search);
  const showCost = can('inventory.cost.view');

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () =>
      (await api.get<{ warehouses: WarehouseOption[] }>('/admin/warehouses')).data.warehouses,
    staleTime: 10 * 60_000,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-balances', { ...table.params, q: debouncedSearch }],
    queryFn: async () =>
      (
        await api.get<Paginated<StockBalanceRow>>('/inventory/balances', {
          params: { ...table.params, q: debouncedSearch || undefined },
        })
      ).data,
  });

  const columns: Column<StockBalanceRow>[] = [
    { key: 'code', header: 'كود الصنف', render: (row) => <span className="num">{row.code}</span> },
    { key: 'name', header: 'الصنف', render: (row) => row.name },
    {
      key: 'warehouse',
      header: 'المخزن',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{row.warehouse}</span>
          <StatusBadge vocabulary="warehouse_kind" value={row.warehouse_kind} />
        </div>
      ),
    },
    {
      key: 'batch',
      header: 'التشغيلة',
      render: (row) =>
        row.batch ? (
          <div>
            <div className="num">{row.batch}</div>
            {row.expiry_date && (
              <div
                style={{
                  fontSize: 11.5,
                  color:
                    new Date(row.expiry_date) < new Date()
                      ? 'var(--danger)'
                      : 'var(--text-faint)',
                }}
              >
                ينتهي {date(row.expiry_date)}
              </div>
            )}
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'qty_on_hand',
      header: 'الرصيد الفعلي',
      align: 'end',
      render: (row) => <span className="num">{qty(row.qty_on_hand)}</span>,
    },
    {
      key: 'qty_reserved',
      header: 'المحجوز',
      align: 'end',
      render: (row) => (
        <span className="num" style={Number(row.qty_reserved) > 0 ? { color: 'var(--warn)' } : {}}>
          {qty(row.qty_reserved)}
        </span>
      ),
    },
    {
      key: 'qty_available',
      header: 'المتاح',
      align: 'end',
      render: (row) => (
        <span
          className="num"
          style={{ fontWeight: 600, color: row.is_sellable ? 'inherit' : 'var(--text-faint)' }}
        >
          {qty(row.qty_available)}
        </span>
      ),
    },
    {
      key: 'is_sellable',
      header: 'قابل للبيع',
      align: 'center',
      render: (row) =>
        row.is_sellable ? (
          <span className="badge badge-ok">نعم</span>
        ) : (
          <span className="badge badge-neutral">لا</span>
        ),
    },
  ];

  if (showCost) {
    columns.push(
      { key: 'unit_cost', header: 'التكلفة', align: 'end', render: (row) => <span className="num">{amount(row.unit_cost)}</span> },
      { key: 'value', header: 'القيمة', align: 'end', render: (row) => <span className="num">{amount(row.value)}</span> },
    );
  }

  return (
    <>
      <PageHeader
        title="أرصدة المخزون"
        subtitle="الفعلي والمحجوز والمتاح، بحسب المخزن والتشغيلة"
        breadcrumb={['المخازن', 'الأرصدة']}
      />

      <Alert tone="info">
        الرصيد الفعلي ليس هو المتاح للبيع. البضاعة بالطريق وتحت الفحص والحجر والتالف تظهر ضمن
        الرصيد الفعلي لكنها غير قابلة للبيع، والمحجوز مخصص لمستندات قائمة.
      </Alert>

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
              value={table.state.filters.warehouse_id ?? ''}
              onChange={(event) => table.setFilter('warehouse_id', event.target.value)}
              aria-label="المخزن"
            >
              <option value="">كل المخازن</option>
              {warehouses?.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={table.state.filters.include_zero === '1'}
                onChange={(event) =>
                  table.setFilter('include_zero', event.target.checked ? '1' : '')
                }
              />
              إظهار الأرصدة الصفرية
            </label>
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="لا توجد أرصدة مطابقة" />
        ) : (
          <>
            <DataTable columns={columns} rows={data.data} rowKey={(row) => row.id} />
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

interface ReorderSuggestion {
  item_id: number;
  code: string;
  name: string;
  available: string;
  on_order: string;
  reorder_point: string;
  daily_consumption: string;
  lead_time_days: number;
  gap: string;
  suggested_qty: string;
}

export function ReorderSuggestions() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reorder-suggestions'],
    queryFn: async () =>
      (
        await api.get<{ suggestions: ReorderSuggestion[] }>('/purchasing/reorder-suggestions')
      ).data.suggestions,
  });

  const columns: Column<ReorderSuggestion>[] = [
    { key: 'code', header: 'الكود', render: (row) => <span className="num">{row.code}</span> },
    { key: 'name', header: 'الصنف', render: (row) => row.name },
    { key: 'available', header: 'المتاح', align: 'end', render: (row) => <span className="num">{qty(row.available)}</span> },
    {
      key: 'on_order',
      header: 'تحت الطلب',
      align: 'end',
      render: (row) => <span className="num">{qty(row.on_order)}</span>,
    },
    { key: 'reorder_point', header: 'حد الطلب', align: 'end', render: (row) => <span className="num">{qty(row.reorder_point)}</span> },
    {
      key: 'daily_consumption',
      header: 'معدل الاستهلاك اليومي',
      align: 'end',
      render: (row) => <span className="num">{qty(row.daily_consumption)}</span>,
    },
    {
      key: 'lead_time_days',
      header: 'مهلة التوريد',
      align: 'end',
      render: (row) => <span className="num">{row.lead_time_days} يوم</span>,
    },
    {
      key: 'suggested_qty',
      header: 'الكمية المقترحة',
      align: 'end',
      render: (row) => (
        <span className="num" style={{ fontWeight: 700, color: 'var(--brand)' }}>
          {qty(row.suggested_qty)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="اقتراحات إعادة الطلب"
        subtitle="بناءً على الاستهلاك الفعلي ومهلة التوريد والكميات تحت الطلب"
        breadcrumb={['المشتريات', 'اقتراحات الطلب']}
      />

      <Alert tone="info">
        لا يظهر الصنف هنا إذا كانت أوامر الشراء القائمة تغطي احتياجه بالفعل، منعًا لتكرار الطلب
        لنفس النقص.
      </Alert>

      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            title="لا توجد اقتراحات"
            hint="جميع الأصناف فوق حد الطلب أو مغطاة بأوامر شراء قائمة."
          />
        ) : (
          <DataTable columns={columns} rows={data} rowKey={(row) => row.item_id} />
        )}
      </div>
    </>
  );
}
