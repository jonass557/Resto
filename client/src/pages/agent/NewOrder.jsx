import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { productsAPI, categoriesAPI, ordersAPI, ticketsAPI, invalidateCache } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import PaymentDialog from '@/components/PaymentDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, Plus, Minus, Trash2, Send, Search, Receipt, Loader2, Truck, ShoppingBag, MapPin, Phone, User } from 'lucide-react';
import toast from 'react-hot-toast';

export default function NewOrder() {
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [orderType, setOrderType] = useState('takeaway');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mobileTab, setMobileTab] = useState('products');

  // Delivery info
  const [deliveryInfo, setDeliveryInfo] = useState({ clientName: '', phone: '', address: '', notes: '' });

  // Payment dialog
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);

  // Track orders placed in this session (for consolidated invoice)
  const [sessionOrders, setSessionOrders] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        productsAPI.getAll({ isAvailable: true }),
        categoriesAPI.getAll()
      ]);
      setProducts(productsRes.data.data);
      setCategories(categoriesRes.data.data);
    } catch (error) {
      toast.error('Erreur chargement des données');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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

    if (orderType === 'delivery' && (!deliveryInfo.clientName || !deliveryInfo.phone)) {
      toast.error('Nom et téléphone requis pour la livraison');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        orderType,
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes
        }))
      };

      if (orderType === 'delivery') {
        payload.deliveryInfo = deliveryInfo;
      }

      const { data } = await ordersAPI.create(payload);
      toast.success(`Commande ${data.data.order.orderNumber} créée!`);
      if (data.data.ticket?.ticketNumber) {
        toast(`🖨️ Ticket ${data.data.ticket.ticketNumber} envoyé à l'impression`, { icon: '🧾', duration: 3000 });
      }

      setSessionOrders(prev => [...prev, data.data.order]);
      setCart([]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur création commande');
    } finally {
      setSubmitting(false);
    }
  };

  const generateConsolidatedInvoice = async () => {
    if (sessionOrders.length === 0) { toast.error('Aucune commande passée'); return; }
    try {
      const orderIds = sessionOrders.map(o => o._id);
      const { data } = await ticketsAPI.createInvoiceFromOrders(orderIds);
      setCurrentInvoice(data.data);
      setPaymentDialog(true);
      toast.success('Facture globale générée');
      toast(`🖨️ Facture ${data.data.ticketNumber} envoyée à l'impression`, { icon: '🧾', duration: 4000 });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur génération facture');
    }
  };

  const onPaymentSuccess = () => {
    setPaymentDialog(false);
    setCurrentInvoice(null);
    setSessionOrders([]);
    setCart([]);
    setDeliveryInfo({ clientName: '', phone: '', address: '', notes: '' });
    invalidateCache('/orders');
    toast.success('Paiement confirmé — vous pouvez passer une nouvelle commande', { duration: 3000 });
  };

  const sessionTotal = sessionOrders.reduce((sum, o) => sum + o.total, 0);

  if (loading) {
    return (
      <div>
        <TopBar title="Nouvelle commande" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Nouvelle commande" />
      <div className="p-2 sm:p-4 flex flex-col lg:flex-row gap-3 lg:gap-4" style={{ height: 'calc(100vh - 4rem)', overflow: 'hidden' }}>
        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden gap-2 shrink-0">
          <Button variant={mobileTab === 'products' ? 'default' : 'outline'} className="flex-1" onClick={() => setMobileTab('products')}>
            Produits
          </Button>
          <Button variant={mobileTab === 'cart' ? 'default' : 'outline'} className="flex-1" onClick={() => setMobileTab('cart')}>
            Panier {cart.length > 0 && <Badge className="ml-1.5">{cart.length}</Badge>}
            {sessionOrders.length > 0 && <Badge variant="outline" className="ml-1">{sessionOrders.length} cmd</Badge>}
          </Button>
        </div>
        {/* Left: Products */}
        <div className={`flex-1 flex flex-col min-w-0 ${mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/agent')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher un produit..." className="pl-9 h-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>

          {/* Category filter */}
          <div className="flex gap-1 mb-3 flex-wrap">
            <Button size="sm" variant={selectedCategory === 'all' ? 'default' : 'outline'} onClick={() => setSelectedCategory('all')}>Tout</Button>
            {categories.map(cat => (
              <Button key={cat._id} size="sm" variant={selectedCategory === cat._id ? 'default' : 'outline'}
                onClick={() => setSelectedCategory(cat._id)}
                style={selectedCategory === cat._id ? { backgroundColor: cat.color } : {}}>
                {cat.name}
              </Button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 content-start">
            {filteredProducts.map(product => (
              <Card key={product._id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => addToCart(product)}>
                <CardContent className="p-3 text-center">
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-primary font-bold mt-1">{formatCurrency(product.price)}</p>
                  {product.stock !== -1 && <p className="text-xs text-muted-foreground">Stock: {product.stock}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Right: Order Type + Cart + Session Orders */}
        <div className={`lg:w-96 flex flex-col bg-card rounded-lg border overflow-hidden ${mobileTab === 'products' ? 'hidden lg:flex' : 'flex flex-1'}`}>
          {/* Order Type Selector */}
          <div className="p-3 border-b">
            <Tabs value={orderType} onValueChange={setOrderType}>
              <TabsList className="w-full">
                <TabsTrigger value="takeaway" className="flex-1">
                  <ShoppingBag className="w-4 h-4 mr-1" /> À emporter
                </TabsTrigger>
                <TabsTrigger value="delivery" className="flex-1">
                  <Truck className="w-4 h-4 mr-1" /> Livraison
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Delivery info */}
            {orderType === 'delivery' && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Nom du client *" value={deliveryInfo.clientName}
                    onChange={e => setDeliveryInfo({...deliveryInfo, clientName: e.target.value})} className="h-8 text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Téléphone *" value={deliveryInfo.phone}
                    onChange={e => setDeliveryInfo({...deliveryInfo, phone: e.target.value})} className="h-8 text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Adresse de livraison" value={deliveryInfo.address}
                    onChange={e => setDeliveryInfo({...deliveryInfo, address: e.target.value})} className="h-8 text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Cart */}
          <div className="flex-1 overflow-y-auto p-3">
            <p className="text-sm font-semibold mb-2 flex items-center gap-2">
              Panier ({cart.length})
              {cart.length > 0 && <Badge variant="secondary">{formatCurrency(cartTotal)}</Badge>}
            </p>

            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sélectionnez des produits</p>
            ) : (
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.productId} className="flex items-center justify-between p-2 rounded-lg bg-muted">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice)} x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQuantity(item.productId, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQuantity(item.productId, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.productId)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-bold w-16 text-right">{formatCurrency(item.totalPrice)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Session Orders (already placed) */}
            {sessionOrders.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="text-sm font-semibold mb-2">Commandes passées ({sessionOrders.length})</p>
                <div className="space-y-1">
                  {sessionOrders.map(order => (
                    <div key={order._id} className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-200 text-sm">
                      <div>
                        <p className="font-medium">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">{order.items?.length || 0} article(s)</p>
                      </div>
                      <Badge variant="outline" className="text-green-700">{formatCurrency(order.total)}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="border-t p-3 space-y-2">
            {sessionOrders.length > 0 && (
              <div className="flex justify-between text-sm font-bold p-2 bg-muted rounded-lg">
                <span>Total session ({sessionOrders.length} commandes)</span>
                <span>{formatCurrency(sessionTotal)}</span>
              </div>
            )}

            <Button className="w-full" onClick={submitOrder} disabled={cart.length === 0 || submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Passer la commande ({formatCurrency(cartTotal)})
            </Button>

            {sessionOrders.length > 0 && (
              <Button className="w-full" variant="secondary" onClick={generateConsolidatedInvoice}>
                <Receipt className="w-4 h-4 mr-2" /> Facture globale & Paiement ({formatCurrency(sessionTotal)})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Split Payment Dialog */}
      <PaymentDialog
        open={paymentDialog}
        onOpenChange={setPaymentDialog}
        invoice={currentInvoice}
        onSuccess={onPaymentSuccess}
        deliveryInfo={orderType === 'delivery' ? deliveryInfo : null}
      />
    </div>
  );
}
