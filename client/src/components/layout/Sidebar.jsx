import { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { ticketsAPI } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  UtensilsCrossed, LayoutDashboard, ShoppingCart, Receipt, CreditCard,
  Users, BarChart3, Package, Settings, LogOut, Wallet,
  BookOpen, UserCircle, Printer, TrendingUp, FileText, PieChart, Truck,
  BookMarked, ChevronLeft, ChevronRight, ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const adminNav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/supervision', icon: BarChart3, label: 'Supervision' },
  { to: '/admin/orders', icon: ShoppingCart, label: 'Commandes' },
  { to: '/admin/tickets', icon: Receipt, label: 'Tickets' },
  { to: '/admin/users', icon: Users, label: 'Utilisateurs' },
  { to: '/admin/products', icon: Package, label: 'Produits' },
  { to: '/admin/clients', icon: UserCircle, label: 'Clients' },
  { to: '/admin/sales', icon: TrendingUp, label: 'Ventes' },
  { to: '/admin/accounting', icon: BookOpen, label: 'Comptabilité' },
  { to: '/admin/reports', icon: FileText, label: 'Rapports' },
  { to: '/admin/revenue-history', icon: PieChart, label: 'Historique CA' },
  { to: '/admin/daily-invoices', icon: Printer, label: 'Facture Globale' },
  { to: '/admin/settings', icon: Settings, label: 'Paramètres' },
];

const caissierNav = [
  { to: '/caissier', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/caissier/global-report', icon: ClipboardList, label: 'Rapport global' },
];

function useSidebarCounts(isAgent, socket) {
  const [counts, setCounts] = useState({ enCours: 0, aEncaisser: 0 });

  const refresh = useCallback(async () => {
    if (!isAgent) return;
    try {
      const { data } = await ticketsAPI.getCounts();
      setCounts(data.data);
    } catch { /* silent */ }
  }, [isAgent]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!socket || !isAgent) return;
    socket.on('invoice:created', refresh);
    socket.on('invoice:updated', refresh);
    socket.on('invoice:memo', refresh);
    socket.on('ticket:paid', refresh);
    socket.on('ticket:deleted', refresh);
    return () => {
      socket.off('invoice:created', refresh);
      socket.off('invoice:updated', refresh);
      socket.off('invoice:memo', refresh);
      socket.off('ticket:paid', refresh);
      socket.off('ticket:deleted', refresh);
    };
  }, [socket, isAgent, refresh]);

  return counts;
}

export default function Sidebar({ onNavigate, collapsed, onToggleCollapse }) {
  const { user, isAdmin, logout } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const isAgent = user?.role === 'agent';
  const isCaissier = user?.role === 'caissier';
  const counts = useSidebarCounts(isAgent, socket);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNav = () => { onNavigate?.(); };

  const navLinkClass = ({ isActive }) => cn(
    'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-0' : '',
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
  );

  const agentNav = [
    { to: '/agent', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
    { to: '/agent/restaurant', icon: UtensilsCrossed, label: 'Restaurant' },
    {
      to: '/agent/en-cours',
      icon: BookMarked,
      label: 'En cours',
      badge: counts.enCours > 0 ? counts.enCours : null,
      badgeColor: 'bg-orange-500'
    },
    {
      to: '/agent/a-encaisser',
      icon: Wallet,
      label: 'À Encaisser',
      badge: counts.aEncaisser > 0 ? counts.aEncaisser : null,
      badgeColor: 'bg-blue-500'
    },
    { to: '/agent/new-order', icon: Truck, label: 'Emporter / Livraison' },
    { to: '/agent/tickets', icon: Receipt, label: 'Factures payées' },
    { to: '/agent/clients', icon: UserCircle, label: 'Clients' },
    { to: '/agent/settings', icon: Settings, label: 'Paramètres' },
  ];

  const navItems = isAdmin ? adminNav : isCaissier ? caissierNav : agentNav;

  return (
    <aside className={cn(
      'h-screen bg-card border-r flex flex-col transition-all duration-200',
      collapsed ? 'w-14' : 'w-64'
    )}>
      {/* Header */}
      <div className={cn('p-3 flex items-center gap-3', collapsed && 'justify-center')}>
        {!collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm truncate">Restaurant Manager</h2>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>
        )}
        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
          title={collapsed ? 'Développer' : 'Réduire'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <Separator />

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={handleNav}
            title={collapsed ? item.label : undefined}
            className={navLinkClass}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge != null && (
                  <span className={cn('text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0', item.badgeColor)}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </>
            )}
            {collapsed && item.badge != null && (
              <span className={cn('absolute top-1 right-1 w-2.5 h-2.5 rounded-full', item.badgeColor)} />
            )}
          </NavLink>
        ))}
      </nav>

      <Separator />

      <div className={cn('p-2 space-y-1', collapsed && 'items-center')}>
        {!collapsed && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="relative">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card bg-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground">En ligne</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className={cn('w-full text-muted-foreground', collapsed ? 'justify-center px-0' : 'justify-start gap-3')}
          onClick={handleLogout}
          title={collapsed ? 'Déconnexion' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && 'Déconnexion'}
        </Button>
      </div>

    </aside>
  );
}
