import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useList } from '../lib/useList';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, Button } from '../components/ui';
import { money, date } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useI18n, type MessageKey } from '../lib/i18n';

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

const BUSINESS_TYPE_KEYS: Record<string, MessageKey> = {
  retail_shop: 'customers.type.retail_shop',
  wholesaler: 'customers.type.wholesaler',
  distributor: 'customers.type.distributor',
  company: 'customers.type.company',
  contractor: 'customers.type.contractor',
  project: 'customers.type.project',
  cash: 'customers.type.cash',
};

export default function Customers() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { t } = useI18n();
  const list = useList<CustomerRow>('/customers');
  const [term, setTerm] = useState('');

  const columns: Column<CustomerRow>[] = [
    { key: 'code', header: t('common.code'), sortable: true, width: '110px' },
    { key: 'name', header: t('common.customer'), sortable: true, render: (r) => <span className="bold">{r.name}</span> },
    {
      key: 'business_type', header: t('customers.business'), hideable: true,
      render: (r) => (BUSINESS_TYPE_KEYS[r.business_type] ? t(BUSINESS_TYPE_KEYS[r.business_type]) : r.business_type),
    },
    { key: 'phone', header: t('common.phone'), render: (r) => <span className="num">{r.phone ?? '—'}</span>, hideable: true },
    { key: 'salesman', header: t('common.salesman'), render: (r) => r.salesman?.name ?? '—' },
    { key: 'region', header: t('common.region'), render: (r) => r.region?.name ?? '—', defaultHidden: true },
    {
      key: 'credit_limit', header: t('customers.creditLimit'), numeric: true, sortable: true,
      render: (r) => <span className="num">{money(r.credit_limit)}</span>,
    },
    {
      key: 'last_sale_date', header: t('customers.lastPurchase'), sortable: true,
      render: (r) => <span className="num">{date(r.last_sale_date)}</span>,
    },
    { key: 'grade', header: t('customers.grade'), render: (r) => (r.grade ? <Badge tone="info">{r.grade}</Badge> : '—'), defaultHidden: true },
    {
      key: 'status', header: t('common.status'),
      render: (r) =>
        r.is_blocked ? <Badge tone="danger">{t('customers.blocked')}</Badge>
          : r.is_active ? <Badge tone="success">{t('customers.active')}</Badge>
            : <Badge>{t('customers.inactive')}</Badge>,
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('customers.title')}</h1>
          <div className="desc">{t('customers.desc')}</div>
        </div>
        <div className="actions">
          <Button
            variant="primary"
            disabledReason={can('customer.create') ? null : t('customers.noPermissionCreate')}
            onClick={() => navigate('/customers/new')}
          >
            {t('customers.new')}
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
        emptyTitle={t('customers.empty')}
        emptyDescription={t('customers.emptyDesc')}
        toolbar={
          <div className="row">
            <input
              placeholder={t('customers.searchPlaceholder')}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && list.doSearch(term)}
              style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: 230 }}
            />
            <Button size="sm" onClick={() => list.doSearch(term)}>{t('common.search')}</Button>
            <select
              className="btn btn-sm"
              value={String(list.filters.is_blocked ?? '')}
              onChange={(e) => list.setFilter('is_blocked', e.target.value === '' ? undefined : e.target.value)}
            >
              <option value="">{t('common.allStatuses')}</option>
              <option value="0">{t('customers.notBlocked')}</option>
              <option value="1">{t('customers.blocked')}</option>
            </select>
          </div>
        }
      />
    </div>
  );
}
