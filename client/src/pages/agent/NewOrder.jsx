import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { productsAPI, categoriesAPI, ordersAPI, ticketsAPI, cashRegisterAPI, invalidateCache, readCache } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
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
import { ArrowLeft, Plus, Minus, Trash2, Send, Search, Receipt, Loader2, Truck, ShoppingBag, MapPin, Phone, User, LockKeyhole, ChevronLeft, ChevronRight, BookMarked } from 'lucide-react';
import toast from 'react-hot-toast';

export default function NewOrder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();

  const CART_KEY = `neworder_cart_${user?._id}`;

  const [orderType, setOrderType] = useState('takeaway');
  const [products, setProducts] = useState(() => readCache('/products', { isAvailable: true })?.data?.data || []);
  const [categories, setCategories] = useState(() => readCache('/categories')?.data?.data || []);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(() =>
    !readCache('/products', { isAvailable: true }) || !readCache('/categories')
  );
  const [submitting, setSubmitting] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState('products');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cartRestored, setCartRestored] = useState(false);

  // Delivery info
  const [deliveryInfo, setDeliveryInfo] = useState({ clientName: '', phone: '', address: '', notes: '' });

  // Payment dialog
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);

  // Track orders placed in this session (for consolidated invoice)
  const [sessionOrders, setSessionOrders] = useState([]);

  // Cash register session guard
  const [cashSession, setCashSession] = useState(null); // null=loading, false=closed, obj=open

  const checkCashSession = useCallback(async () => {
    try {
      const { data } = await cashRegisterAPI.getCurrent();
      setCashSession(data.data || false);
    } catch {
      setCashSession(false);
    }
  }, []);

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

  // Restore cart from localStorage once user is known
  useEffect(() => {
    if (!user?._id || cartRestored) return;
    try {
      const saved = localStorage.getItem(`neworder_cart_${user._id}`);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.cart?.length)      setCart(d.cart);
        if (d.orderType)         setOrderType(d.orderType);
        if (d.deliveryInfo)      setDeliveryInfo(d.deliveryInfo);
        if (d.sessionOrders?.length) setSessionOrders(d.sessionOrders);
      }
    } catch {}
    setCartRestored(true);
  }, [user?._id, cartRestored]);

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    if (!user?._id || !cartRestored) return;
    try {
      localStorage.setItem(`neworder_cart_${user._id}`, JSON.stringify({ cart, orderType, deliveryInfo, sessionOrders }));
    } catch {}
  }, [cart, orderType, deliveryInfo, sessionOrders, user?._id, cartRestored]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { checkCashSession(); }, [checkCashSession]);

  useEffect(() => {
    if (!socket) return;
    socket.on('cashRegister:opened', checkCashSession);
    socket.on('cashRegister:closed', checkCashSession);
    return () => {
      socket.off('cashRegister:opened', checkCashSession);
      socket.off('cashRegister:closed', checkCashSession);
    };
  }, [socket, checkCashSession]);

  useEffect(() => {
    if (!socket) return;
    const refreshProducts = () => {
      invalidateCache('/products');
      productsAPI.getAll({ isAvailable: true }).then(r => setProducts(r.data.data)).catch(() => {});
    };
    const refreshCategories = () => {
      invalidateCache('/categories');
      categoriesAPI.getAll().then(r => setCategories(r.data.data)).catch(() => {});
    };
    socket.on('product:created', refreshProducts);
    socket.on('product:updated', refreshProducts);
    socket.on('product:deleted', refreshProducts);
    socket.on('category:created', refreshCategories);
    socket.on('category:updated', refreshCategories);
    socket.on('category:deleted', refreshCategories);
    return () => {
      socket.off('product:created', refreshProducts);
      socket.off('product:updated', refreshProducts);
      socket.off('product:deleted', refreshProducts);
      socket.off('category:created', refreshCategories);
      socket.off('category:updated', refreshCategories);
      socket.off('category:deleted', refreshCategories);
    };
  }, [socket]);

  const filteredProducts = products.filter(p => {
    const matchCategory = selectedCategory === 'all' || p.category?._id === selectedCategory;
    const matchSearch = !searchQuery || p.name.toLowerCase().startsWith(searchQuery.toLowerCase());
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
        category: product.category?.name || '',
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
    if (!cashSession) { toast.error('Votre caisse n\'est pas ouverte — contactez le caissier'); return; }
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

  const handleMemo = async () => {
    if (!cashSession) { toast.error('Votre caisse n\'est pas ouverte'); return; }
    if (cart.length === 0 && sessionOrders.length === 0) { toast.error('Aucune commande à sauvegarder'); return; }
    setMemoLoading(true);
    try {
      let allOrders = [...sessionOrders];

      // If cart has items, submit as order first
      if (cart.length > 0) {
        const payload = {
          orderType,
          items: cart.map(item => ({ productId: item.productId, quantity: item.quantity, notes: item.notes }))
        };
        if (orderType === 'delivery') payload.deliveryInfo = deliveryInfo;
        const { data: orderData } = await ordersAPI.create(payload);
        allOrders = [...allOrders, orderData.data.order];
        setCart([]);
      }

      // Create consolidated invoice from all orders
      const orderIds = allOrders.map(o => o._id);
      const { data } = await ticketsAPI.createInvoiceFromOrders(orderIds);
      const invoiceId = data.data._id;

      // Move invoice to À encaisser
      await ticketsAPI.moveToAEncaisser(invoiceId);

      // Clear session
      setSessionOrders([]);
      setDeliveryInfo({ clientName: '', phone: '', address: '', notes: '' });
      try { localStorage.removeItem(`neworder_cart_${user?._id}`); } catch {}
      toast.success('Facture sauvegardée dans À encaisser');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur mémo');
    } finally {
      setMemoLoading(false);
    }
  };

  const onPaymentSuccess = () => {
    setPaymentDialog(false);
    setCurrentInvoice(null);
    setSessionOrders([]);
    setCart([]);
    setDeliveryInfo({ clientName: '', phone: '', address: '', notes: '' });
    try { localStorage.removeItem(`neworder_cart_${user?._id}`); } catch {}
    invalidateCache('/orders');
    toast.success('Paiement confirmé — vous pouvez passer une nouvelle commande', { duration: 3000 });
  };

  const sessionTotal = sessionOrders.reduce((sum, o) => sum + o.total, 0);

  if (loading || cashSession === null) {
    return (
      <div>
        <TopBar title="Emporter / Livraison" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (cashSession === false) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar title="Emporter / Livraison" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center space-y-5">
            <div className="w-20 h-20 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <LockKeyhole className="w-10 h-10 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-600">Caisse non ouverte</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Votre caisse n'a pas encore été ouverte par le caissier.<br />
                Contactez le caissier pour démarrer votre service.
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
              En attente d'ouverture de caisse…
            </div>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/agent')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Retour
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'var(--vvh, 100dvh)' }}>
      <TopBar title="Nouvelle commande" />

      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden gap-2 p-2 shrink-0">
        <Button variant={mobileTab === 'products' ? 'default' : 'outline'} className="flex-1 h-9" onClick={() => setMobileTab('products')}>
          Produits
        </Button>
        <Button variant={mobileTab === 'cart' ? 'default' : 'outline'} className="flex-1 h-9" onClick={() => setMobileTab('cart')}>
          Panier {cart.length > 0 && <Badge className="ml-1.5 h-5 px-1.5">{cart.length}</Badge>}
          {sessionOrders.length > 0 && <Badge variant="outline" className="ml-1">{sessionOrders.length} cmd</Badge>}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Category sidebar ── */}
        <aside className={`hidden lg:flex flex-col border-r bg-card transition-all duration-200 shrink-0 ${sidebarOpen ? 'w-48' : 'w-12'}`}>
          <div className="flex items-center justify-between p-2 border-b">
            {sidebarOpen && <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Catégories</span>}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded hover:bg-accent transition-colors ml-auto">
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {[{ _id: 'all', name: 'Tout', color: '' }, ...categories].map(cat => (
              <button key={cat._id} onClick={() => setSelectedCategory(cat._id)} title={cat.name}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat._id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {cat.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
                {sidebarOpen && <span className="truncate">{cat.name}</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Product grid ── */}
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-2 border-b flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => navigate('/agent')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher..." className="pl-9 h-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex lg:hidden gap-1 overflow-x-auto">
              {categories.slice(0, 3).map(cat => (
                <Button key={cat._id} size="sm" variant={selectedCategory === cat._id ? 'default' : 'outline'}
                  className="shrink-0 h-9 px-2 text-xs"
                  onClick={() => setSelectedCategory(selectedCategory === cat._id ? 'all' : cat._id)}>
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 content-start">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full flex items-center justify-center py-16 text-muted-foreground text-sm">Aucun produit trouvé</div>
            ) : filteredProducts.map(product => (
              <Card key={product._id} className="cursor-pointer hover:shadow-md hover:border-primary/50 active:scale-95 transition-all select-none" onClick={() => addToCart(product)}>
                <CardContent className="p-3">
                  {product.image && <img src={product.image} alt={product.name} className="w-full h-16 object-cover rounded mb-2" />}
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-primary font-bold text-sm mt-0.5">{formatCurrency(product.price)}</p>
                  {product.category?.color && (
                    <span className="inline-block w-2 h-2 rounded-full mt-1" style={{ backgroundColor: product.category.color }} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── Cart panel ── */}
        <div className={`lg:w-96 flex flex-col border-l bg-card ${mobileTab === 'products' ? 'hidden lg:flex' : 'flex flex-1'}`}>
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
          <div className={`border-t p-3 space-y-2 ${(memoLoading || submitting) ? 'pointer-events-none opacity-80' : ''}`}>
            {sessionOrders.length > 0 && (
              <div className="flex justify-between text-sm font-bold p-2 bg-muted rounded-lg">
                <span>Total session ({sessionOrders.length} cmd)</span>
                <span>{formatCurrency(sessionTotal + cartTotal)}</span>
              </div>
            )}

            <Button className="w-full" onClick={submitOrder} disabled={cart.length === 0 || submitting || memoLoading}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Passer la commande ({formatCurrency(cartTotal)})
            </Button>

            {(sessionOrders.length > 0 || cart.length > 0) && (
              <Button className="w-full" variant="outline" onClick={handleMemo} disabled={memoLoading || submitting}>
                {memoLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BookMarked className="w-4 h-4 mr-2" />}
                Mémo — Garder dans À encaisser
              </Button>
            )}

            {sessionOrders.length > 0 && (
              <Button className="w-full" variant="secondary" onClick={generateConsolidatedInvoice} disabled={memoLoading}>
                <Receipt className="w-4 h-4 mr-2" /> Facture globale & Paiement ({formatCurrency(sessionTotal)})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentDialog}
        onOpenChange={setPaymentDialog}
        invoice={currentInvoice}
        onSuccess={onPaymentSuccess}
        onMemo={() => {
          setPaymentDialog(false);
          setCurrentInvoice(null);
          setSessionOrders([]);
          setCart([]);
          setDeliveryInfo({ clientName: '', phone: '', address: '', notes: '' });
          try { localStorage.removeItem(`neworder_cart_${user?._id}`); } catch {}
          toast.success('Facture sauvegardée dans À encaisser');
        }}
        deliveryInfo={orderType === 'delivery' ? deliveryInfo : null}
      />
    </div>
  );
}
