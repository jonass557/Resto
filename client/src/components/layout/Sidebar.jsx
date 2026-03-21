import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  UtensilsCrossed, LayoutDashboard, ShoppingCart, Receipt, CreditCard,
  Users, BarChart3, Package, Settings, LogOut, ChefHat, Wallet,
  BookOpen, UserCircle, Printer, TrendingUp, FileText, PieChart, Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const agentNav = [
  { to: '/agent', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/agent/tables', icon: UtensilsCrossed, label: 'Tables (sur place)' },
  { to: '/agent/new-order', icon: Truck, label: 'Emporter / Livraison' },
  { to: '/agent/orders', icon: ShoppingCart, label: 'Commandes' },
  { to: '/agent/tickets', icon: Receipt, label: 'Tickets' },
  { to: '/agent/cash-register', icon: Wallet, label: 'Caisse' },
  { to: '/agent/clients', icon: UserCircle, label: 'Clients' },
  { to: '/agent/settings', icon: Settings, label: 'Paramètres' },
];

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
  { to: '/admin/settings', icon: Settings, label: 'Paramètres' },
];

export default function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = isAdmin ? adminNav : agentNav;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-card border-r flex flex-col">
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
          <UtensilsCrossed className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-bold text-sm">Restaurant Manager</h2>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
      </div>

      <Separator />

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Separator />

      <div className="p-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
          Déconnexion
        </Button>
      </div>
    </aside>
  );
}
