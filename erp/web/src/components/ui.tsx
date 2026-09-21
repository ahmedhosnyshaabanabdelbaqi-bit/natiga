import { useState, type ReactNode } from 'react';
import { label } from '../lib/labels';

/* ------------------------------------------------------------------ states */

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card-body" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="skeleton"
          style={{ marginBottom: 10, width: `${95 - index * 7}%` }}
        />
      ))}
      <span className="state-hint">جارٍ التحميل…</span>
    </div>
  );
}

export function EmptyState({
  title = 'لا توجد بيانات',
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state-title">{title}</div>
      {hint && <div className="state-hint">{hint}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="state-title" style={{ color: 'var(--danger)' }}>
        تعذر عرض البيانات
      </div>
      <div className="state-hint">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-sm" style={{ marginTop: 14 }} onClick={onRetry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'danger';
  children: ReactNode;
}) {
  return <div className={`alert alert-${tone}`}>{children}</div>;
}

/* ------------------------------------------------------------------ badges */

export function StatusBadge({
  vocabulary,
  value,
}: {
  vocabulary: string;
  value: string | null | undefined;
}) {
  const { text, tone } = label(vocabulary, value);
  return <span className={`badge badge-${tone}`}>{text}</span>;
}

/* --------------------------------------------------------------------- KPI */

/**
 * A KPI tile.
 *
 * Every tile carries its own definition and, where the API supplies one, a link
 * to the documents behind it. A number nobody can open is a number nobody can
 * check, which is how dashboards stop being trusted.
 */
export function KpiTile({
  label: title,
  value,
  definition,
  footer,
  onOpen,
}: {
  label: string;
  value: string;
  definition: string;
  footer?: ReactNode;
  onOpen?: () => void;
}) {
  const [showDefinition, setShowDefinition] = useState(false);

  return (
    <div className="kpi">
      <div className="kpi-label">
        <span>{title}</span>
        <button
          type="button"
          className="hint"
          aria-label={`تعريف ${title}`}
          title={definition}
          onClick={() => setShowDefinition((open) => !open)}
          onBlur={() => setShowDefinition(false)}
        >
          ؟
        </button>
      </div>

      <div className="kpi-value num">{value}</div>

      <div className="kpi-footer">
        <span>{footer}</span>
        {onOpen && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={onOpen}
          >
            التفاصيل
          </button>
        )}
      </div>

      {showDefinition && <div className="hint-popover">{definition}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ tables */

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'start' | 'end' | 'center';
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  sort,
  direction,
  onSort,
  footer,
  rowKey,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  sort?: string;
  direction?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  footer?: ReactNode;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={[
                  column.sortable && onSort ? 'sortable' : '',
                  column.align === 'end' ? 't-end' : column.align === 'center' ? 't-center' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={column.sortable && onSort ? () => onSort(column.key) : undefined}
                aria-sort={
                  sort === column.key
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
              >
                {column.header}
                {sort === column.key && <span> {direction === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={
                    column.align === 'end' ? 't-end' : column.align === 'center' ? 't-center' : ''
                  }
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

/**
 * Pagination.
 *
 * States the total for the WHOLE filtered result, not just this page — so the
 * grand total a user reads is never the sum of the twenty rows in front of them.
 */
export function Pagination({
  page,
  lastPage,
  total,
  from,
  to,
  perPage,
  onPage,
  onPerPage,
}: {
  page: number;
  lastPage: number;
  total: number;
  from: number | null;
  to: number | null;
  perPage: number;
  onPage: (page: number) => void;
  onPerPage: (perPage: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        عرض <span className="num">{from ?? 0}</span>–<span className="num">{to ?? 0}</span> من{' '}
        <span className="num">{total}</span> سجل
      </span>

      <div className="pagination-controls">
        <select
          className="select"
          style={{ width: 'auto' }}
          value={perPage}
          onChange={(event) => onPerPage(Number(event.target.value))}
          aria-label="عدد السجلات في الصفحة"
        >
          {[25, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size} / صفحة
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          السابق
        </button>

        <span className="num" style={{ padding: '0 6px' }}>
          {page} / {lastPage || 1}
        </span>

        <button
          type="button"
          className="btn btn-sm"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
        >
          التالي
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ modals */

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="card-header">
          <h2 className="card-title">{title}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </div>
        <div className="card-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label: fieldLabel,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">{fieldLabel}</label>
      {children}
      {error && <div className="field-error">{error}</div>}
      {!error && hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="breadcrumb" aria-label="مسار التنقل">
            {breadcrumb.map((crumb, index) => (
              <span key={crumb}>
                {crumb}
                {index < breadcrumb.length - 1 && ' / '}
              </span>
            ))}
          </nav>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}
