import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import MainLayout from './components/layout/MainLayout';
import { Loader2 } from 'lucide-react';

// Direct imports for instant navigation (no lazy loading)
import Login from './pages/Login';
import AgentDashboard from './pages/agent/AgentDashboard';
import Tables from './pages/agent/Tables';
import TableDetail from './pages/agent/TableDetail';
import Orders from './pages/agent/Orders';
import Tickets from './pages/agent/Tickets';
import CashRegister from './pages/agent/CashRegister';
import Clients from './pages/agent/Clients';
import AgentSettings from './pages/agent/AgentSettings';
import NewOrder from './pages/agent/NewOrder';
import TransactionHistory from './pages/agent/TransactionHistory';
import AdminDashboard from './pages/admin/AdminDashboard';
import Supervision from './pages/admin/Supervision';
import AdminOrders from './pages/admin/AdminOrders';
import AdminTickets from './pages/admin/AdminTickets';
import UserManagement from './pages/admin/UserManagement';
import ProductManagement from './pages/admin/ProductManagement';
import AdminClients from './pages/admin/AdminClients';
import Sales from './pages/admin/Sales';
import Accounting from './pages/admin/Accounting';
import Reports from './pages/admin/Reports';
import AdminTables from './pages/admin/AdminTables';
import AdminSettings from './pages/admin/AdminSettings';
import RevenueHistory from './pages/admin/RevenueHistory';

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
          <Route path="tables" element={<AdminTables />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="products" element={<ProductManagement />} />
          <Route path="clients" element={<AdminClients />} />
          <Route path="sales" element={<Sales />} />
          <Route path="accounting" element={<Accounting />} />
          <Route path="reports" element={<Reports />} />
          <Route path="revenue-history" element={<RevenueHistory />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        {/* Default — always show login */}
        <Route path="/" element={<Login />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  );
}
