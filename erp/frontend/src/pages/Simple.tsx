import { useState } from 'react';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button } from '../components/ui';
import { money, date, statusOf } from '../lib/format';

/* ---------- الموردون ---------- */

export function Suppliers() {
  const list = useList<any>('/suppliers');
  const [term, setTerm] = useState('');

  const columns: Column<any>[] = [
    { key: 'code', header: 'الكود', sortable: true, width: '110px' },
    { key: 'name', header: 'المورد', sortable: true, render: (r) => <span className="bold">{r.name}</span> },
    { key: 'phone', header: 'الهاتف', render: (r) => <span className="num">{r.phone ?? '—'}</span> },
    { key: 'payment_term_days', header: 'مدة السداد', numeric: true, render: (r) => `${r.payment_term_days} يوم` },
    { key: 'lead_time_days', header: 'مهلة التوريد', numeric: true, render: (r) => `${r.lead_time_days} يوم`, defaultHidden: true },
    { key: 'is_active', header: 'الحالة', render: (r) => (r.is_active ? <Badge tone="success">نشط</Badge> : <Badge>غير نشط</Badge>) },
  ];

  return (
    <div>
      <div className="page-head"><div><h1>الموردون</h1></div></div>
      <DataTable
        storageKey="suppliers" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id}
        emptyTitle="لا يوجد موردون"
        toolbar={
          <div className="row">
            <input
              placeholder="بحث…" value={term} onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.doSearch(term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 200 }}
            />
            <Button size="sm" onClick={() => list.doSearch(term)}>بحث</Button>
          </div>
        }
      />
    </div>
  );
}

/* ---------- استلام البضاعة ---------- */

export function GoodsReceipts() {
  const list = useList<any>('/goods-receipts');

  const columns: Column<any>[] = [
    { key: 'receipt_no', header: 'رقم الاستلام', sortable: true, render: (r) => <span className="num bold">{r.receipt_no}</span> },
    { key: 'receipt_date', header: 'التاريخ', sortable: true, render: (r) => <span className="num">{date(r.receipt_date)}</span> },
    { key: 'supplier', header: 'المورد', render: (r) => r.supplier?.name ?? '—' },
    { key: 'warehouse', header: 'المخزن', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'total_cost', header: 'قيمة الاستلام', numeric: true, render: (r) => <span className="num">{money(r.total_cost)}</span> },
    {
      key: 'is_invoiced', header: 'الفوترة',
      render: (r) => (r.is_invoiced ? <Badge tone="success">مفوتر</Badge> : <Badge tone="warn">غير مفوتر</Badge>),
    },
    {
      key: 'status', header: 'الحالة',
      render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; },
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>استلام البضاعة</h1>
          <div className="desc">الاستلام المخزني منفصل عن فاتورة المورد. الفاتورة لاحقًا لا تضيف المخزون مرة ثانية.</div>
        </div>
      </div>
      <DataTable
        storageKey="goods-receipts" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id}
        emptyTitle="لا توجد مستندات استلام"
        toolbar={
          <label className="row tight small">
            <input
              type="checkbox"
              checked={Boolean(list.filters.uninvoiced_only)}
              onChange={(e) => list.setFilter('uninvoiced_only', e.target.checked ? 1 : undefined)}
            />
            غير المفوتر فقط (بضاعة مستلمة غير مفوترة)
          </label>
        }
      />
    </div>
  );
}

/* ---------- فواتير الموردين ---------- */

export function SupplierInvoices() {
  const list = useList<any>('/supplier-invoices');

  const columns: Column<any>[] = [
    { key: 'invoice_no', header: 'رقم الفاتورة', sortable: true, render: (r) => <span className="num bold">{r.invoice_no}</span> },
    { key: 'supplier_invoice_no', header: 'رقم فاتورة المورد', render: (r) => <span className="num">{r.supplier_invoice_no ?? '—'}</span>, defaultHidden: true },
    { key: 'invoice_date', header: 'التاريخ', sortable: true, render: (r) => <span className="num">{date(r.invoice_date)}</span> },
    { key: 'due_date', header: 'الاستحقاق', render: (r) => <span className="num">{date(r.due_date)}</span> },
    { key: 'supplier', header: 'المورد', render: (r) => r.supplier?.name ?? '—' },
    { key: 'total_amount', header: 'الإجمالي', numeric: true, sortable: true, render: (r) => <span className="num">{money(r.total_amount)}</span> },
    { key: 'paid_amount', header: 'المسدد', numeric: true, render: (r) => <span className="num">{money(r.paid_amount)}</span> },
    {
      key: 'outstanding', header: 'المتبقي', numeric: true,
      render: (r) => {
        const rest = Number(r.total_amount) - Number(r.paid_amount) - Number(r.returned_amount ?? 0);
        return <span className={`num bold ${rest > 0 ? 'neg' : 'pos'}`}>{money(rest.toFixed(4))}</span>;
      },
    },
    { key: 'status', header: 'الحالة', render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ];

  return (
    <div>
      <div className="page-head"><div><h1>فواتير الموردين</h1></div></div>
      <DataTable
        storageKey="supplier-invoices" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id} emptyTitle="لا توجد فواتير موردين"
      />
    </div>
  );
}

