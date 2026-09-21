import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** The permissions that make this screen reachable at all. */
  permissions?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAVIGATION: NavGroup[] = [
  {
    title: 'الرئيسية',
    items: [{ to: '/', label: 'لوحة التحكم', icon: '▦', permissions: ['dashboard.view'] }],
  },
  {
    title: 'المبيعات',
    items: [
      { to: '/sales/orders', label: 'أوامر البيع', icon: '≡', permissions: ['sales.order.view', 'sales.order.view.all'] },
      { to: '/sales/invoices', label: 'الفواتير', icon: '▤', permissions: ['sales.invoice.view', 'sales.invoice.view.all'] },
      { to: '/customers', label: 'العملاء', icon: '◍', permissions: ['customers.view', 'customers.view.all'] },
    ],
  },
  {
    title: 'المخازن والمشتريات',
    items: [
      { to: '/items', label: 'الأصناف', icon: '◫', permissions: ['items.view'] },
      { to: '/inventory/balances', label: 'أرصدة المخزون', icon: '▧', permissions: ['inventory.view'] },
      { to: '/purchasing/orders', label: 'المشتريات', icon: '▼', permissions: ['purchasing.view'] },
      { to: '/purchasing/reorder', label: 'اقتراحات الطلب', icon: '↻', permissions: ['purchasing.view'] },
    ],
  },
  {
    title: 'الخزينة',
    items: [
      { to: '/treasury/receipts', label: 'سندات القبض', icon: '₪', permissions: ['treasury.receipt.view', 'treasury.receipt.view.all'] },
      { to: '/treasury/custody', label: 'العهد', icon: '◈', permissions: ['treasury.custody.view', 'treasury.custody.view.all'] },
    ],
  },
  {
    title: 'العمل الميداني',
    items: [
      { to: '/field/positions', label: 'مواقع المناديب', icon: '◎', permissions: ['field.location.view'] },
      { to: '/sync/conflicts', label: 'تعارضات المزامنة', icon: '⚠', permissions: ['sync.conflict.view'] },
    ],
  },
  {
    title: 'التقارير',
    items: [
      { to: '/reports/sales', label: 'تحليل المبيعات', icon: '◐', permissions: ['reports.view'] },
      { to: '/reports/aging', label: 'أعمار الديون', icon: '◷', permissions: ['reports.view'] },
      { to: '/reports/rep-performance', label: 'أداء المناديب', icon: '◔', permissions: ['reports.view'] },
      { to: '/reports/trial-balance', label: 'ميزان المراجعة', icon: '⚖', permissions: ['accounting.reports.view'] },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      { to: '/admin/posting-matrix', label: 'مصفوفة الترحيل', icon: '⇄', permissions: ['accounting.posting_matrix.view'] },
      { to: '/admin/approvals', label: 'الموافقات', icon: '✓', permissions: ['approvals.view'] },
      { to: '/admin/users', label: 'المستخدمون', icon: '☰', permissions: ['admin.users.view'] },
      { to: '/admin/company', label: 'بيانات الشركة', icon: '⌂', permissions: ['admin.company.view'] },
    ],
  },
];

export function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleGroups = NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permissions || can(...item.permissions)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ت
          </span>
          <span>نظام التوزيع</span>
        </div>

        <nav aria-label="القائمة الرئيسية">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-group-title">{group.title}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <header className="app-header">
        <button
          type="button"
          className="btn btn-sm sidebar-toggle"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label="إظهار القائمة"
        >
          ☰
        </button>

        <div style={{ flex: 1 }} />

        <div style={{ textAlign: 'end', lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {user?.roles.map((role) => role.name).join('، ') || 'بدون دور'}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          خروج
        </button>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
