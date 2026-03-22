import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import MainLayout from './components/layout/MainLayout';
import { Loader2 } from 'lucide-react';

// Lazy-loaded pages for performance
const Login = lazy(() => import('./pages/Login'));

const AgentDashboard = lazy(() => import('./pages/agent/AgentDashboard'));
const Tables = lazy(() => import('./pages/agent/Tables'));
const TableDetail = lazy(() => import('./pages/agent/TableDetail'));
const Orders = lazy(() => import('./pages/agent/Orders'));
const Tickets = lazy(() => import('./pages/agent/Tickets'));
const CashRegister = lazy(() => import('./pages/agent/CashRegister'));
const Clients = lazy(() => import('./pages/agent/Clients'));
const AgentSettings = lazy(() => import('./pages/agent/AgentSettings'));
const NewOrder = lazy(() => import('./pages/agent/NewOrder'));
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
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

function PageLoader() {
  return <div className="flex justify-center items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
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
        <Route path="/login" element={
          isAuthenticated
            ? <Navigate to={user?.role === 'admin' ? '/admin' : '/agent'} replace />
            : <Login />
        } />

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
          <Route path="clients" element={<Clients />} />
          <Route path="settings" element={<AgentSettings />} />
          <Route path="history" element={<TransactionHistory />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="admin">
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route index element={<AdminDashboard />} />
          <Route path="supervision" element={<Supervision />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="products" element={<ProductManagement />} />
          <Route path="clients" element={<AdminClients />} />
          <Route path="sales" element={<Sales />} />
          <Route path="accounting" element={<Accounting />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={
          isAuthenticated
            ? <Navigate to={user?.role === 'admin' ? '/admin' : '/agent'} replace />
            : <Navigate to="/login" replace />
        } />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
