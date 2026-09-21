import { type ReactNode, useEffect, useRef, useState } from 'react';

/* ---------- الحالات: تحميل / فراغ / خطأ / نجاح ---------- */

export function LoadingState({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="state">
      <span className="spinner" />
      <div className="mt-2 small">{label}</div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: 14 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row" style={{ marginBottom: 12, gap: 14 }}>
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="skeleton" style={{ flex: c === 0 ? 2 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title = 'لا توجد بيانات',
  description,
  icon = '□',
  action,
}: {
  title?: string;
  description?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="ico">{icon}</div>
      <div className="title">{title}</div>
      {description && <div className="desc">{description}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message: string; code?: string }; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="ico" style={{ color: 'var(--danger)' }}>!</div>
      <div className="title">تعذّر إتمام العملية</div>
      <div className="desc">{error.message}</div>
      {error.code && <div className="tiny faint mb-3">رمز الخطأ: {error.code}</div>}
      {onRetry && <button className="btn" onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  const icons = { info: 'ℹ', error: '✕', success: '✓', warn: '⚠' };
  return (
    <div className={`alert ${tone}`}>
      <span className="ico">{icons[tone]}</span>
      <div>{children}</div>
    </div>
  );
}

export function Badge({ tone = '', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/* ---------- زر يوضّح سبب تعطيله ---------- */

export function Button({
  children,
  disabledReason,
  loading,
  variant = '',
  size = '',
  ...rest
}: {
  children: ReactNode;
  disabledReason?: string | null;
  loading?: boolean;
  variant?: '' | 'primary' | 'danger' | 'ghost';
  size?: '' | 'sm';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const disabled = Boolean(disabledReason) || loading || rest.disabled;

  return (
    <button
      {...rest}
      disabled={disabled}
      title={disabledReason ?? rest.title}
      className={`btn ${variant ? `btn-${variant}` : ''} ${size ? `btn-${size}` : ''} ${rest.className ?? ''}`}
    >
      {loading && <span className="spinner" style={{ width: 13, height: 13 }} />}
      {children}
    </button>
  );
}

/* ---------- حقل نموذج مع تحقق واضح ---------- */

export function Field({
  label,
  required,
  error,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {error && <span className="err">{error}</span>}
      {!error && help && <span className="help">{help}</span>}
    </div>
  );
}

/* ---------- نافذة ---------- */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close" onClick={onClose} aria-label="إغلاق">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- بطاقة مؤشر مع تعريفه الحسابي ---------- */

export function StatCard({
  label,
  value,
  formula,
  note,
  caveat,
  onClick,
}: {
  label: string;
  value: string;
  formula?: string | null;
  note?: string | null;
  caveat?: string | null;
  onClick?: () => void;
}) {
  const [showFormula, setShowFormula] = useState(false);

  return (
    <div className={`stat ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      {formula && (
        <button
          className="info-btn"
          title="التعريف الحسابي"
          onClick={(e) => {
            e.stopPropagation();
            setShowFormula((v) => !v);
          }}
        >
          ⓘ
        </button>
      )}
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {note && <div className="foot">{note}</div>}
      {caveat && <div className="foot" style={{ color: 'var(--warn)' }}>{caveat}</div>}
      {showFormula && formula && <div className="formula">{formula}</div>}
    </div>
  );
}

/* ---------- تحذير قبل فقد التغييرات ---------- */

export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

/* ---------- حفظ مسودة محليًا ---------- */

export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(`erp.draft.${key}`);
      return saved ? (JSON.parse(saved) as T) : initial;
    } catch {
      return initial;
    }
  });

  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(`erp.draft.${key}`, JSON.stringify(value));
      } catch {
        // تخزين المتصفح قد يكون ممتلئًا أو محجوبًا — المسودة ميزة إضافية لا شرط
      }
    }, 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [key, value]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(`erp.draft.${key}`);
    } catch { /* تجاهل */ }
  };

  return [value, setValue, clearDraft] as const;
}
