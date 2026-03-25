import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import MainLayout from './components/layout/MainLayout';
import { Loader2 } from 'lucide-react';

// Critical pages — always bundled for instant render
import Login from './pages/Login';
import AgentDashboard from './pages/agent/AgentDashboard';
import Tables from './pages/agent/Tables';
import TableDetail from './pages/agent/TableDetail';
import NewOrder from './pages/agent/NewOrder';
import Orders from './pages/agent/Orders';
import Tickets from './pages/agent/Tickets';
import CashRegister from './pages/agent/CashRegister';

// Lazy-loaded pages — downloaded only when first visited (code splitting)
const Clients = lazy(() => import('./pages/agent/Clients'));
const AgentSettings = lazy(() => import('./pages/agent/AgentSettings'));
const TransactionHistory = lazy(() => import('./pages/agent/TransactionHistory'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const Supervision = lazy(() => import('./pages/admin/Supervision'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminTickets = lazy(() => import('./pages/admin/AdminTickets'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const ProductManagement = lazy(() => import('./pages/admin/ProductManagement'));
const AdminClients = lazy(() => import('./pages/admin/AdminClients'));
const Sales = lazy(() => import('./pages/admin/Sales'));
const Accounting = lazy(() => import('./pages/admin/Accounting'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const AdminTables = lazy(() => import('./pages/admin/AdminTables'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const RevenueHistory = lazy(() => import('./pages/admin/RevenueHistory'));
const DailyInvoices = lazy(() => import('./pages/admin/DailyInvoices'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-7 h-7 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/agent'} replace />;
  }

  return children;
}

export default function App() {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Agent Routes */}
        <Route path="/agent" element={
          <ProtectedRoute requiredRole="agent">
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route index element={<AgentDashboard />} />
          <Route path="tables" element={<Tables />} />
          <Route path="tables/:id" element={<TableDetail />} />
          <Route path="new-order" element={<NewOrder />} />
          <Route path="orders" element={<Orders />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="cash-register" element={<CashRegister />} />
          <Route path="clients" element={<Suspense fallback={<PageLoader />}><Clients /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageLoader />}><AgentSettings /></Suspense>} />
          <Route path="history" element={<Suspense fallback={<PageLoader />}><TransactionHistory /></Suspense>} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="admin">
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Suspense fallback={<PageLoader />}><AdminDashboard /></Suspense>} />
          <Route path="supervision" element={<Suspense fallback={<PageLoader />}><Supervision /></Suspense>} />
          <Route path="tables" element={<Suspense fallback={<PageLoader />}><AdminTables /></Suspense>} />
          <Route path="orders" element={<Suspense fallback={<PageLoader />}><AdminOrders /></Suspense>} />
          <Route path="tickets" element={<Suspense fallback={<PageLoader />}><AdminTickets /></Suspense>} />
          <Route path="users" element={<Suspense fallback={<PageLoader />}><UserManagement /></Suspense>} />
          <Route path="products" element={<Suspense fallback={<PageLoader />}><ProductManagement /></Suspense>} />
          <Route path="clients" element={<Suspense fallback={<PageLoader />}><AdminClients /></Suspense>} />
          <Route path="sales" element={<Suspense fallback={<PageLoader />}><Sales /></Suspense>} />
          <Route path="accounting" element={<Suspense fallback={<PageLoader />}><Accounting /></Suspense>} />
          <Route path="reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
          <Route path="revenue-history" element={<Suspense fallback={<PageLoader />}><RevenueHistory /></Suspense>} />
          <Route path="daily-invoices" element={<Suspense fallback={<PageLoader />}><DailyInvoices /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageLoader />}><AdminSettings /></Suspense>} />
        </Route>

        {/* Default — always show login */}
        <Route path="/" element={<Login />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
