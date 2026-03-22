import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tablesAPI, productsAPI, categoriesAPI, ordersAPI, ticketsAPI } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import PaymentDialog from '@/components/PaymentDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, getStatusColor, getStatusLabel } from '@/lib/utils';
import { ArrowLeft, Plus, Minus, Trash2, Send, Search, Receipt, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TableDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [table, setTable] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [tableRes, productsRes, categoriesRes] = await Promise.all([
        tablesAPI.getAll(),
        productsAPI.getAll({ isAvailable: true }),
        categoriesAPI.getAll()
      ]);
      const found = tableRes.data.data.find(t => t._id === id);
      setTable(found);
      setProducts(productsRes.data.data);
      setCategories(categoriesRes.data.data);
    } catch (error) {
      toast.error('Erreur chargement des données');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadData();
    socket.on('order:created', refresh);
    socket.on('table:updated', refresh);
    socket.on('payment:created', refresh);
    return () => {
      socket.off('order:created', refresh);
      socket.off('table:updated', refresh);
      socket.off('payment:created', refresh);
    };
  }, [socket, loadData]);

  const filteredProducts = products.filter(p => {
    const matchCategory = selectedCategory === 'all' || p.category?._id === selectedCategory;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product._id);
      if (existing) {
        return prev.map(item =>
          item.productId === product._id
            ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [...prev, {
        productId: product._id,
        name: product.name,
        unitPrice: product.price,
        quantity: 1,
        totalPrice: product.price,
        notes: ''
      }];
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const newQty = Math.max(0, item.quantity + delta);
      return newQty === 0 ? null : { ...item, quantity: newQty, totalPrice: newQty * item.unitPrice };
    }).filter(Boolean));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  const submitOrder = async () => {
    if (cart.length === 0) { toast.error('Le panier est vide'); return; }
    setSubmitting(true);
    try {
      const { data } = await ordersAPI.create({
        tableId: id,
        orderType: 'dine_in',
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes
        }))
      });
      toast.success(`Commande ${data.data.order.orderNumber} créée!`);
      toast(`🖨️ Ticket ${data.data.ticket.ticketNumber} envoyé à l'impression`, { icon: '🧾', duration: 4000 });
      setCart([]);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur création commande');
    } finally {
      setSubmitting(false);
    }
  };

  const generateInvoice = async () => {
    try {
      const { data } = await ticketsAPI.createInvoice(id);
      setSelectedInvoice(data.data);
      setPaymentDialog(true);
      toast.success('Facture globale générée');
      toast(`🖨️ Facture ${data.data.ticketNumber} envoyée à l'impression`, { icon: '🧾', duration: 4000 });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur génération facture');
    }
  };

  const onPaymentSuccess = () => {
    setPaymentDialog(false);
    setSelectedInvoice(null);
    loadData();
  };

  if (loading) {
    return (
      <div>
        <TopBar title="Chargement..." />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <div>
        <TopBar title="Table introuvable" />
        <div className="p-6">
          <Button variant="outline" onClick={() => navigate('/agent/tables')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title={`Table ${table.number} - ${table.name}`} />
      <div className="p-4 flex gap-4 h-[calc(100vh-4rem)]">
        {/* Left: Products */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/agent/tables')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un produit..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Categories */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
            >
              Tout
            </Button>
            {categories.map(cat => (
              <Button
                key={cat._id}
                variant={selectedCategory === cat._id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat._id)}
                style={selectedCategory === cat._id ? {} : { borderColor: cat.color, color: cat.color }}
              >
                {cat.name}
              </Button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 content-start">
            {filteredProducts.map(product => (
              <Card
                key={product._id}
                className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-3">
                  {product.image && (
                    <img src={product.image} alt={product.name} className="w-full h-20 object-cover rounded mb-2" />
                  )}
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-primary font-bold text-sm mt-1">{formatCurrency(product.price)}</p>
                  {product.stock !== -1 && product.stock <= product.minStock && (
                    <Badge variant="destructive" className="mt-1 text-xs">Stock faible</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Right: Cart & Orders */}
        <div className="w-96 flex flex-col border rounded-lg bg-card">
          {/* Current Orders */}
          {table.currentOrders?.length > 0 && (
            <div className="p-3 border-b max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">Commandes en cours ({table.currentOrders.length})</h3>
                <Button size="sm" variant="outline" onClick={generateInvoice}>
                  <Receipt className="w-3 h-3 mr-1" /> Facturer
                </Button>
              </div>
              {table.currentOrders.map((order, idx) => (
                <div key={order._id || idx} className="text-xs p-2 bg-muted rounded mb-1">
                  <div className="flex justify-between">
                    <span className="font-medium">{order.orderNumber || `Commande ${idx + 1}`}</span>
                    <Badge className={`${getStatusColor(order.status)} text-xs`}>
                      {getStatusLabel(order.status)}
                    </Badge>
                  </div>
                  {order.items?.map((item, i) => (
                    <div key={i} className="flex justify-between mt-1 text-muted-foreground">
                      <span>{item.quantity}x {item.name}</span>
                      <span>{formatCurrency(item.totalPrice)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Cart */}
          <div className="p-3 border-b">
            <h3 className="font-semibold">Nouvelle commande</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                Cliquez sur un produit pour l'ajouter
              </p>
            ) : (
              cart.map(item => (
                <div key={item.productId} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice)} / unité</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.productId, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.productId, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm font-bold w-20 text-right">{formatCurrency(item.totalPrice)}</p>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.productId)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Cart Total & Submit */}
          <div className="border-t p-3 space-y-3">
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold text-primary">{formatCurrency(cartTotal)}</span>
            </div>
            <Button className="w-full" size="lg" onClick={submitOrder} disabled={cart.length === 0 || submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Envoyer la commande
            </Button>
          </div>
        </div>
      </div>

      {/* Split Payment Dialog */}
      <PaymentDialog
        open={paymentDialog}
        onOpenChange={setPaymentDialog}
        invoice={selectedInvoice}
        onSuccess={onPaymentSuccess}
      />
    </div>
  );
}
