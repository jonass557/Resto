import { useState, useEffect, useCallback } from 'react';
import { statsAPI, notificationsAPI, ticketsAPI, invalidateCache, readCache } from '@/services/api';
import toast from 'react-hot-toast';
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
  Smartphone, ArrowUpRight, Package, BarChart2, Trash2, Clock, AlertCircle, CheckCircle2
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
  const [period, setPeriod] = useState('today');
  const [stats, setStats] = useState(() => readCache('/stats/dashboard', { period: 'today' })?.data?.data || null);
  const [agentStats, setAgentStats] = useState(() => readCache('/stats/agents', { period: 'today' })?.data?.data || []);
  const [agentPerf, setAgentPerf] = useState(() => readCache('/stats/agent-performance', { period: 'today' })?.data?.data || []);
  const [productAnalytics, setProductAnalytics] = useState(() => readCache('/stats/product-analytics', { period: 'today' })?.data?.data?.slice(0, 15) || []);
  const [revenueData, setRevenueData] = useState(() => readCache('/stats/revenue-chart', { period: 'today' })?.data?.data || []);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(() =>
    !readCache('/stats/dashboard', { period: 'today' }) ||
    !readCache('/stats/agents', { period: 'today' })
  );
  const { socket } = useSocket();

  // Invoices section
  const [invoicesTab, setInvoicesTab] = useState('en_cours');
  const [invoices, setInvoices] = useState({ en_cours: [], a_encaisser: [], paid: [] });
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const loadStats = useCallback(async () => {
    if (!readCache('/stats/dashboard', { period }) || !readCache('/stats/agents', { period })) setLoading(true);
    try {
      const [dashRes, agentsRes, revenueRes, perfRes, prodRes] = await Promise.all([
        statsAPI.getDashboard({ period }),
        statsAPI.getAgents({ period }),
        statsAPI.getRevenueChart({ period }),
        statsAPI.getAgentPerformance({ period }),
        statsAPI.getProductAnalytics({ period })
      ]);
      setStats(dashRes.data.data);
      setAgentStats(agentsRes.data.data);
      setRevenueData(revenueRes.data.data || []);
      setAgentPerf(perfRes.data.data || []);
      setProductAnalytics(prodRes.data.data?.slice(0, 15) || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur chargement des statistiques');
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

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const [enCoursRes, aEncaisserRes, paidRes] = await Promise.all([
        ticketsAPI.getAll({ type: 'invoice', isPaid: 'false', memoStatus: 'en_cours', limit: 100 }),
        ticketsAPI.getAll({ type: 'invoice', isPaid: 'false', memoStatus: 'a_encaisser', limit: 100 }),
        ticketsAPI.getAll({ type: 'invoice', isPaid: 'true', limit: 100 })
      ]);
      setInvoices({
        en_cours: enCoursRes.data.data,
        a_encaisser: aEncaisserRes.data.data,
        paid: paidRes.data.data
      });
    } catch { /* silent */ }
    finally { setInvoicesLoading(false); }
  }, []);

  const handleDeleteInvoice = async (id) => {
    setDeletingId(id);
    try {
      await ticketsAPI.delete(id);
      toast.success('Facture supprimée');
      loadInvoices();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur suppression');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadNotifications(); }, [loadNotifications]);
  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  useEffect(() => {
    if (!socket) return;
    const reloadStats = () => { invalidateCache('/stats'); loadStats(); };
    const refreshNotif = () => loadNotifications();
    const reloadInv = () => { invalidateCache('/tickets'); loadInvoices(); };
    const reloadBoth = () => { reloadStats(); reloadInv(); };
    socket.on('order:created', reloadStats);
    socket.on('order:status-changed', reloadStats);
    socket.on('payment:created', reloadStats);
    socket.on('notification:new', refreshNotif);
    socket.on('invoice:created', reloadInv);
    socket.on('invoice:updated', reloadInv);
    socket.on('invoice:memo', reloadInv);
    socket.on('ticket:paid', reloadBoth);
    socket.on('ticket:deleted', reloadInv);
    return () => {
      socket.off('order:created', reloadStats);
      socket.off('order:status-changed', reloadStats);
      socket.off('payment:created', reloadStats);
      socket.off('notification:new', refreshNotif);
      socket.off('invoice:created', reloadInv);
      socket.off('invoice:updated', reloadInv);
      socket.off('invoice:memo', reloadInv);
      socket.off('ticket:paid', reloadBoth);
      socket.off('ticket:deleted', reloadInv);
    };
  }, [socket, loadStats, loadNotifications, loadInvoices]);

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error(error);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await notificationsAPI.delete(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      setUnreadCount(prev => {
        const wasUnread = notifications.find(n => n._id === id && !n.isRead);
        return wasUnread ? Math.max(0, prev - 1) : prev;
      });
    } catch (error) {
      toast.error('Erreur suppression activité');
    }
  };

  const deleteAllNotifications = async () => {
    try {
      await notificationsAPI.deleteAll();
      setNotifications([]);
      setUnreadCount(0);
      toast.success('Toutes les activités supprimées');
    } catch (error) {
      toast.error('Erreur suppression des activités');
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
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Period Selector */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <h2 className="text-base sm:text-lg font-semibold">Vue d'ensemble</h2>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Revenue Evolution Chart */}
          <Card>
            <CardHeader><CardTitle className="text-base">Évolution des revenus</CardTitle></CardHeader>
            <CardContent>
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
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
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={paymentPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value" label={({ percent }) => `${(percent * 100).toFixed(0)}%`}>
                      {paymentPieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [formatCurrency(value), name]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Aucune donnée</p>
              )}
              {paymentPieData.length > 0 && (
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                  {paymentPieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-medium">{formatCurrency(entry.value)}</span>
                    </div>
                  ))}
                </div>
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          {/* Agent Performance with Percentages */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Users className="w-5 h-5" /> Performance des agents</CardTitle>
            </CardHeader>
            <CardContent>
              {agentPerf.length > 0 ? (
                <div className="space-y-3">
                  {agentPerf.map((stat, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                            {stat.agent.firstName[0]}{stat.agent.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{stat.agent.firstName} {stat.agent.lastName}</p>
                            <p className="text-xs text-muted-foreground">{stat.orders} cmd · {stat.tickets} tickets</p>
                          </div>
                        </div>
                        <p className="font-bold text-sm">{formatCurrency(stat.revenue)}</p>
                      </div>
                      <div className="flex gap-2 items-center text-xs">
                        <span className="w-20 text-muted-foreground shrink-0">CA {stat.revenuePercent}%</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${stat.revenuePercent}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                      <div className="flex gap-2 items-center text-xs">
                        <span className="w-20 text-muted-foreground shrink-0">Cmd {stat.orderPercent}%</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${stat.orderPercent}%`, backgroundColor: COLORS[i % COLORS.length], opacity: 0.6 }} />
                        </div>
                      </div>
                      {stat.byMethod && stat.revenue > 0 && (
                        <div className="flex items-center gap-3 pt-1 text-xs border-t border-border/40">
                          {stat.byMethod.cash > 0 && (
                            <span className="flex items-center gap-1 text-green-700">
                              <Banknote className="w-3 h-3" /> {formatCurrency(stat.byMethod.cash)}
                            </span>
                          )}
                          {stat.byMethod.mobile_money > 0 && (
                            <span className="flex items-center gap-1 text-blue-700">
                              <Smartphone className="w-3 h-3" /> {formatCurrency(stat.byMethod.mobile_money)}
                            </span>
                          )}
                          {stat.byMethod.card > 0 && (
                            <span className="flex items-center gap-1 text-purple-700">
                              <CreditCard className="w-3 h-3" /> {formatCurrency(stat.byMethod.card)}
                            </span>
                          )}
                        </div>
                      )}
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
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={markAllRead}>
                      <CheckCheck className="w-4 h-4 mr-1" /> Tout lire
                    </Button>
                  )}
                  {notifications.length > 0 && (
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={deleteAllNotifications}>
                      <Trash2 className="w-4 h-4 mr-1" /> Tout effacer
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {notifications.length > 0 ? (
                <div className="space-y-2 max-h-[300px] sm:max-h-[400px] overflow-y-auto">
                  {notifications.map((notif) => {
                    const config = NOTIF_ICONS[notif.type] || { icon: Bell, color: 'text-gray-600', bg: 'bg-gray-50' };
                    const Icon = config.icon;
                    return (
                      <div key={notif._id} className={`flex items-start gap-3 p-3 rounded-lg transition-colors group ${notif.isRead ? 'bg-muted/50' : 'bg-blue-50/50 border border-blue-100'}`}>
                        <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{notif.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{formatDateTime(notif.createdAt)}</p>
                        </div>
                        <button
                          onClick={() => deleteNotification(notif._id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 flex-shrink-0"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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

        {/* Invoices Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Receipt className="w-5 h-5" /> Gestion des factures</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-muted p-1 rounded-lg w-fit">
              {[
                { key: 'en_cours', label: 'En cours', icon: Clock, color: 'text-orange-600', count: invoices.en_cours.length },
                { key: 'a_encaisser', label: 'À Encaisser', icon: AlertCircle, color: 'text-yellow-600', count: invoices.a_encaisser.length },
                { key: 'paid', label: 'Payées', icon: CheckCircle2, color: 'text-green-600', count: invoices.paid.length },
              ].map(tab => (
                <button key={tab.key}
                  onClick={() => setInvoicesTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    invoicesTab === tab.key ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>
                  <tab.icon className={`w-3.5 h-3.5 ${tab.color}`} />
                  {tab.label}
                  <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    invoicesTab === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20'
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>

            {invoicesLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : invoices[invoicesTab].length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Aucune facture</p>
            ) : (
              <div className="rounded border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left p-2.5 text-xs font-medium">N° Facture</th>
                      <th className="text-left p-2.5 text-xs font-medium">Table</th>
                      <th className="text-left p-2.5 text-xs font-medium">Agent</th>
                      <th className="text-right p-2.5 text-xs font-medium">Montant</th>
                      <th className="text-center p-2.5 text-xs font-medium">Date</th>
                      {invoicesTab !== 'paid' && <th className="text-center p-2.5 text-xs font-medium">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices[invoicesTab].map(inv => (
                      <tr key={inv._id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-2.5 font-mono text-xs">{inv.ticketNumber}</td>
                        <td className="p-2.5 text-xs">{inv.tableNumber || inv.table?.number || '—'}</td>
                        <td className="p-2.5 text-xs">{inv.agent ? `${inv.agent.firstName} ${inv.agent.lastName}` : '—'}</td>
                        <td className="p-2.5 text-right text-xs font-semibold">{formatCurrency(inv.total)}</td>
                        <td className="p-2.5 text-center text-xs text-muted-foreground">
                          {new Date(inv.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        {invoicesTab !== 'paid' && (
                          <td className="p-2.5 text-center">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                              disabled={deletingId === inv._id}
                              onClick={() => handleDeleteInvoice(inv._id)}>
                              {deletingId === inv._id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Analytics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Package className="w-5 h-5" /> Analytique des produits</CardTitle>
          </CardHeader>
          <CardContent>
            {productAnalytics.length > 0 ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={productAnalytics.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <YAxis dataKey="name" type="category" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value, name) => [name === 'totalRevenue' ? formatCurrency(value) : value, name === 'totalRevenue' ? 'CA' : 'Qté']} />
                    <Bar dataKey="totalQuantity" fill="#10B981" radius={[0, 4, 4, 0]} name="Quantité" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {productAnalytics.map((product, i) => {
                    const maxRev = productAnalytics[0]?.totalRevenue || 1;
                    const pct = Math.round((product.totalRevenue / maxRev) * 100);
                    return (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium truncate">{product.name}</span>
                            <span className="font-bold shrink-0 ml-2">{formatCurrency(product.totalRevenue)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">{product.totalQuantity} vendus</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
