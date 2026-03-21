import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { statsAPI, cashRegisterAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { ShoppingCart, Receipt, DollarSign, TrendingUp, Wallet } from 'lucide-react';

export default function AgentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [cashRegister, setCashRegister] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, cashRes] = await Promise.all([
        statsAPI.getAgent(user._id, { period: 'today' }),
        cashRegisterAPI.getCurrent()
      ]);
      setStats(statsRes.data.data);
      setCashRegister(cashRes.data.data);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: 'Commandes du jour', value: stats?.totalOrders || 0, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Chiffre d\'affaires', value: formatCurrency(stats?.totalRevenue || 0), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Tickets générés', value: stats?.totalTickets || 0, icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Panier moyen', value: formatCurrency(stats?.avgOrderValue || 0), icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  return (
    <div>
      <TopBar title={`Bonjour, ${user?.firstName}!`} />
      <div className="p-6 space-y-6">
        {/* Cash Register Status */}
        <Card className={cashRegister ? 'border-green-200 bg-green-50/50' : 'border-yellow-200 bg-yellow-50/50'}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Wallet className={cashRegister ? 'text-green-600' : 'text-yellow-600'} />
              <div>
                <p className="font-medium">
                  {cashRegister ? 'Caisse ouverte' : 'Caisse fermée'}
                </p>
                <p className="text-sm text-muted-foreground">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions rapides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <a href="/agent/tables" className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors">
                <ShoppingCart className="w-8 h-8 text-primary" />
                <span className="text-sm font-medium">Nouvelle commande</span>
              </a>
              <a href="/agent/tickets" className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors">
                <Receipt className="w-8 h-8 text-primary" />
                <span className="text-sm font-medium">Voir tickets</span>
              </a>
              <a href="/agent/cash-register" className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors">
                <Wallet className="w-8 h-8 text-primary" />
                <span className="text-sm font-medium">Gérer caisse</span>
              </a>
              <a href="/agent/clients" className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors">
                <TrendingUp className="w-8 h-8 text-primary" />
                <span className="text-sm font-medium">Clients</span>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
