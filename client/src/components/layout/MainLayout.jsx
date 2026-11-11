import { useState, useCallback } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import SyncStatusBar from '@/components/SyncStatusBar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Menu, Crown, AlertTriangle } from 'lucide-react';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, subscriptionState, isSubscriptionExpired, isAdmin } = useAuth();
  const location = useLocation();
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleCollapse = useCallback(() => setCollapsed(c => !c), []);

  const sidebarWidth = collapsed ? 'lg:ml-14' : 'lg:ml-64';
  const drawerWidth = collapsed ? 'w-14' : 'w-64';
  const isOnSubscriptionPage = location.pathname.startsWith('/admin/subscription');
  const showTrialBanner =
    user?.role === 'admin' &&
    subscriptionState?.effectiveStatus === 'trial' &&
    subscriptionState?.isValid &&
    !isOnSubscriptionPage;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-card border-b flex items-center px-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-1 rounded-lg hover:bg-accent active:bg-accent/80 transition-colors"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-semibold text-sm flex-1">Restaurant Manager</span>
        <SyncStatusBar compact />
      </div>

      {/* Mobile overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={closeSidebar}
      />

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transition-all duration-200 ease-out lg:translate-x-0 ${drawerWidth} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar
          onNavigate={closeSidebar}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Main content */}
      <main className={`${sidebarWidth} pt-14 lg:pt-0 min-h-screen transition-all duration-200`}>
        {isSubscriptionExpired && !isOnSubscriptionPage ? (
          <div className="p-6 max-w-xl mx-auto mt-10">
            <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-red-900 dark:text-red-200">
                Essai gratuit ou abonnement expiré
              </h2>
              <p className="text-sm text-red-700 dark:text-red-300">
                {isAdmin
                  ? 'Votre essai gratuit de 30 jours ou abonnement est arrivé à terme. Choisissez un plan pour réactiver votre restaurant immédiatement.'
                  : 'L\'abonnement de votre restaurant a expiré. Veuillez contacter votre administrateur pour le renouveler.'}
              </p>
              {isAdmin && (
                <Button asChild className="bg-red-600 hover:bg-red-700 text-white">
                  <Link to="/admin/subscription">
                    <Crown className="w-4 h-4 mr-2" /> Choisir un plan &amp; Payer
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {showTrialBanner && (
              <div className="bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 px-4 py-2 flex items-center justify-between gap-3 text-xs sm:text-sm">
                <span className="text-blue-900 dark:text-blue-200">
                  <strong>Essai gratuit actif :</strong> il vous reste{' '}
                  <strong>{subscriptionState.daysRemaining}</strong> jour(s).
                </span>
                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                  <Link to="/admin/subscription">
                    <Crown className="w-3.5 h-3.5 mr-1 text-amber-500" /> Voir les plans
                  </Link>
                </Button>
              </div>
            )}
            <Outlet />
          </>
        )}
      </main>
    </div>
  );
}
