import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { statsAPI, cashRegisterAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { ShoppingCart, Receipt, DollarSign, TrendingUp, Wallet, Loader2, Calendar } from 'lucide-react';

const PERIODS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'year', label: "Cette année" },
];

export default function AgentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [cashRegister, setCashRegister] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');

  const loadData = useCallback(async () => {
    setLoading(true);
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
    }
  }, [user._id, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const periodLabel = PERIODS.find(p => p.key === period)?.label || period;

  const statCards = [
    { title: `Commandes (${periodLabel})`, value: stats?.totalOrders || 0, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Chiffre d\'affaires', value: formatCurrency(stats?.totalRevenue || 0), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Tickets générés', value: stats?.totalTickets || 0, icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Panier moyen', value: formatCurrency(stats?.avgOrderValue || 0), icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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

        {/* Cash Register Status */}
        <Card className={cashRegister ? 'border-green-200 bg-green-50/50' : 'border-yellow-200 bg-yellow-50/50'}>
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 py-4">
            <div className="flex items-center gap-3">
              <Wallet className={`w-5 h-5 ${cashRegister ? 'text-green-600' : 'text-yellow-600'}`} />
              <div>
                <p className="font-medium text-sm sm:text-base">
                  {cashRegister ? 'Caisse ouverte' : 'Caisse fermée'}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {cashRegister
                    ? `Session: ${cashRegister.sessionNumber} | Ouverture: ${formatCurrency(cashRegister.openingAmount)}`
                    : 'Ouvrez votre caisse pour commencer à travailler'}
                </p>
              </div>
            </div>
            <Badge variant={cashRegister ? 'default' : 'secondary'}>
              {cashRegister ? 'Active' : 'Inactive'}
            </Badge>
          </CardContent>
        </Card>

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <a href="/agent/tables" className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border hover:bg-accent transition-colors">
                <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                <span className="text-xs sm:text-sm font-medium text-center">Nouvelle commande</span>
              </a>
              <a href="/agent/tickets" className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border hover:bg-accent transition-colors">
                <Receipt className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                <span className="text-xs sm:text-sm font-medium text-center">Voir tickets</span>
              </a>
              <a href="/agent/cash-register" className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border hover:bg-accent transition-colors">
                <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                <span className="text-xs sm:text-sm font-medium text-center">Gérer caisse</span>
              </a>
              <a href="/agent/history" className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border hover:bg-accent transition-colors">
                <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                <span className="text-xs sm:text-sm font-medium text-center">Historique</span>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
