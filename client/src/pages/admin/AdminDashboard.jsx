import { useState, useEffect } from 'react';
import { statsAPI } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, ShoppingCart, Receipt, TrendingUp, Users, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [agentStats, setAgentStats] = useState([]);
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const loadStats = async () => {
    try {
      const [dashRes, agentsRes] = await Promise.all([
        statsAPI.getDashboard({ period }),
        statsAPI.getAgents({ period })
      ]);
      setStats(dashRes.data.data);
      setAgentStats(agentsRes.data.data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, [period]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadStats();
    socket.on('order:created', refresh);
    socket.on('payment:created', refresh);
    return () => { socket.off('order:created', refresh); socket.off('payment:created', refresh); };
  }, [socket]);

  const statCards = [
    { title: 'Chiffre d\'affaires', value: formatCurrency(stats?.totalRevenue || 0), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Commandes', value: stats?.totalOrders || 0, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Tickets', value: stats?.totalTickets || 0, icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Panier moyen', value: formatCurrency(stats?.avgOrderValue || 0), icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const paymentPieData = stats?.revenueByMethod ? [
    { name: 'Espèces', value: stats.revenueByMethod.cash },
    { name: 'Carte', value: stats.revenueByMethod.card },
    { name: 'Mobile Money', value: stats.revenueByMethod.mobile_money },
    { name: 'Carte cadeau', value: stats.revenueByMethod.gift_card },
  ].filter(d => d.value > 0) : [];

  if (loading) {
    return (
      <div><TopBar title="Dashboard Administrateur" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>
    );
  }

  return (
    <div>
      <TopBar title="Dashboard Administrateur" />
      <div className="p-6 space-y-6">
        {/* Period Selector */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Vue d'ensemble</h2>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Aujourd'hui</SelectItem>
              <SelectItem value="week">Cette semaine</SelectItem>
              <SelectItem value="month">Ce mois</SelectItem>
              <SelectItem value="year">Cette année</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stat Cards */}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hourly Orders Chart */}
          <Card>
            <CardHeader><CardTitle className="text-base">Commandes par heure</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats?.hourlyData?.filter(h => h.orders > 0) || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} />
                  <YAxis />
                  <Tooltip labelFormatter={(h) => `${h}h`} />
                  <Bar dataKey="orders" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Commandes" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Payment Methods Pie */}
          <Card>
            <CardHeader><CardTitle className="text-base">Répartition des paiements</CardTitle></CardHeader>
            <CardContent>
              {paymentPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={paymentPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {paymentPieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Aucune donnée</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Products */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top Produits</CardTitle></CardHeader>
          <CardContent>
            {stats?.topProducts?.length > 0 ? (
              <div className="space-y-2">
                {stats.topProducts.map((product, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="font-medium">{product.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{product.quantity} vendus</span>
                      <span className="font-bold">{formatCurrency(product.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">Aucune donnée</p>
            )}
          </CardContent>
        </Card>

        {/* Agent Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Users className="w-5 h-5" /> Performance des agents</CardTitle>
          </CardHeader>
          <CardContent>
            {agentStats.length > 0 ? (
              <div className="space-y-3">
                {agentStats.map((stat, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">{stat.agent.firstName[0]}{stat.agent.lastName[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium">{stat.agent.firstName} {stat.agent.lastName}</p>
                        <p className="text-xs text-muted-foreground">{stat.agent.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-bold">{stat.orders}</p>
                        <p className="text-xs text-muted-foreground">Commandes</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold">{stat.transactions}</p>
                        <p className="text-xs text-muted-foreground">Transactions</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-primary">{formatCurrency(stat.revenue)}</p>
                        <p className="text-xs text-muted-foreground">CA</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">Aucun agent actif</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
