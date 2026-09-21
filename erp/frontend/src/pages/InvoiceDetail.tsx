import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, moneyPlain, qty, date, statusOf } from '../lib/format';
import { Alert, Badge, Button, ErrorState, LoadingState, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';

/** عرض معامل التحويل بلا أصفار زائدة: 12.000000 ← 12 */
function trimFactor(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '1';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const { can, user } = useAuth();

  const [invoice, setInvoice] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [reprintNote, setReprintNote] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/sales-invoices/${id}`);
      setInvoice(data.data);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const doCancel = async () => {
    setActionError(null);
    try {
      await api.post(`/sales-invoices/${id}/cancel`, { reason });
      setCancelling(false);
      setReason('');
      await load();
    } catch (e) {
      setActionError(toApiError(e));
    }
  };

  const doReprint = async () => {
    try {
      const { data } = await api.post(`/sales-invoices/${id}/reprint`);
      if (data.data.is_reprint) {
        setReprintNote(`نسخة معادة الطباعة رقم ${data.data.print_count}`);
      }
      window.setTimeout(() => window.print(), 120);
    } catch (e) {
      setActionError(toApiError(e));
    }
  };

  if (loading) return <LoadingState label="جارٍ تحميل الفاتورة…" />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!invoice) return null;

  const status = statusOf(invoice.status);
  const outstanding = Number(invoice.total_amount) - Number(invoice.paid_amount) - Number(invoice.returned_amount);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>فاتورة <span className="num">{invoice.invoice_no}</span></h1>
          <div className="desc">
            <Badge tone={status.tone}>{status.label}</Badge>
            {invoice.field_no && <> · الرقم الميداني: <span className="num">{invoice.field_no}</span></>}
            {invoice.etax_status === 'not_submitted' && <> · <Badge tone="warn">لم تُقدَّم ضريبيًا</Badge></>}
          </div>
        </div>
        <div className="actions no-print">
          <Button
            disabledReason={can('sales_invoice.reprint') ? null : 'لا تملك صلاحية إعادة الطباعة.'}
            onClick={() => void doReprint()}
          >
            طباعة
          </Button>
          <Button
            variant="danger"
            disabledReason={
              !can('sales_invoice.cancel') ? 'لا تملك صلاحية الإلغاء.'
                : invoice.status === 'cancelled' ? 'الفاتورة ملغاة بالفعل.'
                  : Number(invoice.paid_amount) > 0 ? 'لا يمكن إلغاء فاتورة عليها تحصيلات — استخدم مرتجعًا أو إشعارًا دائنًا.'
                    : Number(invoice.returned_amount) > 0 ? 'لا يمكن إلغاء فاتورة عليها مرتجعات.'
                      : null
            }
            onClick={() => setCancelling(true)}
          >
            إلغاء الفاتورة
          </Button>
        </div>
      </div>

      {reprintNote && <Alert tone="warn">{reprintNote}</Alert>}
      {actionError && <Alert tone="error">{actionError.message}</Alert>}

      {invoice.status === 'cancelled' && (
        <Alert tone="error">
          ألغيت هذه الفاتورة في {date(invoice.cancelled_at)}. السبب: {invoice.cancel_reason}
        </Alert>
      )}

      <div className="grid cols-2 mb-4">
        <div className="card">
          <div className="card-head"><h2>البيانات</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 120 }}>العميل</span>
              <Link to={`/customers/${invoice.customer?.id}`}>{invoice.customer?.name}</Link></div>
            <div className="row"><span className="muted" style={{ width: 120 }}>التاريخ</span><span className="num">{date(invoice.invoice_date)}</span></div>
            <div className="row"><span className="muted" style={{ width: 120 }}>الاستحقاق</span><span className="num">{date(invoice.due_date)}</span></div>
            <div className="row"><span className="muted" style={{ width: 120 }}>المخزن</span><span>{invoice.warehouse?.name ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 120 }}>المندوب</span><span>{invoice.salesman?.name ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 120 }}>نوع السداد</span>
              <span>{invoice.payment_type === 'cash' ? 'نقدي' : 'آجل'}</span></div>
            <div className="row"><span className="muted" style={{ width: 120 }}>مالك حركة المخزون</span>
              <span>{invoice.is_stock_owner ? 'الفاتورة' : 'إذن التسليم'}</span></div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>المبالغ</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 150 }}>الإجمالي قبل الخصم</span><span className="num">{money(invoice.subtotal)}</span></div>
            <div className="row"><span className="muted" style={{ width: 150 }}>خصم السطور</span><span className="num">{money(invoice.line_discount_amount)}</span></div>
            <div className="row"><span className="muted" style={{ width: 150 }}>خصم الفاتورة</span><span className="num">{money(invoice.header_discount_amount)}</span></div>
            <div className="row"><span className="muted" style={{ width: 150 }}>الضريبة</span><span className="num">{money(invoice.tax_amount)}</span></div>
            <div className="divider" />
            <div className="row"><span className="bold" style={{ width: 150 }}>الإجمالي</span><span className="num bold" style={{ fontSize: 18 }}>{money(invoice.total_amount)}</span></div>
            <div className="row"><span className="muted" style={{ width: 150 }}>المسدد</span><span className="num pos">{money(invoice.paid_amount)}</span></div>
            <div className="row"><span className="muted" style={{ width: 150 }}>المرتجع</span><span className="num">{money(invoice.returned_amount)}</span></div>
            <div className="row"><span className="bold" style={{ width: 150 }}>المتبقي</span>
              <span className={`num bold ${outstanding > 0 ? 'neg' : 'pos'}`}>{money(outstanding.toFixed(4))}</span></div>
            {user?.can_see_cost && invoice.total_cost !== undefined && (
              <>
                <div className="divider" />
                <div className="row"><span className="muted" style={{ width: 150 }}>تكلفة المبيعات</span><span className="num">{money(invoice.total_cost)}</span></div>
                <div className="row"><span className="muted" style={{ width: 150 }}>مجمل الربح</span>
                  <span className="num bold pos">
                    {money((Number(invoice.subtotal) - Number(invoice.line_discount_amount) - Number(invoice.total_cost)).toFixed(4))}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>الأصناف</h2></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: '38%' }}>الصنف</th>
                <th style={{ width: 130 }}>الوحدة</th>
                <th className="n">الكمية</th>
                <th className="n">السعر</th>
                <th className="n">الخصم</th>
                <th className="n">الإجمالي</th>
                {user?.can_see_cost && <th className="n">التكلفة</th>}
                <th className="n">المرتجع</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lines ?? []).map((line: Record<string, any>) => (
                <tr key={line.id}>
                  <td className="num">{line.line_no}</td>
                  <td>
                    {line.item?.name_ar ?? '—'}
                    {line.is_free && <> <Badge tone="success">هدية</Badge></>}
                  </td>
                  <td>{line.uom?.name_ar ?? '—'} <span className="tiny faint">×{trimFactor(line.uom_factor)}</span></td>
                  <td className="n num">{qty(line.qty_uom)}</td>
                  <td className="n num">{moneyPlain(line.unit_price)}</td>
                  <td className="n num">{moneyPlain(line.discount_amount)}</td>
                  <td className="n num bold">{moneyPlain(line.line_total)}</td>
                  {user?.can_see_cost && <td className="n num">{moneyPlain(line.total_cost)}</td>}
                  <td className="n num">{qty(line.returned_qty_base)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-body tiny faint">
          معامل التحويل والسعر والخصم محفوظة كما كانت وقت الاعتماد؛ تغيير إعدادات الصنف لاحقًا لا يغيّر هذه الفاتورة.
        </div>
      </div>

      {cancelling && (
        <Modal
          title="إلغاء الفاتورة"
          onClose={() => setCancelling(false)}
          footer={
            <>
              <Button variant="danger" disabledReason={reason.trim().length < 3 ? 'اكتب سبب الإلغاء.' : null} onClick={() => void doCancel()}>
                تأكيد الإلغاء
              </Button>
              <Button onClick={() => setCancelling(false)}>تراجع</Button>
            </>
          }
        >
          <Alert tone="warn">
            الإلغاء لا يحذف الفاتورة. يُنشأ قيد عكسي موثق وتعود البضاعة للمخزون بنفس تكلفتها الأصلية، ويُسجَّل الإجراء في سجل المراجعة.
          </Alert>
          <label className="field">
            <span>سبب الإلغاء <span className="req">*</span></span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </Modal>
      )}
    </div>
  );
}
