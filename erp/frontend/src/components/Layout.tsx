import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useI18n, type MessageKey } from '../lib/i18n';

interface NavEntry {
  path: string;
  labelKey: MessageKey;
  icon: string;
  /** يظهر فقط إذا ملك المستخدم إحدى هذه الصلاحيات */
  permissions?: string[];
}

interface NavGroup {
  titleKey: MessageKey;
  items: NavEntry[];
}

const NAV: NavGroup[] = [
  {
    titleKey: 'nav.group.main',
    items: [{ path: '/', labelKey: 'nav.dashboard', icon: '▦' }],
  },
  {
    titleKey: 'nav.group.sales',
    items: [
      { path: '/customers', labelKey: 'nav.customers', icon: '◉', permissions: ['customer.view'] },
      { path: '/sales-orders', labelKey: 'nav.salesOrders', icon: '▢', permissions: ['sales_order.view'] },
      { path: '/delivery-notes', labelKey: 'nav.deliveryNotes', icon: '▧', permissions: ['delivery_note.view'] },
      { path: '/sales-invoices', labelKey: 'nav.invoices', icon: '▤', permissions: ['sales_invoice.view'] },
      { path: '/sales-invoices/new', labelKey: 'nav.newInvoice', icon: '＋', permissions: ['sales_invoice.create'] },
      { path: '/receipts', labelKey: 'nav.receipts', icon: '⛁', permissions: ['customer_receipt.view'] },
    ],
  },
  {
    titleKey: 'nav.group.inventory',
    items: [
      { path: '/items', labelKey: 'nav.items', icon: '◈', permissions: ['item.view'] },
      { path: '/stock', labelKey: 'nav.stock', icon: '▥', permissions: ['stock.view'] },
      { path: '/transfers', labelKey: 'nav.transfers', icon: '⇄', permissions: ['stock.view'] },
    ],
  },
  {
    titleKey: 'nav.group.purchasing',
    items: [
      { path: '/suppliers', labelKey: 'nav.suppliers', icon: '◐', permissions: ['supplier.view'] },
      { path: '/goods-receipts', labelKey: 'nav.goodsReceipts', icon: '⊞', permissions: ['goods_receipt.view'] },
      { path: '/supplier-invoices', labelKey: 'nav.supplierInvoices', icon: '▣', permissions: ['supplier_invoice.view'] },
    ],
  },
  {
    titleKey: 'nav.group.field',
    items: [
      { path: '/day-closure', labelKey: 'nav.dayClosure', icon: '◷', permissions: ['day_closure.view'] },
      { path: '/commissions', labelKey: 'nav.commissions', icon: '％', permissions: ['commission.view'] },
      { path: '/sync', labelKey: 'nav.sync', icon: '⟳', permissions: ['sync.view', 'device.view'] },
    ],
  },
  {
    titleKey: 'nav.group.reports',
    items: [
      { path: '/reports/sales', labelKey: 'nav.reportSales', icon: '◫', permissions: ['reports.sales'] },
      { path: '/reports/inventory', labelKey: 'nav.reportInventory', icon: '◪', permissions: ['reports.inventory'] },
      { path: '/reports/aging', labelKey: 'nav.reportAging', icon: '◨', permissions: ['reports.accounting'] },
      { path: '/reports/trial-balance', labelKey: 'nav.reportTrialBalance', icon: '◧', permissions: ['reports.accounting'] },
      { path: '/reports/income-statement', labelKey: 'nav.reportIncome', icon: '◩', permissions: ['reports.accounting'] },
      { path: '/reports/salesmen', labelKey: 'nav.reportSalesmen', icon: '◎', permissions: ['reports.salesmen'] },
    ],
  },
  {
    titleKey: 'nav.group.system',
    items: [{ path: '/settings', labelKey: 'nav.settings', icon: '⚙', permissions: ['settings.view'] }],
  },
];

