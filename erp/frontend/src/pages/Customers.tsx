import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button } from '../components/ui';
import { money, date } from '../lib/format';
import { useAuth } from '../lib/auth';

interface CustomerRow {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  business_type: string;
  credit_limit: string;
  is_blocked: boolean;
  is_active: boolean;
  last_sale_date: string | null;
  grade: string | null;
  salesman?: { id: number; name: string } | null;
  region?: { id: number; name: string } | null;
}

const BUSINESS_TYPES: Record<string, string> = {
  retail_shop: 'محل قطاعي',
  wholesaler: 'جملة',
  distributor: 'موزع',
  company: 'شركة',
  contractor: 'مقاول',
  project: 'مشروع',
  cash: 'نقدي',
};

export default function Customers() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const list = useList<CustomerRow>('/customers');
  const [term, setTerm] = useState('');

  const columns: Column<CustomerRow>[] = [
    { key: 'code', header: 'الكود', sortable: true, width: '110px' },
    { key: 'name', header: 'اسم العميل', sortable: true, render: (r) => <span className="bold">{r.name}</span> },
    { key: 'business_type', header: 'النشاط', render: (r) => BUSINESS_TYPES[r.business_type] ?? r.business_type, hideable: true },
    { key: 'phone', header: 'الهاتف', render: (r) => <span className="num">{r.phone ?? '—'}</span>, hideable: true },
    { key: 'salesman', header: 'المندوب', render: (r) => r.salesman?.name ?? '—' },
    { key: 'region', header: 'المنطقة', render: (r) => r.region?.name ?? '—', defaultHidden: true },
    {
      key: 'credit_limit', header: 'الحد الائتماني', numeric: true, sortable: true,
      render: (r) => <span className="num">{money(r.credit_limit)}</span>,
    },
    {
      key: 'last_sale_date', header: 'آخر شراء', sortable: true,
      render: (r) => <span className="num">{date(r.last_sale_date)}</span>,
    },
    { key: 'grade', header: 'التصنيف', render: (r) => (r.grade ? <Badge tone="info">{r.grade}</Badge> : '—'), defaultHidden: true },
    {
      key: 'status', header: 'الحالة',
      render: (r) =>
        r.is_blocked ? <Badge tone="danger">موقوف</Badge>
          : r.is_active ? <Badge tone="success">نشط</Badge>
            : <Badge>غير نشط</Badge>,
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>العملاء</h1>
          <div className="desc">القائمة تعرض العملاء ضمن نطاق صلاحيتك فقط.</div>
        </div>
        <div className="actions">
          <Button
            variant="primary"
            disabledReason={can('customer.create') ? null : 'لا تملك صلاحية إنشاء عميل.'}
            onClick={() => navigate('/customers/new')}
          >
            + عميل جديد
          </Button>
        </div>
      </div>

      <DataTable
        storageKey="customers"
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
        onRowClick={(r) => navigate(`/customers/${r.id}`)}
        emptyTitle="لا يوجد عملاء"
        emptyDescription="لم يُسند إليك عملاء بعد، أو لا توجد نتائج مطابقة لبحثك."
        toolbar={
          <div className="row">
            <input
              placeholder="بحث بالاسم أو الكود أو الهاتف…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.doSearch(term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 230 }}
            />
            <Button size="sm" onClick={() => list.doSearch(term)}>بحث</Button>
            <select
              className="btn btn-sm"
              value={String(list.filters.is_blocked ?? '')}
              onChange={(e) => list.setFilter('is_blocked', e.target.value === '' ? undefined : e.target.value)}
            >
              <option value="">كل الحالات</option>
              <option value="0">غير موقوف</option>
              <option value="1">موقوف</option>
            </select>
          </div>
        }
      />
    </div>
  );
}
