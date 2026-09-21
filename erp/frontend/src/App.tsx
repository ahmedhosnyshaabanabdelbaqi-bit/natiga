import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { LoadingState, EmptyState } from './components/ui';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Items from './pages/Items';
import Stock from './pages/Stock';
import SalesInvoices from './pages/SalesInvoices';
import InvoiceDetail from './pages/InvoiceDetail';
import NewInvoice from './pages/NewInvoice';
import DayClosure from './pages/DayClosure';
import Commissions from './pages/Commissions';
import SyncStatus from './pages/SyncStatus';
import Settings from './pages/Settings';
import Placeholder from './pages/Placeholder';
import { Suppliers, GoodsReceipts, SupplierInvoices, Receipts, Transfers } from './pages/Simple';
import {
  SalesReport, InventoryValuationReport, AgingReport,
  TrialBalanceReport, IncomeStatementReport, SalesmenReport,
} from './pages/reports/Reports';

/** يمنع فتح شاشة لا يملك المستخدم صلاحيتها — والخادم يتحقق مجددًا على كل طلب. */
function Guard({ permission, children }: { permission?: string; children: React.ReactNode }) {
  const { can } = useAuth();

  if (permission && !can(permission)) {
    return (
      <div className="card">
        <EmptyState
          icon="⚠"
          title="لا تملك صلاحية الوصول"
          description={`هذه الشاشة تتطلب صلاحية «${permission}». راجع مدير النظام إن كنت تحتاجها.`}
        />
      </div>
    );
  }

  return <>{children}</>;
}

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Shell() {
  const { user, loading, loadMe } = useAuth();

  useEffect(() => { void loadMe(); }, [loadMe]);

  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><LoadingState label="جارٍ التحقق من الجلسة…" /></div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <ScrollReset />
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/" element={<Dashboard />} />

        <Route path="/customers" element={<Guard permission="customer.view"><Customers /></Guard>} />
        <Route path="/customers/new" element={<Guard permission="customer.create"><Placeholder title="عميل جديد" phase="المرحلة الأولى — بيانات أساسية" available={[{ label: 'قائمة العملاء', path: '/customers' }]} /></Guard>} />
        <Route path="/customers/:id" element={<Guard permission="customer.view"><CustomerDetail /></Guard>} />

        <Route path="/items" element={<Guard permission="item.view"><Items /></Guard>} />
        <Route path="/stock" element={<Guard permission="stock.view"><Stock /></Guard>} />
        <Route path="/transfers" element={<Guard permission="stock.view"><Transfers /></Guard>} />

        <Route path="/sales-invoices" element={<Guard permission="sales_invoice.view"><SalesInvoices /></Guard>} />
        <Route path="/sales-invoices/new" element={<Guard permission="sales_invoice.create"><NewInvoice /></Guard>} />
        <Route path="/sales-invoices/:id" element={<Guard permission="sales_invoice.view"><InvoiceDetail /></Guard>} />
        <Route path="/receipts" element={<Guard permission="customer_receipt.view"><Receipts /></Guard>} />

        <Route path="/suppliers" element={<Guard permission="supplier.view"><Suppliers /></Guard>} />
        <Route path="/goods-receipts" element={<Guard permission="goods_receipt.view"><GoodsReceipts /></Guard>} />
        <Route path="/supplier-invoices" element={<Guard permission="supplier_invoice.view"><SupplierInvoices /></Guard>} />

        <Route path="/day-closure" element={<Guard permission="day_closure.view"><DayClosure /></Guard>} />
        <Route path="/commissions" element={<Guard permission="commission.view"><Commissions /></Guard>} />
        <Route path="/sync" element={<SyncStatus />} />

        <Route path="/reports/sales" element={<Guard permission="reports.sales"><SalesReport /></Guard>} />
        <Route path="/reports/inventory" element={<Guard permission="reports.inventory"><InventoryValuationReport /></Guard>} />
        <Route path="/reports/inventory-valuation" element={<Navigate to="/reports/inventory" replace />} />
        <Route path="/reports/aging" element={<Guard permission="reports.accounting"><AgingReport /></Guard>} />
        <Route path="/reports/trial-balance" element={<Guard permission="reports.accounting"><TrialBalanceReport /></Guard>} />
        <Route path="/reports/income-statement" element={<Guard permission="reports.accounting"><IncomeStatementReport /></Guard>} />
        <Route path="/reports/salesmen" element={<Guard permission="reports.salesmen"><SalesmenReport /></Guard>} />

        <Route path="/settings" element={<Guard permission="settings.view"><Settings /></Guard>} />

        <Route path="/approvals" element={<Placeholder title="الموافقات" phase="المرحلة الخامسة" />} />
        <Route path="/visits" element={<Placeholder title="الزيارات" phase="المرحلة الثالثة" />} />
        <Route path="/day-closures" element={<Navigate to="/day-closure" replace />} />
        <Route path="/sales-orders" element={<Placeholder title="أوامر البيع" phase="المرحلة الثانية" available={[{ label: 'فواتير البيع', path: '/sales-invoices' }]} />} />
        <Route path="/my/invoices" element={<Navigate to="/sales-invoices" replace />} />
        <Route path="/my/receipts" element={<Navigate to="/receipts" replace />} />
        <Route path="/my/customers" element={<Navigate to="/customers" replace />} />
        <Route path="/my/visits" element={<Navigate to="/visits" replace />} />

        <Route
          path="*"
          element={
            <div className="card">
              <EmptyState icon="?" title="الصفحة غير موجودة" description="الرابط الذي فتحته غير معرّف في النظام." />
            </div>
          }
        />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