/* ---------- سندات القبض ---------- */

export function Receipts() {
  const list = useList<any>('/customer-receipts');

  const METHODS: Record<string, string> = {
    cash: 'نقدي', bank_transfer: 'تحويل بنكي', cheque: 'شيك', card: 'بطاقة',
  };

  const columns: Column<any>[] = [
    { key: 'voucher_no', header: 'رقم السند', sortable: true, render: (r) => <span className="num bold">{r.voucher_no}</span> },
    { key: 'field_no', header: 'الرقم الميداني', render: (r) => <span className="num">{r.field_no ?? '—'}</span>, defaultHidden: true },
    { key: 'receipt_date', header: 'التاريخ', sortable: true, render: (r) => <span className="num">{date(r.receipt_date)}</span> },
    { key: 'customer', header: 'العميل', render: (r) => r.customer?.name ?? '—' },
    { key: 'salesman', header: 'المحصل', render: (r) => r.salesman?.name ?? '—' },
    {
      key: 'payment_method', header: 'طريقة الدفع',
      render: (r) => (
        <span>
          {METHODS[r.payment_method] ?? r.payment_method}
          {r.payment_method === 'cheque' && <> <Badge tone="warn">ليست نقدية مؤكدة</Badge></>}
        </span>
      ),
    },
    { key: 'amount', header: 'المبلغ', numeric: true, sortable: true, render: (r) => <span className="num bold">{money(r.amount)}</span> },
    { key: 'allocated_amount', header: 'الموزّع على فواتير', numeric: true, render: (r) => <span className="num">{money(r.allocated_amount)}</span> },
    { key: 'status', header: 'الحالة', render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>سندات القبض</h1>
          <div className="desc">
            التحصيل النقدي عبر مندوب يدخل عهدته النقدية أولًا، ثم ينتقل للخزنة أو البنك بإيداع معتمد.
          </div>
        </div>
      </div>
      <DataTable
        storageKey="receipts" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id} emptyTitle="لا توجد سندات قبض"
        toolbar={
          <div className="row">
            <input type="date" className="btn btn-sm" value={String(list.filters.from ?? '')} onChange={(e) => list.setFilter('from', e.target.value)} />
            <input type="date" className="btn btn-sm" value={String(list.filters.to ?? '')} onChange={(e) => list.setFilter('to', e.target.value)} />
          </div>
        }
      />
    </div>
  );
}

/* ---------- التحويلات المخزنية ---------- */

export function Transfers() {
  const list = useList<any>('/stock/transfers');

  const PURPOSES: Record<string, string> = {
    van_load: 'تحميل سيارة', van_return: 'رد من سيارة',
    inter_warehouse: 'بين مخازن', van_to_van: 'بين سيارتين',
  };

  const columns: Column<any>[] = [
    { key: 'transfer_no', header: 'رقم التحويل', sortable: true, render: (r) => <span className="num bold">{r.transfer_no}</span> },
    { key: 'transfer_date', header: 'التاريخ', sortable: true, render: (r) => <span className="num">{date(r.transfer_date)}</span> },
    { key: 'from', header: 'من', render: (r) => r.from_warehouse?.name ?? '—' },
    { key: 'to', header: 'إلى', render: (r) => r.to_warehouse?.name ?? '—' },
    { key: 'purpose', header: 'الغرض', render: (r) => PURPOSES[r.purpose] ?? r.purpose },
    { key: 'status', header: 'الحالة', render: (r) => { const s = statusOf(r.status); return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>التحويلات المخزنية</h1>
          <div className="desc">
            التحويل يتم بإرسال واستلام منفصلين عبر «بضاعة بالطريق». الصنف لا يظهر في المخزنين في الوقت نفسه.
          </div>
        </div>
      </div>
      <DataTable
        storageKey="transfers" columns={columns} rows={list.rows} meta={list.meta}
        loading={list.loading} error={list.error} onRetry={list.reload} onPage={list.setPage}
        onSort={(k, d) => list.setSort({ key: k, direction: d })} sort={list.sort}
        rowKey={(r) => r.id} emptyTitle="لا توجد تحويلات"
        toolbar={
          <select className="btn btn-sm" value={String(list.filters.status ?? '')} onChange={(e) => list.setFilter('status', e.target.value || undefined)}>
            <option value="">كل الحالات</option>
            <option value="draft">مسودة</option>
            <option value="sent">مُرسل (بالطريق)</option>
            <option value="partially_received">مستلم جزئيًا</option>
            <option value="received">مُستلم</option>
          </select>
        }
      />
    </div>
  );
}
