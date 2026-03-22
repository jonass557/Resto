import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { cashRegisterAPI } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  UtensilsCrossed, LayoutDashboard, ShoppingCart, Receipt, CreditCard,
  Users, BarChart3, Package, Settings, LogOut, ChefHat, Wallet,
  BookOpen, UserCircle, Printer, TrendingUp, FileText, PieChart, Truck,
  Wifi, WifiOff, RefreshCw, Loader2, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

const agentNav = [
  { to: '/agent', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/agent/tables', icon: UtensilsCrossed, label: 'Tables (sur place)' },
  { to: '/agent/new-order', icon: Truck, label: 'Emporter / Livraison' },
  { to: '/agent/orders', icon: ShoppingCart, label: 'Commandes' },
  { to: '/agent/tickets', icon: Receipt, label: 'Tickets' },
  { to: '/agent/cash-register', icon: Wallet, label: 'Caisse' },
  { to: '/agent/clients', icon: UserCircle, label: 'Clients' },
  { to: '/agent/history', icon: FileText, label: 'Historique' },
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

export default function Sidebar({ onNavigate }) {
  const { user, isAdmin, logout } = useAuth();
  const { isOnline, pendingCount, syncing, syncPendingActions } = useOffline();
  const navigate = useNavigate();
  const navItems = isAdmin ? adminNav : agentNav;

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closingAmount, setClosingAmount] = useState('');
  const [closingLoading, setClosingLoading] = useState(false);

  const handleLogout = async () => {
    if (isAdmin) {
      logout();
      navigate('/login');
      return;
    }
    // Agent: check if cash register is open
    try {
      const res = await cashRegisterAPI.getCurrent();
      if (res.data.data) {
        setShowCloseDialog(true);
        return;
      }
    } catch { /* no open register, proceed */ }
    logout();
    navigate('/login');
  };

  const handleCloseAndLogout = async () => {
    setClosingLoading(true);
    try {
      await cashRegisterAPI.close({ closingAmount: parseFloat(closingAmount) || 0 });
      toast.success('Caisse clôturée avec succès');
      setShowCloseDialog(false);
      logout();
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la clôture');
    } finally {
      setClosingLoading(false);
    }
  };

  return (
    <aside className="h-screen w-64 bg-card border-r flex flex-col">
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
            onClick={onNavigate}
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

      {/* Online / Offline status + Sync */}
      <div className="px-3 pb-2">
        <div className={cn(
          'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium',
          isOnline ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        )}>
          <div className="flex items-center gap-2">
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </div>
          {pendingCount > 0 && (
            <button
              onClick={syncPendingActions}
              disabled={syncing || !isOnline}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/70 hover:bg-white border text-xs disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync ({pendingCount})
            </button>
          )}
        </div>
      </div>

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

      {/* Cash register close dialog for agents */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Clôturer la caisse
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Vous devez clôturer votre caisse avant de vous déconnecter. L'administrateur sera informé de la fermeture.
          </p>
          <div className="space-y-3">
            <div>
              <Label>Montant en caisse (FCFA)</Label>
              <Input type="number" placeholder="0" value={closingAmount} onChange={e => setClosingAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>Annuler</Button>
            <Button onClick={handleCloseAndLogout} disabled={closingLoading}>
              {closingLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Clôturer et se déconnecter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
