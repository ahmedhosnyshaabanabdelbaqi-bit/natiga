import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button } from '../components/ui';
import { money, date, statusOf, startOfMonth, today } from '../lib/format';
import { useAuth } from '../lib/auth';

interface InvoiceRow {
  id: number;
  invoice_no: string;
  field_no: string | null;
  invoice_date: string;
  due_date: string | null;
  status: string;
  payment_type: string;
  total_amount: string;
  paid_amount: string;
  returned_amount: string;
  total_cost?: string;
  customer?: { id: number; code: string; name: string };
  salesman?: { id: number; name: string } | null;
}

export default function SalesInvoices() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const list = useList<InvoiceRow>('/sales-invoices', { from: startOfMonth(), to: today() });
  const [term, setTerm] = useState('');

  const columns: Column<InvoiceRow>[] = [
    { key: 'invoice_no', header: 'رقم الفاتورة', sortable: true, render: (r) => <span className="num bold">{r.invoice_no}</span> },
    { key: 'field_no', header: 'الرقم الميداني', render: (r) => <span className="num">{r.field_no ?? '—'}</span>, defaultHidden: true },
    { key: 'invoice_date', header: 'التاريخ', sortable: true, render: (r) => <span className="num">{date(r.invoice_date)}</span> },
    { key: 'customer', header: 'العميل', render: (r) => r.customer?.name ?? '—' },
    { key: 'salesman', header: 'المندوب', render: (r) => r.salesman?.name ?? '—', defaultHidden: true },
    { key: 'payment_type', header: 'السداد', render: (r) => (r.payment_type === 'cash' ? <Badge tone="success">نقدي</Badge> : <Badge tone="info">آجل</Badge>) },
    { key: 'total_amount', header: 'الإجمالي', numeric: true, sortable: true, render: (r) => <span className="num">{money(r.total_amount)}</span> },
    { key: 'paid_amount', header: 'المسدد', numeric: true, render: (r) => <span className="num">{money(r.paid_amount)}</span> },
    { key: 'returned_amount', header: 'المرتجع', numeric: true, render: (r) => <span className="num">{money(r.returned_amount)}</span>, defaultHidden: true },
    {
      key: 'outstanding', header: 'المتبقي', numeric: true,
      render: (r) => {
        const rest = Number(r.total_amount) - Number(r.paid_amount) - Number(r.returned_amount);
        return <span className={`num bold ${rest > 0 ? 'neg' : 'pos'}`}>{money(rest.toFixed(4))}</span>;
      },
    },
    ...(user?.can_see_cost
      ? [{ key: 'total_cost', header: 'التكلفة', numeric: true, render: (r: InvoiceRow) => <span className="num">{money(r.total_cost)}</span>, defaultHidden: true } as Column<InvoiceRow>]
      : []),
    {
      key: 'status', header: 'الحالة',
      render: (r) => {
        const s = statusOf(r.status);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>فواتير البيع</h1>
          <div className="desc">الفاتورة المرحّلة لا تُحذف؛ التصحيح يكون بإلغاء موثق أو مرتجع أو إشعار دائن.</div>
        </div>
        <div className="actions">
          <Button
            variant="primary"
            disabledReason={can('sales_invoice.create') ? null : 'لا تملك صلاحية إنشاء فاتورة.'}
            onClick={() => navigate('/sales-invoices/new')}
          >
            + فاتورة جديدة
          </Button>
        </div>
      </div>

      <DataTable
        storageKey="sales-invoices"
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
        onRowClick={(r) => navigate(`/sales-invoices/${r.id}`)}
        emptyTitle="لا توجد فواتير"
        emptyDescription="لا توجد فواتير في هذه الفترة أو ضمن نطاق صلاحيتك."
        toolbar={
          <div className="row">
            <input
              placeholder="رقم الفاتورة…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.doSearch(term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 170 }}
            />
            <input type="date" className="btn btn-sm" value={String(list.filters.from ?? '')} onChange={(e) => list.setFilter('from', e.target.value)} />
            <input type="date" className="btn btn-sm" value={String(list.filters.to ?? '')} onChange={(e) => list.setFilter('to', e.target.value)} />
            <select className="btn btn-sm" value={String(list.filters.status ?? '')} onChange={(e) => list.setFilter('status', e.target.value || undefined)}>
              <option value="">كل الحالات</option>
              <option value="posted">مُرحَّل</option>
              <option value="partially_paid">مسدد جزئيًا</option>
              <option value="paid">مسدد</option>
              <option value="cancelled">ملغي</option>
            </select>
            <label className="row tight small">
              <input type="checkbox" checked={Boolean(list.filters.unpaid_only)} onChange={(e) => list.setFilter('unpaid_only', e.target.checked ? 1 : undefined)} />
              غير المسددة فقط
            </label>
          </div>
        }
      />
    </div>
  );
}
