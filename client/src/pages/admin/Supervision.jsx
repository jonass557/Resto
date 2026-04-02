import { useState, useEffect, useCallback } from 'react';
import { ordersAPI, ticketsAPI, statsAPI, invalidateCache, readCache } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Loader2, Activity, ShoppingCart, Receipt, Users, AlertCircle, Clock, Trash2, Banknote, Smartphone, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Supervision() {
  const [orders, setOrders] = useState(() => readCache('/orders', { limit: 50 })?.data?.data || []);
  const [tickets, setTickets] = useState(() => readCache('/tickets', { limit: 50 })?.data?.data || []);
  const [agentStats, setAgentStats] = useState(() => readCache('/stats/agents', { period: 'today' })?.data?.data || []);
  const [loading, setLoading] = useState(() =>
    !readCache('/orders', { limit: 50 }) || !readCache('/tickets', { limit: 50 }) || !readCache('/stats/agents', { period: 'today' })
  );
  const { socket } = useSocket();
  const [deletingId, setDeletingId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [ordersRes, ticketsRes, agentsRes] = await Promise.all([
        ordersAPI.getAll({ limit: 50 }),
        ticketsAPI.getAll({ limit: 50 }),
        statsAPI.getAgents({ period: 'today' })
      ]);
      setOrders(ordersRes.data.data);
      setTickets(ticketsRes.data.data);
      setAgentStats(agentsRes.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur chargement supervision');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      invalidateCache('/orders');
      invalidateCache('/tickets');
      loadData();
    };
    const onInvoiceCreated = () => {
      invalidateCache('/tickets');
      loadData();
      toast('📋 Nouvelle facture en attente de paiement', {
        icon: '⏳',
        duration: 6000,
        style: { background: '#fef3c7', color: '#92400e', fontWeight: '600' }
      });
    };
    socket.on('order:created', refresh);
    socket.on('order:status-changed', refresh);
    socket.on('ticket:created', refresh);
    socket.on('ticket:invoice-created', onInvoiceCreated);
    socket.on('payment:created', refresh);
    socket.on('ticket:deleted', refresh);
    return () => {
      socket.off('order:created', refresh);
      socket.off('order:status-changed', refresh);
      socket.off('ticket:created', refresh);
      socket.off('ticket:invoice-created', onInvoiceCreated);
      socket.off('payment:created', refresh);
      socket.off('ticket:deleted', refresh);
    };
  }, [socket, loadData]);

  const activeOrders = orders.filter(o => !['paid', 'cancelled'].includes(o.status));
  const pendingInvoices = tickets.filter(t => t.type === 'invoice' && !t.isPaid);

  const handleDeleteInvoice = async (id) => {
    setDeletingId(id);
    try {
      await ticketsAPI.delete(id);
      toast.success('Facture supprimée');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur suppression');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div><TopBar title="Supervision en temps réel" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>;
  }

  return (
    <div>
      <TopBar title="Supervision en temps réel" />
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Live Status */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeOrders.length}</p>
                <p className="text-sm text-muted-foreground">Commandes actives</p>
              </div>
              <Activity className="ml-auto w-5 h-5 text-blue-500 animate-pulse" />
            </CardContent>
          </Card>
          <Card className={`border-amber-200 bg-amber-50/30 ${pendingInvoices.length > 0 ? 'ring-2 ring-amber-400' : ''}`}>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className={`w-6 h-6 text-amber-600 ${pendingInvoices.length > 0 ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{pendingInvoices.length}</p>
                <p className="text-sm text-muted-foreground">Factures en attente</p>
              </div>
              {pendingInvoices.length > 0 && <AlertCircle className="ml-auto w-5 h-5 text-amber-500 animate-pulse" />}
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/30">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{agentStats.length}</p>
                <p className="text-sm text-muted-foreground">Agents actifs</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue={pendingInvoices.length > 0 ? 'pending' : 'orders'}>
          <TabsList className="flex flex-wrap h-auto gap-0.5 p-1">
            <TabsTrigger value="pending" className="relative text-xs sm:text-sm">
              Factures en attente
              {pendingInvoices.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{pendingInvoices.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders" className="text-xs sm:text-sm">En cours ({activeOrders.length})</TabsTrigger>
            <TabsTrigger value="all-orders" className="text-xs sm:text-sm">Toutes</TabsTrigger>
            <TabsTrigger value="tickets" className="text-xs sm:text-sm">Tickets</TabsTrigger>
            <TabsTrigger value="agents" className="text-xs sm:text-sm">Agents</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-3 mt-4">
            {pendingInvoices.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Aucune facture en attente de paiement</p>
            ) : pendingInvoices.map(ticket => (
              <Card key={ticket._id} className="border-amber-200 bg-amber-50/20">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="font-bold">{ticket.ticketNumber}</p>
                      <Badge variant="outline" className="text-amber-700 border-amber-300">En attente</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {ticket.tableNumber ? `Table ${ticket.tableNumber}` : ticket.table?.number ? `Table ${ticket.table.number}` : 'À emporter'} &nbsp;|&nbsp;
                      Agent: {ticket.agent?.firstName} {ticket.agent?.lastName} &nbsp;|&nbsp;
                      {formatDateTime(ticket.createdAt)}
                    </p>
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {ticket.items?.map((item, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{item.quantity}x {item.name}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="font-bold text-lg text-amber-700">{formatCurrency(ticket.total)}</p>
                    <Button size="sm" variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                      disabled={deletingId === ticket._id}
                      onClick={() => handleDeleteInvoice(ticket._id)}>
                      {deletingId === ticket._id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="orders" className="space-y-3 mt-4">
            {activeOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Aucune commande active</p>
            ) : activeOrders.map(order => (
              <Card key={order._id}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold">{order.orderNumber}</p>
                        <Badge className={getStatusColor(order.status)}>{getStatusLabel(order.status)}</Badge>
                        <p className="font-bold text-primary">{formatCurrency(order.total)}</p>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        Table {order.table?.number} | {order.agent?.firstName} {order.agent?.lastName} | {formatDateTime(order.createdAt)}
                      </p>
                      <div className="flex gap-1 mt-1 flex-wrap">{order.items?.map((item, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{item.quantity}x {item.name}</Badge>
                      ))}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="all-orders" className="space-y-3 mt-4">
            {orders.map(order => (
              <Card key={order._id}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-bold text-sm">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">Table {order.table?.number} | {order.agent?.firstName} | {formatDateTime(order.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={getStatusColor(order.status)}>{getStatusLabel(order.status)}</Badge>
                      <p className="font-bold text-sm">{formatCurrency(order.total)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="tickets" className="space-y-3 mt-4">
            {tickets.map(ticket => (
              <Card key={ticket._id}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-bold text-sm">{ticket.ticketNumber}</p>
                      <p className="text-xs text-muted-foreground">Table {ticket.table?.number} | {ticket.agent?.firstName} | {formatDateTime(ticket.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={ticket.type === 'invoice' ? 'default' : 'secondary'} className="text-xs">{ticket.type === 'invoice' ? 'Facture' : 'Ticket'}</Badge>
                      <Badge variant={ticket.isPaid ? 'default' : 'destructive'} className="text-xs">{ticket.isPaid ? 'Payé' : 'Impayé'}</Badge>
                      <p className="font-bold text-sm">{formatCurrency(ticket.total)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="agents" className="space-y-3 mt-4">
            {agentStats.map((stat, i) => (
              <Card key={i}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="font-bold text-primary text-sm">{stat.agent.firstName[0]}{stat.agent.lastName[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{stat.agent.firstName} {stat.agent.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{stat.agent.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-4">
                        <div className="text-center"><p className="font-bold text-sm">{stat.orders}</p><p className="text-xs text-muted-foreground">Cmd</p></div>
                        <div className="text-center"><p className="font-bold text-sm">{stat.transactions}</p><p className="text-xs text-muted-foreground">Trans.</p></div>
                        <div className="text-center"><p className="font-bold text-sm text-primary">{formatCurrency(stat.revenue)}</p><p className="text-xs text-muted-foreground">CA Total</p></div>
                      </div>
                      {stat.byMethod && stat.revenue > 0 && (
                        <div className="flex items-center gap-3 text-xs">
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
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
