import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { statsAPI, cashRegisterAPI, invalidateCache, readCache } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { ShoppingCart, Receipt, DollarSign, TrendingUp, Wallet, Loader2, Calendar, UtensilsCrossed, AlertTriangle } from 'lucide-react';

const PERIODS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'year', label: "Cette année" },
];

export default function AgentDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [period, setPeriod] = useState('today');
  const [stats, setStats] = useState(() => {
    const u = user || JSON.parse(localStorage.getItem('user') || 'null');
    return readCache(`/stats/agent/${u?._id}`, { period: 'today' })?.data?.data || null;
  });
  const [cashRegister, setCashRegister] = useState(null);
  const [loading, setLoading] = useState(true);

  const firstLoad = useRef(true);

  const loadData = useCallback(async () => {
    if (firstLoad.current) setLoading(true);
    try {
      const [statsRes, cashRes] = await Promise.all([
        statsAPI.getAgent(user._id, { period }),
        cashRegisterAPI.getCurrent()
      ]);
      setStats(statsRes.data.data);
      setCashRegister(cashRes.data.data);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [user._id, period]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const reload = () => { invalidateCache('/stats'); invalidateCache('/cash-register'); loadData(); };
    socket.on('cashRegister:opened', reload);
    socket.on('cashRegister:closed', reload);
    socket.on('ticket:paid', reload);
    socket.on('payment:created', reload);
    socket.on('order:created', reload);
    return () => {
      socket.off('cashRegister:opened', reload);
      socket.off('cashRegister:closed', reload);
      socket.off('ticket:paid', reload);
      socket.off('payment:created', reload);
      socket.off('order:created', reload);
    };
  }, [socket, loadData]);

  const periodLabel = PERIODS.find(p => p.key === period)?.label || period;

  const statCards = [
    { title: `Commandes (${periodLabel})`, value: stats?.totalOrders || 0, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Chiffre d\'affaires', value: formatCurrency(stats?.totalRevenue || 0), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Tickets générés', value: stats?.totalTickets || 0, icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Panier moyen', value: formatCurrency(stats?.avgOrderValue || 0), icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const serviceLabel = cashRegister?.service === 1 ? 'Service 1 (Matin)' : cashRegister?.service === 2 ? 'Service 2 (Soir)' : '';
  const openedAtStr = cashRegister?.openedAt
    ? new Date(cashRegister.openedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div>
      <TopBar title={`Bonjour, ${user?.firstName}!`} />
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Date display */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="w-4 h-4" />
            <span className="capitalize">{dateStr}</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {PERIODS.map(p => (
              <Button key={p.key} variant={period === p.key ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(p.key)} className="text-xs h-8">
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Service Status */}
        {cashRegister ? (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 py-4">
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-sm sm:text-base">{serviceLabel}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Ouvert le {openedAtStr}
                    {cashRegister.openedBy && ` par ${cashRegister.openedBy.firstName} ${cashRegister.openedBy.lastName}`}
                  </p>
                </div>
              </div>
              <Badge variant="default" className="bg-green-600">Caisse active</Badge>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
              <div>
                <p className="font-medium text-sm sm:text-base">Aucun service ouvert</p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Le caissier doit ouvrir votre caisse pour que vous puissiez passer des commandes.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {statCards.map((stat) => (
              <Card key={stat.title}>
                <CardContent className="pt-4 sm:pt-6 pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{stat.title}</p>
                      <p className="text-lg sm:text-2xl font-bold mt-1">{stat.value}</p>
                    </div>
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${stat.bg} flex items-center justify-center shrink-0`}>
                      <stat.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Actions rapides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Link to="/agent/restaurant" className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border hover:bg-accent transition-colors">
                <UtensilsCrossed className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                <span className="text-xs sm:text-sm font-medium text-center">Restaurant</span>
              </Link>
              <Link to="/agent/tickets" className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border hover:bg-accent transition-colors">
                <Receipt className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                <span className="text-xs sm:text-sm font-medium text-center">Voir tickets</span>
              </Link>
              <Link to="/agent/new-order" className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border hover:bg-accent transition-colors">
                <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                <span className="text-xs sm:text-sm font-medium text-center">Emporter / Livraison</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
