import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './hooks/useAuth';
import { Approvals, PostingMatrix, RepPositions, SyncConflicts } from './pages/Admin';
import { CompanySettings, Users } from './pages/Company';
import { Customers } from './pages/Customers';
import { Dashboard } from './pages/Dashboard';
import { ReorderSuggestions, StockBalances } from './pages/Inventory';
import { Items } from './pages/Items';
import { Login } from './pages/Login';
import { AgingReport, RepPerformance, SalesReport, TrialBalance } from './pages/Reports';
import { SalesInvoices } from './pages/SalesInvoices';
import { SalesOrders } from './pages/SalesOrders';
import { Custody, Receipts } from './pages/Treasury';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-page">
        <span className="spinner" />
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function NotFound() {
  return (
    <div className="state">
      <div className="state-title">الصفحة غير موجودة</div>
      <div className="state-hint">تحقق من الرابط أو ارجع إلى لوحة التحكم.</div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />

          <Route path="items" element={<Items />} />
          <Route path="customers" element={<Customers />} />

          <Route path="sales/orders" element={<SalesOrders />} />
          <Route path="sales/invoices" element={<SalesInvoices />} />

          <Route path="inventory/balances" element={<StockBalances />} />
          <Route path="purchasing/reorder" element={<ReorderSuggestions />} />
          <Route path="purchasing/orders" element={<ReorderSuggestions />} />

          <Route path="treasury/receipts" element={<Receipts />} />
          <Route path="treasury/custody" element={<Custody />} />

          <Route path="field/positions" element={<RepPositions />} />
          <Route path="sync/conflicts" element={<SyncConflicts />} />

          <Route path="reports/sales" element={<SalesReport />} />
          <Route path="reports/aging" element={<AgingReport />} />
          <Route path="reports/rep-performance" element={<RepPerformance />} />
          <Route path="reports/trial-balance" element={<TrialBalance />} />

          <Route path="admin/posting-matrix" element={<PostingMatrix />} />
          <Route path="admin/approvals" element={<Approvals />} />
          <Route path="admin/users" element={<Users />} />
          <Route path="admin/company" element={<CompanySettings />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
