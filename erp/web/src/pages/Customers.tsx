import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { CreditExposure, CustomerRow, Paginated } from '../api/types';
import {
  Alert,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  StatusBadge,
  type Column,
} from '../components/ui';
import { useDebounced } from '../hooks/useDebounced';
import { useTableState } from '../hooks/useTableState';
import { amount, money } from '../lib/format';

export function Customers() {
  const table = useTableState('customers');
  const [search, setSearch] = useState(table.state.q);
  const debouncedSearch = useDebounced(search);
  const [creditFor, setCreditFor] = useState<CustomerRow | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['customers', { ...table.params, q: debouncedSearch }],
    queryFn: async () =>
      (
        await api.get<Paginated<CustomerRow>>('/customers', {
          params: { ...table.params, q: debouncedSearch || undefined },
        })
      ).data,
  });

  const columns: Column<CustomerRow>[] = [
    { key: 'code', header: 'الكود', sortable: true, render: (row) => <span className="num">{row.code}</span> },
    { key: 'name', header: 'اسم العميل', sortable: true, render: (row) => row.name },
    { key: 'kind', header: 'النوع', render: (row) => <StatusBadge vocabulary="customer_kind" value={row.kind} /> },
    { key: 'region', header: 'المنطقة', render: (row) => row.region ?? '—' },
    { key: 'route', header: 'خط السير', render: (row) => row.route ?? '—' },
    { key: 'price_list', header: 'قائمة السعر', render: (row) => row.price_list ?? '—' },
    {
      key: 'credit_limit',
      header: 'الحد الائتماني',
      align: 'end',
      sortable: true,
      render: (row) => <span className="num">{amount(row.credit_limit)}</span>,
    },
    {
      key: 'state',
      header: 'الحالة',
      render: (row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {row.credit_hold && <span className="badge badge-danger">موقوف ائتمانيًا</span>}
          {!row.is_active && <span className="badge badge-neutral">غير نشط</span>}
          {row.is_active && !row.credit_hold && <span className="badge badge-ok">نشط</span>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <button
          type="button"
          className="btn btn-sm"
          onClick={(event) => {
            event.stopPropagation();
            setCreditFor(row);
          }}
        >
          التعرض الائتماني
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="العملاء"
        subtitle="ملفات العملاء والحدود الائتمانية"
        breadcrumb={['المبيعات', 'العملاء']}
      />

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <input
              className="input"
              type="search"
              placeholder="بحث بالكود أو الاسم أو الهاتف…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                table.setSearch(event.target.value);
              }}
              aria-label="بحث"
            />

            <select
              className="select"
              value={table.state.filters.kind ?? ''}
              onChange={(event) => table.setFilter('kind', event.target.value)}
              aria-label="نوع العميل"
            >
              <option value="">كل الأنواع</option>
              <option value="retail">قطاعي</option>
              <option value="wholesale">جملة</option>
              <option value="distributor">موزع</option>
              <option value="project">مشروع</option>
              <option value="cash">نقدي</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={table.state.filters.only_overdue === '1'}
                onChange={(event) =>
                  table.setFilter('only_overdue', event.target.checked ? '1' : '')
                }
              />
              عليهم متأخرات فقط
            </label>
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="لا يوجد عملاء مطابقون" />
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

      {creditFor && <CreditModal customer={creditFor} onClose={() => setCreditFor(null)} />}
    </>
  );
}

/**
 * The credit picture, broken into its parts.
 *
 * Exposure is deliberately more than "unpaid invoices" — it includes goods
 * promised on approved orders and credit handed to a device for offline use, so
 * the same headroom cannot be spent twice.
 */
function CreditModal({ customer, onClose }: { customer: CustomerRow; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['customer-credit', customer.id],
    queryFn: async () =>
      (await api.get<CreditExposure>(`/customers/${customer.id}/credit`)).data,
  });

  return (
    <Modal title={`التعرض الائتماني — ${customer.name}`} onClose={onClose}>
      {isLoading && <LoadingState rows={4} />}
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}

      {data && (
        <>
          <table className="data">
            <tbody>
              <Row label="فواتير مستحقة" value={data.outstanding} />
              <Row label="أوامر معتمدة غير مفوترة" value={data.undelivered_orders} />
              <Row label="حصص ائتمان محجوزة للأجهزة" value={data.offline_reserved} />
              <Row label="دفعات غير موزعة" value={`-${data.unallocated_receipts}`} />
              <tr style={{ fontWeight: 700 }}>
                <td>إجمالي التعرض</td>
                <td className="t-end num">{money(data.exposure)}</td>
              </tr>
              <Row label="الحد الائتماني" value={data.limit} />
              <tr style={{ fontWeight: 700 }}>
                <td>المتاح</td>
                <td
                  className="t-end num"
                  style={{ color: Number(data.headroom) < 0 ? 'var(--danger)' : 'var(--accent)' }}
                >
                  {money(data.headroom)}
                </td>
              </tr>
            </tbody>
          </table>

          {Number(data.headroom) < 0 && (
            <Alert tone="danger">
              العميل تجاوز حده الائتماني. أي بيع آجل جديد يحتاج موافقة مسجلة.
            </Alert>
          )}

          {Number(data.offline_reserved) > 0 && (
            <Alert tone="info">
              يوجد جزء من الحد محجوز لجهاز مندوب للعمل دون اتصال، وهو محسوب ضمن التعرض ولا يمكن
              إنفاقه من قناة أخرى.
            </Alert>
          )}
        </>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="t-end num">{money(value)}</td>
    </tr>
  );
}
