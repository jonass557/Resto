import { useState, useEffect, useCallback } from 'react';
import { statsAPI, notificationsAPI } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  DollarSign, ShoppingCart, Receipt, TrendingUp, Users, Loader2,
  Bell, BellRing, CheckCheck, Wallet, LogIn, CreditCard, Banknote,
  Smartphone, ArrowUpRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];

const NOTIF_ICONS = {
  cash_opened: { icon: Wallet, color: 'text-green-600', bg: 'bg-green-50' },
  cash_closed: { icon: Wallet, color: 'text-red-600', bg: 'bg-red-50' },
  agent_login: { icon: LogIn, color: 'text-blue-600', bg: 'bg-blue-50' },
  payment_received: { icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  invoice_created: { icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-50' },
  invoice_deleted: { icon: Receipt, color: 'text-red-600', bg: 'bg-red-50' },
  ticket_deleted: { icon: Receipt, color: 'text-orange-600', bg: 'bg-orange-50' },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [agentStats, setAgentStats] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const loadStats = useCallback(async () => {
    try {
      const [dashRes, agentsRes, revenueRes] = await Promise.all([
        statsAPI.getDashboard({ period }),
        statsAPI.getAgents({ period }),
        statsAPI.getRevenueChart({ period })
      ]);
      setStats(dashRes.data.data);
      setAgentStats(agentsRes.data.data);
      setRevenueData(revenueRes.data.data || []);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await notificationsAPI.getAll({ limit: 20 });
      setNotifications(data.data);
      setUnreadCount(data.unreadCount);
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadStats();
    const refreshNotif = () => loadNotifications();
    socket.on('order:created', refresh);
    socket.on('payment:created', refresh);
    socket.on('notification:new', refreshNotif);
    return () => {
      socket.off('order:created', refresh);
      socket.off('payment:created', refresh);
      socket.off('notification:new', refreshNotif);
    };
  }, [socket, loadStats, loadNotifications]);

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error(error);
    }
  };

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
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Aujourd'hui</SelectItem>
              <SelectItem value="week">Cette semaine</SelectItem>
              <SelectItem value="month">Ce mois</SelectItem>
              <SelectItem value="semester">Ce semestre</SelectItem>
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
          {/* Revenue Evolution Chart */}
          <Card>
            <CardHeader><CardTitle className="text-base">Évolution des revenus</CardTitle></CardHeader>
            <CardContent>
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d) => { const p = d.split('-'); return `${p[2]}/${p[1]}`; }} />
                    <YAxis tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={(d) => `Date: ${d}`} />
                    <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} strokeWidth={2} name="Revenus" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Aucune donnée pour cette période</p>
              )}
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

        {/* Hourly Orders Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">Commandes par heure</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats?.hourlyData?.filter(h => h.orders > 0) || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} />
                <YAxis />
                <Tooltip labelFormatter={(h) => `${h}h`} formatter={(v) => [v, 'Commandes']} />
                <Bar dataKey="orders" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Commandes" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Agent Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Users className="w-5 h-5" /> Revenus par agent</CardTitle>
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
                          <p className="font-medium text-sm">{stat.agent.firstName} {stat.agent.lastName}</p>
                          <p className="text-xs text-muted-foreground">{stat.orders} cmd · {stat.transactions} trans.</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatCurrency(stat.revenue)}</p>
                        <p className="text-xs text-muted-foreground">
                          {stat.lastLogin ? `Dernière connexion: ${new Date(stat.lastLogin).toLocaleDateString('fr-FR')}` : 'Jamais connecté'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">Aucun agent actif</p>
              )}
            </CardContent>
          </Card>

          {/* Notifications / Activity Feed */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  {unreadCount > 0 ? <BellRing className="w-5 h-5 text-orange-500" /> : <Bell className="w-5 h-5" />}
                  Activité
                  {unreadCount > 0 && <Badge variant="destructive" className="ml-1 text-xs">{unreadCount}</Badge>}
                </CardTitle>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllRead}>
                    <CheckCheck className="w-4 h-4 mr-1" /> Tout lire
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {notifications.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {notifications.map((notif) => {
                    const config = NOTIF_ICONS[notif.type] || { icon: Bell, color: 'text-gray-600', bg: 'bg-gray-50' };
                    const Icon = config.icon;
                    return (
                      <div key={notif._id} className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${notif.isRead ? 'bg-muted/50' : 'bg-blue-50/50 border border-blue-100'}`}>
                        <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{notif.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{formatDateTime(notif.createdAt)}</p>
                        </div>
                        {!notif.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">Aucune activité récente</p>
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
      </div>
    </div>
  );
}
