import { useState, useEffect, useCallback } from 'react';
import { ordersAPI, ticketsAPI, statsAPI } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Loader2, Activity, ShoppingCart, Receipt, Users } from 'lucide-react';

export default function Supervision() {
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [agentStats, setAgentStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

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
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadData();
    socket.on('order:created', refresh);
    socket.on('order:status-changed', refresh);
    socket.on('ticket:created', refresh);
    socket.on('ticket:invoice-created', refresh);
    socket.on('payment:created', refresh);
    return () => {
      socket.off('order:created', refresh);
      socket.off('order:status-changed', refresh);
      socket.off('ticket:created', refresh);
      socket.off('ticket:invoice-created', refresh);
      socket.off('payment:created', refresh);
    };
  }, [socket, loadData]);

  const activeOrders = orders.filter(o => !['paid', 'cancelled'].includes(o.status));

  if (loading) {
    return <div><TopBar title="Supervision en temps réel" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>;
  }

  return (
    <div>
      <TopBar title="Supervision en temps réel" />
      <div className="p-6 space-y-6">
        {/* Live Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <Card className="border-purple-200 bg-purple-50/30">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <Receipt className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tickets.filter(t => !t.isPaid).length}</p>
                <p className="text-sm text-muted-foreground">Tickets impayés</p>
              </div>
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

        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Commandes en cours ({activeOrders.length})</TabsTrigger>
            <TabsTrigger value="all-orders">Toutes les commandes</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-3 mt-4">
            {activeOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Aucune commande active</p>
            ) : activeOrders.map(order => (
              <Card key={order._id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold">{order.orderNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      Table {order.table?.number} | {order.agent?.firstName} {order.agent?.lastName} | {formatDateTime(order.createdAt)}
                    </p>
                    <div className="flex gap-1 mt-1">{order.items?.map((item, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{item.quantity}x {item.name}</Badge>
                    ))}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={getStatusColor(order.status)}>{getStatusLabel(order.status)}</Badge>
                    <p className="font-bold text-primary">{formatCurrency(order.total)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="all-orders" className="space-y-3 mt-4">
            {orders.map(order => (
              <Card key={order._id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold">{order.orderNumber}</p>
                    <p className="text-sm text-muted-foreground">Table {order.table?.number} | {order.agent?.firstName} | {formatDateTime(order.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={getStatusColor(order.status)}>{getStatusLabel(order.status)}</Badge>
                    <p className="font-bold">{formatCurrency(order.total)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="tickets" className="space-y-3 mt-4">
            {tickets.map(ticket => (
              <Card key={ticket._id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold">{ticket.ticketNumber}</p>
                    <p className="text-sm text-muted-foreground">Table {ticket.table?.number} | {ticket.agent?.firstName} | {formatDateTime(ticket.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={ticket.type === 'invoice' ? 'default' : 'secondary'}>{ticket.type === 'invoice' ? 'Facture' : 'Ticket'}</Badge>
                    <Badge variant={ticket.isPaid ? 'default' : 'destructive'}>{ticket.isPaid ? 'Payé' : 'Impayé'}</Badge>
                    <p className="font-bold">{formatCurrency(ticket.total)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="agents" className="space-y-3 mt-4">
            {agentStats.map((stat, i) => (
              <Card key={i}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary text-sm">{stat.agent.firstName[0]}{stat.agent.lastName[0]}</span>
                    </div>
                    <div>
                      <p className="font-bold">{stat.agent.firstName} {stat.agent.lastName}</p>
                      <p className="text-sm text-muted-foreground">{stat.agent.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center"><p className="font-bold">{stat.orders}</p><p className="text-xs text-muted-foreground">Commandes</p></div>
                    <div className="text-center"><p className="font-bold">{stat.transactions}</p><p className="text-xs text-muted-foreground">Transactions</p></div>
                    <div className="text-center"><p className="font-bold text-primary">{formatCurrency(stat.revenue)}</p><p className="text-xs text-muted-foreground">CA</p></div>
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
