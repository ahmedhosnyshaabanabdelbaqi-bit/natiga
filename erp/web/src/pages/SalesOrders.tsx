import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Paginated, SalesOrderRow } from '../api/types';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  type Column,
} from '../components/ui';
import { useDebounced } from '../hooks/useDebounced';
import { useTableState } from '../hooks/useTableState';
import { amount, date, startOfMonth, today } from '../lib/format';

export function SalesOrders() {
  const table = useTableState('sales-orders', {
    filters: { from: startOfMonth(), to: today() },
  });
  const [search, setSearch] = useState(table.state.q);
  const debouncedSearch = useDebounced(search);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-orders', { ...table.params, q: debouncedSearch }],
    queryFn: async () =>
      (
        await api.get<Paginated<SalesOrderRow>>('/sales/orders', {
          params: { ...table.params, q: debouncedSearch || undefined },
        })
      ).data,
  });

  const columns: Column<SalesOrderRow>[] = [
    { key: 'code', header: 'رقم الأمر', sortable: true, render: (row) => <span className="num">{row.code}</span> },
    { key: 'order_date', header: 'التاريخ', sortable: true, render: (row) => date(row.order_date) },
    { key: 'customer', header: 'العميل', render: (row) => row.customer ?? '—' },
    { key: 'rep', header: 'المندوب', render: (row) => row.rep ?? '—' },
    {
      key: 'payment_type',
      header: 'نوع البيع',
      render: (row) => <StatusBadge vocabulary="payment_type" value={row.payment_type} />,
    },
    { key: 'status', header: 'الحالة', render: (row) => <StatusBadge vocabulary="status" value={row.status} /> },
    /*
     * Delivery, invoicing and payment are three separate columns because they
     * are three separate facts. A real order is routinely part-delivered,
     * part-invoiced and part-paid at the same time.
     */
    {
      key: 'delivery_status',
      header: 'التسليم',
      render: (row) => <StatusBadge vocabulary="delivery_status" value={row.delivery_status} />,
    },
    {
      key: 'invoice_status',
      header: 'الفوترة',
      render: (row) => <StatusBadge vocabulary="invoice_status" value={row.invoice_status} />,
    },
    {
      key: 'payment_status',
      header: 'السداد',
      render: (row) => <StatusBadge vocabulary="payment_status" value={row.payment_status} />,
    },
    {
      key: 'total',
      header: 'الإجمالي',
      align: 'end',
      sortable: true,
      render: (row) => <span className="num">{amount(row.total)}</span>,
    },
  ];

  const pageTotal = (data?.data ?? []).reduce((sum, row) => sum + Number(row.total || 0), 0);

  return (
    <>
      <PageHeader
        title="أوامر البيع"
        subtitle="من الطلب إلى التسليم والفوترة"
        breadcrumb={['المبيعات', 'أوامر البيع']}
      />

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <input
              className="input"
              type="search"
              placeholder="بحث برقم الأمر…"
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
              aria-label="الحالة"
            >
              <option value="">كل الحالات</option>
              <option value="draft">مسودة</option>
              <option value="pending_approval">بانتظار الاعتماد</option>
              <option value="approved">معتمد</option>
              <option value="closed">مغلق</option>
              <option value="cancelled">ملغي</option>
            </select>

            <select
              className="select"
              value={table.state.filters.delivery_status ?? ''}
              onChange={(event) => table.setFilter('delivery_status', event.target.value)}
              aria-label="حالة التسليم"
            >
              <option value="">كل حالات التسليم</option>
              <option value="pending">لم يُسلَّم</option>
              <option value="partial">جزئي</option>
              <option value="delivered">مكتمل</option>
            </select>

            <input
              type="date"
              className="input"
              value={table.state.filters.from ?? ''}
              onChange={(event) => table.setFilter('from', event.target.value)}
              aria-label="من تاريخ"
            />
            <input
              type="date"
              className="input"
              value={table.state.filters.to ?? ''}
              onChange={(event) => table.setFilter('to', event.target.value)}
              aria-label="إلى تاريخ"
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="لا توجد أوامر بيع في هذه الفترة" />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data.data}
              rowKey={(row) => row.id}
              sort={table.state.sort}
              direction={table.state.direction}
              onSort={table.toggleSort}
              footer={
                <tr>
                  <td colSpan={columns.length - 1}>
                    إجمالي هذه الصفحة ({data.data.length} من {data.meta.total})
                  </td>
                  <td className="t-end num">{amount(pageTotal)}</td>
                </tr>
              }
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