const CRUMB_KEYS: Record<string, MessageKey> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.path, i.labelKey])),
);

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, canAny } = useAuth();
  const { t, lang, toggle } = useI18n();
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
      // تعيين مصفوفة جديدة عند كل رسم يُسبب حلقة تحديث — نُبقي المرجع كما هو
      setResults((prev) => (prev.length === 0 ? prev : []));
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
                  found.push({ type: t('nav.resultCustomer'), label: c.name, meta: c.code, path: `/customers/${c.id}` });
                }
              }).catch(() => undefined),
          );
        }
        if (canAny(['item.view'])) {
          requests.push(
            api.get('/items', { params: { search: term, per_page: 5 }, signal: controller.signal })
              .then(({ data }) => {
                for (const i of data.data) {
                  found.push({ type: t('nav.resultItem'), label: i.name_ar, meta: i.code, path: `/items?search=${encodeURIComponent(i.code)}` });
                }
              }).catch(() => undefined),
          );
        }
        if (canAny(['sales_invoice.view'])) {
          requests.push(
            api.get('/sales-invoices', { params: { search: term, per_page: 5 }, signal: controller.signal })
              .then(({ data }) => {
                for (const inv of data.data) {
                  found.push({ type: t('nav.resultInvoice'), label: inv.invoice_no, meta: inv.customer?.name ?? '', path: `/sales-invoices/${inv.id}` });
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
  }, [query, canAny, t]);

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

  const crumbKey = CRUMB_KEYS[location.pathname];
  const crumb = crumbKey ? t(crumbKey) : '';

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="mark">{t('app.mark')}</div>
          <div>
            <div className="name">{user?.company_name ?? t('app.company')}</div>
            <div className="sub">{t('app.tagline')}</div>
          </div>
        </div>

        <nav className="nav">
          {favoriteItems.length > 0 && (
            <>
              <div className="nav-group-title">{t('nav.favorites')}</div>
              {favoriteItems.map((item) => (
                <NavLinkRow
                  key={`fav-${item.path}`}
                  label={t(item.labelKey)}
                  icon={item.icon}
                  path={item.path}
                  active={location.pathname === item.path}
                  favorite
                  favoriteTitle={t('nav.removeFavorite')}
                  onToggleFavorite={() => setFavorites((f) => f.filter((p) => p !== item.path))}
                  onNavigate={() => setSidebarOpen(false)}
                />
              ))}
            </>
          )}

          {groups.map((group) => (
            <div key={group.titleKey}>
              <div className="nav-group-title">{t(group.titleKey)}</div>
              {group.items.map((item) => {
                const isFavorite = favorites.includes(item.path);
                return (
                  <NavLinkRow
                    key={item.path}
                    label={t(item.labelKey)}
                    icon={item.icon}
                    path={item.path}
                    active={location.pathname === item.path}
                    favorite={isFavorite}
                    favoriteTitle={isFavorite ? t('nav.removeFavorite') : t('nav.addFavorite')}
                    onToggleFavorite={() =>
                      setFavorites((f) => (f.includes(item.path) ? f.filter((p) => p !== item.path) : [...f, item.path]))
                    }
                    onNavigate={() => setSidebarOpen(false)}
                  />
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label={t('nav.menu')}>☰</button>

          <div className="crumbs">
            <Link to="/">{t('nav.home')}</Link>
            {crumb && crumbKey !== 'nav.dashboard' && (
              <>
                <span className="sep">/</span>
                <span className="current">{crumb}</span>
              </>
            )}
          </div>

          <div className="global-search">
            <input
              id="global-search"
              placeholder={t('nav.globalSearch')}
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

          {/* تبديل اللغة — يقلب اتجاه الواجهة وموضع القائمة الجانبية */}
          <button
            className="btn btn-sm lang-toggle"
            onClick={toggle}
            title={t('settings.languageDesc')}
            aria-label={t('common.language')}
          >
            <span className="globe">⇄</span>
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>

          <div className="user-chip">
            <div className="avatar">{user?.name?.slice(0, 1) ?? '?'}</div>
            <div className="tiny" style={{ lineHeight: 1.3 }}>
              <div className="bold">{user?.name}</div>
              <div className="faint">{user?.roles?.[0]?.name_ar ?? t('common.user')}</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => logout()} title={t('common.logout')}>
              {t('common.logout')}
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function NavLinkRow({
  label, icon, path, active, favorite, favoriteTitle, onToggleFavorite, onNavigate,
}: {
  label: string;
  icon: string;
  path: string;
  active: boolean;
  favorite: boolean;
  favoriteTitle: string;
  onToggleFavorite: () => void;
  onNavigate: () => void;
}) {
  return (
    <Link to={path} className={`nav-item ${active ? 'active' : ''}`} onClick={onNavigate}>
      <span className="ico">{icon}</span>
      <span>{label}</span>
      <span
        className={`star ${favorite ? 'on' : ''}`}
        title={favoriteTitle}
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
