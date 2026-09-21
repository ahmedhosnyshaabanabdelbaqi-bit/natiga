import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

interface NavEntry {
  path: string;
  label: string;
  icon: string;
  /** يظهر فقط إذا ملك المستخدم إحدى هذه الصلاحيات */
  permissions?: string[];
}

interface NavGroup {
  title: string;
  items: NavEntry[];
}

const NAV: NavGroup[] = [
  {
    title: 'الرئيسية',
    items: [{ path: '/', label: 'لوحة التحكم', icon: '▦' }],
  },
  {
    title: 'المبيعات',
    items: [
      { path: '/customers', label: 'العملاء', icon: '◉', permissions: ['customer.view'] },
      { path: '/sales-invoices', label: 'فواتير البيع', icon: '▤', permissions: ['sales_invoice.view'] },
      { path: '/sales-invoices/new', label: 'فاتورة جديدة', icon: '＋', permissions: ['sales_invoice.create'] },
      { path: '/receipts', label: 'سندات القبض', icon: '⛁', permissions: ['customer_receipt.view'] },
    ],
  },
  {
    title: 'المخازن',
    items: [
      { path: '/items', label: 'الأصناف', icon: '◈', permissions: ['item.view'] },
      { path: '/stock', label: 'الأرصدة', icon: '▥', permissions: ['stock.view'] },
      { path: '/transfers', label: 'التحويلات', icon: '⇄', permissions: ['stock.view'] },
    ],
  },
  {
    title: 'المشتريات',
    items: [
      { path: '/suppliers', label: 'الموردون', icon: '◐', permissions: ['supplier.view'] },
      { path: '/goods-receipts', label: 'الاستلام', icon: '⊞', permissions: ['goods_receipt.view'] },
      { path: '/supplier-invoices', label: 'فواتير الموردين', icon: '▣', permissions: ['supplier_invoice.view'] },
    ],
  },
  {
    title: 'الميدان',
    items: [
      { path: '/day-closure', label: 'إقفال اليوم', icon: '◷', permissions: ['day_closure.view'] },
      { path: '/commissions', label: 'العمولات', icon: '％', permissions: ['commission.view'] },
      { path: '/sync', label: 'حالة المزامنة', icon: '⟳', permissions: ['sync.view', 'device.view'] },
    ],
  },
  {
    title: 'التقارير',
    items: [
      { path: '/reports/sales', label: 'المبيعات', icon: '◫', permissions: ['reports.sales'] },
      { path: '/reports/inventory', label: 'تقييم المخزون', icon: '◪', permissions: ['reports.inventory'] },
      { path: '/reports/aging', label: 'أعمار الديون', icon: '◨', permissions: ['reports.accounting'] },
      { path: '/reports/trial-balance', label: 'ميزان المراجعة', icon: '◧', permissions: ['reports.accounting'] },
      { path: '/reports/income-statement', label: 'قائمة الدخل', icon: '◩', permissions: ['reports.accounting'] },
      { path: '/reports/salesmen', label: 'أداء المناديب', icon: '◎', permissions: ['reports.salesmen'] },
    ],
  },
  {
    title: 'النظام',
    items: [{ path: '/settings', label: 'الإعدادات', icon: '⚙', permissions: ['settings.view'] }],
  },
];

