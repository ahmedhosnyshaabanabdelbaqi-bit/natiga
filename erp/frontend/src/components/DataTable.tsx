import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, ErrorState, TableSkeleton } from './ui';
import { useI18n } from '../lib/i18n';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  numeric?: boolean;
  sortable?: boolean;
  /** يمكن إخفاؤه من قائمة الأعمدة */
  hideable?: boolean;
  defaultHidden?: boolean;
  width?: string;
}

export interface TableMeta {
  current_page: number;
  last_page: number;
  per_page?: number;
  total: number;
  totals_all_results?: Record<string, string | null> | null;
}

interface Props<T> {
  /** مفتاح ثابت لحفظ إعدادات الأعمدة لهذا الجدول */
  storageKey: string;
  columns: Column<T>[];
  rows: T[];
  meta?: TableMeta | null;
  loading?: boolean;
  error?: { message: string; code?: string } | null;
  onRetry?: () => void;
  onPage?: (page: number) => void;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  sort?: { key: string; direction: 'asc' | 'desc' } | null;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string | number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** مجاميع الصفحة المعروضة (تُعرض بجوار مجاميع كل النتائج) */
  pageTotals?: Record<string, string>;
  toolbar?: ReactNode;
}

/**
 * جدول أعمال: بحث وتصفية وترتيب وإخفاء أعمدة وحفظ إعداداتها،
 * وتقسيم النتائج من الخادم، مع تمييز صريح بين مجاميع كل النتائج ومجاميع الصفحة.
 */
export function DataTable<T>({
  storageKey, columns, rows, meta, loading, error, onRetry,
  onPage, onSort, sort, onRowClick, rowKey,
  emptyTitle, emptyDescription, emptyAction, pageTotals, toolbar,
}: Props<T>) {
  const { t } = useI18n();
  const settingsKey = `erp.table.${storageKey}`;

  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      if (saved) return JSON.parse(saved) as string[];
    } catch { /* تجاهل */ }
    return columns.filter((c) => c.defaultHidden).map((c) => c.key);
  });

  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(hidden));
    } catch { /* تجاهل */ }
  }, [hidden, settingsKey]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowColumnMenu(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const visible = useMemo(() => columns.filter((c) => !hidden.includes(c.key)), [columns, hidden]);

  const toggleSort = (column: Column<T>) => {
    if (!column.sortable || !onSort) return;
    const direction = sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc';
    onSort(column.key, direction);
  };

  const hasTotals = Boolean(meta?.totals_all_results || pageTotals);

  return (
    <div className="card">
      {(toolbar || columns.some((c) => c.hideable !== false)) && (
        <div className="card-head no-print">
          {toolbar}
          <div className="spacer" />
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowColumnMenu((v) => !v)}>
              {t('common.columns')} ▾
            </button>
            {showColumnMenu && (
              <div className="col-toggle">
                {columns.filter((c) => c.hideable !== false).map((c) => (
                  <label key={c.key}>
                    <input
                      type="checkbox"
                      checked={!hidden.includes(c.key)}
                      onChange={() =>
                        setHidden((h) => (h.includes(c.key) ? h.filter((k) => k !== c.key) : [...h, c.key]))
                      }
                    />
                    {c.header}
                  </label>
                ))}
                <div className="divider" style={{ margin: '6px 0' }} />
                <button className="btn btn-sm btn-ghost" style={{ width: '100%' }} onClick={() => setHidden([])}>
                  {t('common.showAll')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : loading ? (
        <TableSkeleton cols={Math.min(visible.length, 6)} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {visible.map((c) => (
                  <th
                    key={c.key}
                    className={`${c.numeric ? 'n' : ''} ${c.sortable ? 'sortable' : ''}`}
                    style={c.width ? { width: c.width } : undefined}
                    onClick={() => toggleSort(c)}
                  >
                    {c.header}
                    {sort?.key === c.key && <span className="dir">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? 'row-link' : ''}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visible.map((c) => (
                    <td key={c.key} className={c.numeric ? 'n' : ''}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>

            {hasTotals && (
              <tfoot>
                {pageTotals && (
                  <tr>
                    {visible.map((c, i) => (
                      <td key={c.key} className={c.numeric ? 'n' : ''}>
                        {i === 0 ? t('common.pageTotals') : (pageTotals[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                )}
                {meta?.totals_all_results && (
                  <tr>
                    {visible.map((c, i) => (
                      <td key={c.key} className={c.numeric ? 'n' : ''}>
                        {i === 0 ? `${t('common.allResultsTotals')} (${meta.total})` : (meta.totals_all_results?.[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      )}

      {meta && meta.last_page > 1 && (
        <div className="pagination no-print">
          <button className="btn btn-sm" disabled={meta.current_page <= 1} onClick={() => onPage?.(meta.current_page - 1)}>
            {t('common.previous')}
          </button>
          <span className="small muted">
            {t('common.page')} <span className="num">{meta.current_page}</span> {t('common.of')} <span className="num">{meta.last_page}</span>
          </span>
          <button
            className="btn btn-sm"
            disabled={meta.current_page >= meta.last_page}
            onClick={() => onPage?.(meta.current_page + 1)}
          >
            {t('common.next')}
          </button>
          <div className="spacer" />
          <span className="small muted">
            {t('common.totalRecords')}: <span className="num">{meta.total}</span> {t('common.record')}
          </span>
        </div>
      )}
    </div>
  );
}
