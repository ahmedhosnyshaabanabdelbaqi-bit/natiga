import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, toApiError, type ApiError } from '../lib/api';
import { money, date, moneyPlain } from '../lib/format';
import { Alert, Badge, ErrorState, LoadingState, StatCard } from '../components/ui';
import { useI18n } from '../lib/i18n';

interface Credit {
  outstanding_invoices: string;
  approved_uninvoiced_orders: string;
  offline_reserved: string;
  total_exposure: string;
  credit_limit: string;
  available_credit: string;
  overdue_amount: string;
}

interface StatementLine {
  date: string;
  doc_type: string;
  doc_no: string;
  debit: string;
  credit: string;
  running_balance: string;
}

export default function CustomerDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const [customer, setCustomer] = useState<Record<string, any> | null>(null);
  const [credit, setCredit] = useState<Credit | null>(null);
  const [statement, setStatement] = useState<StatementLine[]>([]);
  const [closing, setClosing] = useState('0');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, stmt] = await Promise.all([
        api.get(`/customers/${id}`),
        api.get(`/customers/${id}/statement`),
      ]);
      setCustomer(detail.data.data.customer);
      setCredit(detail.data.data.credit);
      setStatement(stmt.data.data.lines ?? []);
      setClosing(stmt.data.data.closing_balance ?? '0');
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

  if (loading) return <LoadingState label={t('customer.loading')} />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!customer) return null;

  const overLimit = credit && Number(credit.total_exposure) > Number(credit.credit_limit);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{customer.name}</h1>
          <div className="desc">
            <span className="num">{customer.code}</span>
            {customer.is_blocked && <> · <Badge tone="danger">{t('customers.blocked')}: {customer.block_reason}</Badge></>}
          </div>
        </div>
        <div className="actions no-print">
          <button className="btn" onClick={() => window.print()}>{t('customer.printStatement')}</button>
          <Link className="btn btn-primary" to={`/sales-invoices/new?customer=${customer.id}`}>{t('customer.newInvoice')}</Link>
        </div>
      </div>

      {overLimit && (
        <Alert tone="warn">
          {t('customer.overLimit', {
            exposure: moneyPlain(credit!.total_exposure),
            limit: moneyPlain(credit!.credit_limit),
          })}
        </Alert>
      )}

      {credit && (
        <div className="grid auto mb-4">
          <StatCard
            label={t('customer.outstanding')}
            value={money(credit.outstanding_invoices)}
            formula={t('customer.outstandingFormula')}
          />
          <StatCard
            label={t('customer.uninvoicedOrders')}
            value={money(credit.approved_uninvoiced_orders)}
            formula={t('customer.uninvoicedFormula')}
            note={t('customer.noDoubleCount')}
          />
          <StatCard
            label={t('customer.offlineReserved')}
            value={money(credit.offline_reserved)}
            formula={t('customer.offlineFormula')}
          />
          <StatCard
            label={t('customer.totalExposure')}
            value={money(credit.total_exposure)}
            formula={t('customer.exposureFormula')}
          />
          <StatCard label={t('customers.creditLimit')} value={money(credit.credit_limit)} />
          <StatCard label={t('customer.availableCredit')} value={money(credit.available_credit)} />
          <StatCard
            label={t('customer.overdue')}
            value={money(credit.overdue_amount)}
            formula={t('customer.overdueFormula')}
          />
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>{t('customer.statement')}</h2></div>
        {statement.length === 0 ? (
          <div className="state"><div className="title">{t('customer.noMovements')}</div></div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('customer.docType')}</th>
                  <th>{t('customer.docNo')}</th>
                  <th className="n">{t('customer.debit')}</th>
                  <th className="n">{t('customer.credit')}</th>
                  <th className="n">{t('customer.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {statement.map((line, i) => (
                  <tr key={`${line.doc_no}-${i}`}>
                    <td className="num">{date(line.date)}</td>
                    <td>{line.doc_type}</td>
                    <td className="num">{line.doc_no}</td>
                    <td className="n num">{Number(line.debit) ? moneyPlain(line.debit) : '—'}</td>
                    <td className="n num">{Number(line.credit) ? moneyPlain(line.credit) : '—'}</td>
                    <td className="n num bold">{moneyPlain(line.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{t('customer.closingBalance')}</td>
                  <td className="n num">{money(closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
