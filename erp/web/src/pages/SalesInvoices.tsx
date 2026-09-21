import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { InvoiceRow, Paginated } from '../api/types';
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
import { useAuth } from '../hooks/useAuth';
import { useDebounced } from '../hooks/useDebounced';
import { useTableState } from '../hooks/useTableState';
import { amount, date, startOfMonth, today } from '../lib/format';

export function SalesInvoices() {
  const { can } = useAuth();
  const table = useTableState('sales-invoices', {
    filters: { from: startOfMonth(), to: today() },
  });
  const [search, setSearch] = useState(table.state.q);
  const debouncedSearch = useDebounced(search);
  const showProfit = can('reports.profit.view', 'inventory.cost.view');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-invoices', { ...table.params, q: debouncedSearch }],
    queryFn: async () =>
      (
        await api.get<Paginated<InvoiceRow>>('/sales/invoices', {
          params: { ...table.params, q: debouncedSearch || undefined },
        })
      ).data,
  });

  const columns: Column<InvoiceRow>[] = [
    { key: 'code', header: 'رقم الفاتورة', sortable: true, render: (row) => <span className="num">{row.code}</span> },
    { key: 'invoice_date', header: 'التاريخ', sortable: true, render: (row) => date(row.invoice_date) },
    {
      key: 'due_date',
      header: 'الاستحقاق',
      sortable: true,
      render: (row) => {
        const overdue =
          row.due_date && new Date(row.due_date) < new Date() && Number(row.outstanding) > 0;
        return (
          <span style={overdue ? { color: 'var(--danger)', fontWeight: 600 } : {}}>
            {date(row.due_date)}
          </span>
        );
      },
    },
    { key: 'customer', header: 'العميل', render: (row) => row.customer ?? '—' },
    { key: 'rep', header: 'المندوب', render: (row) => row.rep ?? '—' },
    { key: 'status', header: 'الحالة', render: (row) => <StatusBadge vocabulary="status" value={row.status} /> },
    {
      key: 'payment_status',
      header: 'السداد',
      render: (row) => <StatusBadge vocabulary="payment_status" value={row.payment_status} />,
    },
    { key: 'total', header: 'الإجمالي', align: 'end', sortable: true, render: (row) => <span className="num">{amount(row.total)}</span> },
    { key: 'paid_amount', header: 'المسدد', align: 'end', render: (row) => <span className="num">{amount(row.paid_amount)}</span> },
    {
      key: 'outstanding',
      header: 'المتبقي',
      align: 'end',
      render: (row) => (
        <span className="num" style={Number(row.outstanding) > 0 ? { color: 'var(--danger)' } : {}}>
          {amount(row.outstanding)}
        </span>
      ),
    },
  ];

  if (showProfit) {
    columns.push({
      key: 'gross_profit',
      header: 'مجمل الربح',
      align: 'end',
      render: (row) => <span className="num">{amount(row.gross_profit)}</span>,
    });
  }

  columns.push({
    key: 'e_invoice_status',
    header: 'الفاتورة الإلكترونية',
    render: (row) => <StatusBadge vocabulary="e_invoice_status" value={row.e_invoice_status} />,
  });

  return (
    <>
      <PageHeader
        title="فواتير المبيعات"
        subtitle="الفواتير المرحّلة وحالة سدادها"
        breadcrumb={['المبيعات', 'الفواتير']}
      />

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <input
              className="input"
              type="search"
              placeholder="بحث برقم الفاتورة أو الرقم الميداني…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                table.setSearch(event.target.value);
              }}
              aria-label="بحث"
            />

            <select
              className="select"
              value={table.state.filters.payment_status ?? ''}
              onChange={(event) => table.setFilter('payment_status', event.target.value)}
              aria-label="حالة السداد"
            >
              <option value="">كل حالات السداد</option>
              <option value="unpaid">غير مسدد</option>
              <option value="partial">مسدد جزئيًا</option>
              <option value="paid">مسدد</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={table.state.filters.overdue === '1'}
                onChange={(event) => table.setFilter('overdue', event.target.checked ? '1' : '')}
              />
              المتأخرات فقط
            </label>

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
          <EmptyState title="لا توجد فواتير في هذه الفترة" />
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
