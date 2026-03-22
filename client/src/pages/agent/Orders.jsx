import { useState, useEffect, useCallback } from 'react';
import { ordersAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Loader2, Eye, CheckCircle, XCircle, UtensilsCrossed, Truck, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const { user } = useAuth();
  const { socket } = useSocket();

  const loadOrders = useCallback(async () => {
    try {
      const { data } = await ordersAPI.getAll({ agent: user?._id, limit: 100 });
      setOrders(data.data);
    } catch (error) {
      toast.error('Erreur chargement commandes');
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    if (!socket) return;
    socket.on('order:created', loadOrders);
    socket.on('order:status-changed', loadOrders);
    socket.on('order:deleted', loadOrders);
    return () => {
      socket.off('order:created', loadOrders);
      socket.off('order:status-changed', loadOrders);
      socket.off('order:deleted', loadOrders);
    };
  }, [socket, loadOrders]);

  const updateStatus = async (orderId, status) => {
    try {
      await ordersAPI.updateStatus(orderId, status);
      toast.success(`Commande ${status === 'served' ? 'servie' : status === 'cancelled' ? 'annulée' : 'mise à jour'}`);
      loadOrders();
      setSelectedOrder(null);
    } catch (error) {
      toast.error('Erreur mise à jour');
    }
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  return (
    <div>
      <TopBar title="Commandes" />
      <div className="p-3 sm:p-6 space-y-4">
        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
          {['all', 'pending', 'in_progress', 'ready', 'served', 'paid', 'cancelled'].map((s) => (
            <Button key={s} variant={filter === s ? 'default' : 'outline'} size="sm" onClick={() => setFilter(s)}>
              {s === 'all' ? 'Toutes' : getStatusLabel(s)}
              <Badge variant="secondary" className="ml-2">
                {s === 'all' ? orders.length : orders.filter(o => o.status === s).length}
              </Badge>
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Aucune commande trouvée</p>
        ) : (
          <div className="grid gap-3">
            {filtered.map(order => (
              <Card key={order._id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedOrder(order)}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm sm:text-base">{order.orderNumber}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {order.orderType === 'dine_in' ? `Table ${order.table?.number || '?'}` : order.orderType === 'delivery' ? `Livraison — ${order.deliveryInfo?.clientName || ''}` : 'À emporter'}
                        {' | '}{order.agent?.firstName} {order.agent?.lastName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {order.orderType === 'dine_in' ? <><UtensilsCrossed className="w-3 h-3 mr-1" />Sur place</> : order.orderType === 'delivery' ? <><Truck className="w-3 h-3 mr-1" />Livraison</> : <><ShoppingBag className="w-3 h-3 mr-1" />Emporter</>}
                      </Badge>
                      <Badge className={getStatusColor(order.status)}>{getStatusLabel(order.status)}</Badge>
                      <p className="font-bold text-primary text-sm">{formatCurrency(order.total)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {order.items?.map((item, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{item.quantity}x {item.name}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Commande {selectedOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>
                  {selectedOrder.orderType === 'dine_in' ? `Table: ${selectedOrder.table?.number || '?'}` : selectedOrder.orderType === 'delivery' ? `Livraison: ${selectedOrder.deliveryInfo?.clientName || ''} — ${selectedOrder.deliveryInfo?.phone || ''}` : 'À emporter'}
                </span>
                <span>Agent: {selectedOrder.agent?.firstName} {selectedOrder.agent?.lastName}</span>
              </div>
              {selectedOrder.orderType === 'delivery' && selectedOrder.deliveryInfo?.address && (
                <p className="text-sm text-muted-foreground">Adresse: {selectedOrder.deliveryInfo.address}</p>
              )}
              <div className="flex gap-2">
                <Badge variant="outline">
                  {selectedOrder.orderType === 'dine_in' ? 'Sur place' : selectedOrder.orderType === 'delivery' ? 'Livraison' : 'À emporter'}
                </Badge>
                <Badge className={getStatusColor(selectedOrder.status)}>{getStatusLabel(selectedOrder.status)}</Badge>
              </div>
              <div className="bg-muted p-3 rounded-lg space-y-2">
                {selectedOrder.items?.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="font-medium">{formatCurrency(item.totalPrice)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>
              {!['paid', 'cancelled'].includes(selectedOrder.status) && (
                <div className="flex gap-2">
                  {selectedOrder.status === 'pending' && (
                    <Button className="flex-1" onClick={() => updateStatus(selectedOrder._id, 'in_progress')}>
                      En préparation
                    </Button>
                  )}
                  {selectedOrder.status === 'in_progress' && (
                    <Button className="flex-1" onClick={() => updateStatus(selectedOrder._id, 'ready')}>
                      <CheckCircle className="w-4 h-4 mr-2" /> Prêt
                    </Button>
                  )}
                  {selectedOrder.status === 'ready' && (
                    <Button className="flex-1" onClick={() => updateStatus(selectedOrder._id, 'served')}>
                      <CheckCircle className="w-4 h-4 mr-2" /> Servi
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => updateStatus(selectedOrder._id, 'cancelled')}>
                    <XCircle className="w-4 h-4 mr-2" /> Annuler
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