const CRUMB_LABELS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.path, i.label])),
);

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, canAny } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('erp.favorites') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ type: string; label: string; meta: string; path: string }>>([]);

  useEffect(() => {
    try {
      localStorage.setItem('erp.favorites', JSON.stringify(favorites));
    } catch { /* تجاهل */ }
  }, [favorites]);

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        navigate('/sales-invoices/new');
      }
      if (e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        navigate('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // بحث عام عبر العملاء والأصناف والفواتير
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const requests: Array<Promise<void>> = [];
        const found: typeof results = [];

        if (canAny(['customer.view'])) {
          requests.push(
            api.get('/customers', { params: { search: term, per_page: 5 }, signal: controller.signal })
              .then(({ data }) => {
                for (const c of data.data) {
                  found.push({ type: 'عميل', label: c.name, meta: c.code, path: `/customers/${c.id}` });
                }
              }).catch(() => undefined),
          );
        }
        if (canAny(['item.view'])) {
          requests.push(
            api.get('/items', { params: { search: term, per_page: 5 }, signal: controller.signal })
              .then(({ data }) => {
                for (const i of data.data) {
                  found.push({ type: 'صنف', label: i.name_ar, meta: i.code, path: `/items?search=${encodeURIComponent(i.code)}` });
                }
              }).catch(() => undefined),
          );
        }
        if (canAny(['sales_invoice.view'])) {
          requests.push(
            api.get('/sales-invoices', { params: { search: term, per_page: 5 }, signal: controller.signal })
              .then(({ data }) => {
                for (const inv of data.data) {
                  found.push({ type: 'فاتورة', label: inv.invoice_no, meta: inv.customer?.name ?? '', path: `/sales-invoices/${inv.id}` });
                }
              }).catch(() => undefined),
          );
        }

        await Promise.all(requests);
        setResults(found);
      } catch { /* تجاهل إلغاء الطلب */ }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, canAny]);

  const groups = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.permissions || canAny(i.permissions)),
      })).filter((g) => g.items.length > 0),
    [canAny],
  );

  const favoriteItems = useMemo(
    () => groups.flatMap((g) => g.items).filter((i) => favorites.includes(i.path)),
    [groups, favorites],
  );

  const crumb = CRUMB_LABELS[location.pathname] ?? '';

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="mark">م ف</div>
          <div>
            <div className="name">{user?.company_name ?? 'محمد فياض'}</div>
            <div className="sub">نظام إدارة التوزيع</div>
          </div>
        </div>

        <nav className="nav">
          {favoriteItems.length > 0 && (
            <>
              <div className="nav-group-title">المفضلة</div>
              {favoriteItems.map((item) => (
                <NavLinkRow
                  key={`fav-${item.path}`}
                  item={item}
                  active={location.pathname === item.path}
                  favorite
                  onToggleFavorite={() => setFavorites((f) => f.filter((p) => p !== item.path))}
                  onNavigate={() => setSidebarOpen(false)}
                />
              ))}
            </>
          )}

          {groups.map((group) => (
            <div key={group.title}>
              <div className="nav-group-title">{group.title}</div>
              {group.items.map((item) => (
                <NavLinkRow
                  key={item.path}
                  item={item}
                  active={location.pathname === item.path}
                  favorite={favorites.includes(item.path)}
                  onToggleFavorite={() =>
                    setFavorites((f) => (f.includes(item.path) ? f.filter((p) => p !== item.path) : [...f, item.path]))
                  }
                  onNavigate={() => setSidebarOpen(false)}
                />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="القائمة">☰</button>

          <div className="crumbs">
            <Link to="/">الرئيسية</Link>
            {crumb && crumb !== 'لوحة التحكم' && (
              <>
                <span className="sep">/</span>
                <span className="current">{crumb}</span>
              </>
            )}
          </div>

          <div className="global-search">
            <input
              id="global-search"
              placeholder="بحث عن عميل أو صنف أو فاتورة…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => window.setTimeout(() => setResults([]), 180)}
            />
            {!query && <span className="hint kbd">/</span>}
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r, i) => (
                  <div
                    key={`${r.path}-${i}`}
                    className="row"
                    onMouseDown={() => {
                      navigate(r.path);
                      setQuery('');
                      setResults([]);
                    }}
                  >
                    <div>{r.label}</div>
                    <div className="meta">{r.type} · {r.meta}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="user-chip">
            <div className="avatar">{user?.name?.slice(0, 1) ?? '؟'}</div>
            <div className="tiny" style={{ lineHeight: 1.3 }}>
              <div className="bold">{user?.name}</div>
              <div className="faint">{user?.roles?.[0]?.name_ar ?? 'مستخدم'}</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => logout()} title="تسجيل الخروج">خروج</button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function NavLinkRow({
  item, active, favorite, onToggleFavorite, onNavigate,
}: {
  item: NavEntry;
  active: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  onNavigate: () => void;
}) {
  return (
    <Link to={item.path} className={`nav-item ${active ? 'active' : ''}`} onClick={onNavigate}>
      <span className="ico">{item.icon}</span>
      <span>{item.label}</span>
      <span
        className={`star ${favorite ? 'on' : ''}`}
        title={favorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite();
        }}
      >
        ★
      </span>
    </Link>
  );
}
