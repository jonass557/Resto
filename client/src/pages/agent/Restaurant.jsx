import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { usePrinter } from '@/contexts/PrinterContext';
import { productsAPI, categoriesAPI, ticketsAPI, cashRegisterAPI, readCache } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowLeft, Plus, Minus, Trash2, Search, Receipt, Loader2,
  UtensilsCrossed, ChevronLeft, ChevronRight, BookMarked, Hash, Printer, Send, LockKeyhole
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Restaurant() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingInvoiceId = searchParams.get('invoiceId');
  const { user } = useAuth();
  const { socket } = useSocket();
  const { printTicket } = usePrinter();

  // Table number step — skip immediately if adding to existing invoice
  const [tableNumber, setTableNumber] = useState('');
  const [tableConfirmed, setTableConfirmed] = useState(!!existingInvoiceId);
  const tableInputRef = useRef(null);

  // Data
  const [products, setProducts] = useState(() => readCache('/products', { isAvailable: true })?.data?.data || []);
  const [categories, setCategories] = useState(() => readCache('/categories')?.data?.data || []);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(() =>
    !readCache('/products', { isAvailable: true }) || !readCache('/categories')
  );

  // Existing invoice (add-items mode) — cart starts EMPTY, only new items are added
  const [existingInvoice, setExistingInvoice] = useState(null);

  // Sidebar collapsible
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Mobile tabs
  const [mobileTab, setMobileTab] = useState('products');

  const [submitting, setSubmitting] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

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
      const promises = [
        productsAPI.getAll({ isAvailable: true }),
        categoriesAPI.getAll()
      ];
      if (existingInvoiceId) promises.push(ticketsAPI.getById(existingInvoiceId));
      const results = await Promise.all(promises);
      setProducts(results[0].data.data);
      setCategories(results[1].data.data);
      if (existingInvoiceId && results[2]) {
        const inv = results[2].data.data;
        setExistingInvoice(inv);
        setTableNumber(inv.tableNumber || '');
        setTableConfirmed(true);
        // Cart stays EMPTY — agent selects only NEW items to add
      }
    } catch {
      toast.error('Erreur chargement des données');
    } finally {
      setLoading(false);
    }
  }, [existingInvoiceId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { checkCashSession(); }, [checkCashSession]);

  // Real-time cash session refresh
  useEffect(() => {
    if (!socket) return;
    socket.on('cashRegister:opened', checkCashSession);
    socket.on('cashRegister:closed', checkCashSession);
    return () => {
      socket.off('cashRegister:opened', checkCashSession);
      socket.off('cashRegister:closed', checkCashSession);
    };
  }, [socket, checkCashSession]);

  // Refresh products when admin adds/updates/deletes a product
  useEffect(() => {
    if (!socket) return;
    const refreshProducts = () => {
      productsAPI.getAll({ isAvailable: true }).then(r => setProducts(r.data.data)).catch(() => {});
    };
    socket.on('product:created', refreshProducts);
    socket.on('product:updated', refreshProducts);
    socket.on('product:deleted', refreshProducts);
    return () => {
      socket.off('product:created', refreshProducts);
      socket.off('product:updated', refreshProducts);
      socket.off('product:deleted', refreshProducts);
    };
  }, [socket]);

  useEffect(() => {
    if (!tableConfirmed && tableInputRef.current) {
      tableInputRef.current.focus();
    }
  }, [tableConfirmed]);

  const filteredProducts = products.filter(p => {
    const matchCategory = selectedCategory === 'all' || p.category?._id === selectedCategory;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.name === product.name && item.unitPrice === product.price);
      if (existing) {
        return prev.map(item =>
          item.name === product.name && item.unitPrice === product.price
            ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [...prev, { name: product.name, unitPrice: product.price, quantity: 1, totalPrice: product.price }];
    });
  };

  const updateQuantity = (idx, delta) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newQty = Math.max(0, item.quantity + delta);
      return newQty === 0 ? null : { ...item, quantity: newQty, totalPrice: newQty * item.unitPrice };
    }).filter(Boolean));
  };

  const removeFromCart = (idx) => setCart(prev => prev.filter((_, i) => i !== idx));

  const cartTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  const handleConfirmTable = () => {
    const num = tableNumber.trim();
    if (!num) { toast.error('Entrez un numéro de table'); return; }
    setTableConfirmed(true);
  };

  // ── Garde caisse obligatoire ──
  const requireCash = () => {
    if (!cashSession) {
      toast.error('Votre caisse n\'est pas ouverte — contactez le caissier');
      return false;
    }
    return true;
  };

  // ── Garde table obligatoire: redirige vers la saisie si table absente ──
  const requireTable = () => {
    if (!tableConfirmed || !tableNumber.trim()) {
      setTableConfirmed(false);
      toast.error('Veuillez d\'abord saisir le numéro de table');
      return false;
    }
    return true;
  };

  // ── Envoyer la commande à l'imprimante (cuisine) — pas de sauvegarde BD ──
  const handleSendToKitchen = async () => {
    if (!requireCash()) return;
    if (!requireTable()) return;
    if (cart.length === 0) { toast.error('Le panier est vide'); return; }
    setPrintLoading(true);
    try {
      const ok = await printTicket({
        ticketNumber: `CMD-${Date.now().toString().slice(-6)}`,
        orderType: 'dine_in',
        tableName: tableNumber,
        agentName: user ? `${user.firstName} ${user.lastName}` : '',
        items: cart,
        subtotal: cartTotal,
        taxAmount: 0,
        discount: 0,
        total: cartTotal,
      });
      if (ok) {
        // Vider le panier après envoi individuel à l'imprimante
        setCart([]);
      }
    } finally {
      setPrintLoading(false);
    }
  };

  // ── Mémo: enregistre en cours + redirige vers En cours ──
  const handleMemo = async () => {
    if (!requireCash()) return;
    if (!requireTable()) return;
    setMemoLoading(true);
    try {
      if (existingInvoiceId && existingInvoice) {
        if (cart.length > 0) {
          await ticketsAPI.addItems(existingInvoiceId, cart);
        }
        navigate('/agent/en-cours');
      } else if (cart.length > 0) {
        if (!tableNumber.trim()) { setTableConfirmed(false); setMemoLoading(false); return; }
        await ticketsAPI.directInvoice({ tableNumber: tableNumber.trim(), items: cart });
        navigate('/agent/en-cours');
      } else {
        navigate('/agent/en-cours');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur mémo');
    } finally {
      setMemoLoading(false);
    }
  };

  // ── Facturer: crée facture → auto-print → billing ──
  const handleFacturer = async () => {
    if (!requireCash()) return;
    if (!requireTable()) return;
    // Mode ajout avec panier vide → aller directement en facturation sans ajouter d'articles
    if (cart.length === 0) {
      if (existingInvoiceId && existingInvoice) {
        navigate(`/agent/billing/${existingInvoiceId}`);
        return;
      }
      toast.error('Le panier est vide'); return;
    }
    setSubmitting(true);
    try {
      let invoiceId, invoiceData;
      if (existingInvoiceId && existingInvoice) {
        const { data } = await ticketsAPI.addItems(existingInvoiceId, cart);
        invoiceId = existingInvoiceId;
        invoiceData = data.data;
      } else {
        const { data } = await ticketsAPI.directInvoice({
          tableNumber: tableNumber.trim(),
          items: cart
        });
        invoiceId = data.data._id;
        invoiceData = data.data;
      }

      // Auto-print facture client avant la page de facturation
      await printTicket({
        ticketNumber: invoiceData?.ticketNumber || '',
        orderType: 'dine_in',
        tableName: tableNumber,
        agentName: user ? `${user.firstName} ${user.lastName}` : '',
        items: invoiceData?.items || cart,
        subtotal: invoiceData?.subtotal ?? cartTotal,
        taxAmount: 0,
        discount: 0,
        total: invoiceData?.total ?? cartTotal,
      });

      navigate(`/agent/billing/${invoiceId}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur création facture');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || cashSession === null) {
    return (
      <div>
        <TopBar title="Restaurant" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ── Caisse non ouverte : écran de blocage ──
  if (cashSession === false) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar title="Restaurant" />
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

  // ── Step 1: Table number input ──
  if (!tableConfirmed) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar title="Restaurant" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <UtensilsCrossed className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Numéro de table</h2>
              <p className="text-muted-foreground text-sm mt-1">Entrez le numéro de la table pour commencer</p>
            </div>
            <div className="space-y-3">
              <Input
                ref={tableInputRef}
                type="text"
                placeholder="Ex : 5, VIP, Terrasse 3..."
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmTable()}
                className="h-14 text-2xl text-center font-bold tracking-widest"
              />
              <Button className="w-full h-12 text-base" onClick={handleConfirmTable}>
                <Hash className="w-4 h-4 mr-2" /> Valider la table
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate('/agent')}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Retour
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Product selection ──
  const isAddMode = !!existingInvoiceId && !!existingInvoice;

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <TopBar title={isAddMode ? `Ajout — ${existingInvoice.ticketNumber} (Table ${tableNumber})` : `Restaurant — Table ${tableNumber}`} />

      {/* Mobile tab switcher */}
      <div className="flex lg:hidden gap-2 p-2 shrink-0">
        <Button variant={mobileTab === 'products' ? 'default' : 'outline'} className="flex-1 h-9" onClick={() => setMobileTab('products')}>
          Produits
        </Button>
        <Button variant={mobileTab === 'cart' ? 'default' : 'outline'} className="flex-1 h-9" onClick={() => setMobileTab('cart')}>
          Panier {cart.length > 0 && <Badge className="ml-1.5 h-5 px-1.5">{cart.length}</Badge>}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Category sidebar ── */}
        <aside className={`hidden lg:flex flex-col border-r bg-card transition-all duration-200 shrink-0 ${sidebarOpen ? 'w-48' : 'w-12'}`}>
          <div className="flex items-center justify-between p-2 border-b">
            {sidebarOpen && <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Catégories</span>}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded hover:bg-accent transition-colors ml-auto"
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {[{ _id: 'all', name: 'Tout', color: '' }, ...categories].map(cat => (
              <button
                key={cat._id}
                onClick={() => setSelectedCategory(cat._id)}
                title={cat.name}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat._id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {cat.color && (
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                )}
                {sidebarOpen && <span className="truncate">{cat.name}</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Product grid ── */}
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-2 border-b flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9"
              onClick={() => isAddMode ? navigate('/agent/en-cours') : (setTableConfirmed(false), setCart([]))}>
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
              <div className="col-span-full flex items-center justify-center py-16 text-muted-foreground text-sm">
                Aucun produit trouvé
              </div>
            ) : filteredProducts.map(product => (
              <Card
                key={product._id}
                className="cursor-pointer hover:shadow-md hover:border-primary/50 active:scale-95 transition-all select-none"
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-3">
                  {product.image && (
                    <img src={product.image} alt={product.name} className="w-full h-16 object-cover rounded mb-2" />
                  )}
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
        <div className={`lg:w-80 flex flex-col border-l bg-card ${mobileTab === 'products' ? 'hidden lg:flex' : 'flex flex-1'}`}>
          {/* Table badge */}
          <div className="p-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <UtensilsCrossed className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isAddMode ? 'Ajout sur facture' : 'Table'}</p>
                <p className="font-bold text-sm">{isAddMode ? existingInvoice?.ticketNumber : tableNumber}</p>
              </div>
            </div>
            {!isAddMode && (
              <Button variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => { setTableConfirmed(false); setCart([]); }}>
                Changer
              </Button>
            )}
          </div>

          {/* Existing invoice items summary (read-only) */}
          {isAddMode && existingInvoice?.items?.length > 0 && (
            <div className="px-3 pt-2 pb-1 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Déjà en facture</p>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {existingInvoice.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground">
                    <span>{item.quantity}× {item.name}</span>
                    <span>{formatCurrency(item.totalPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New cart items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                {isAddMode ? 'Sélectionnez les articles à ajouter' : 'Sélectionnez des produits'}
              </p>
            ) : cart.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQuantity(idx, -1)}>
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQuantity(idx, 1)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <span className="text-sm font-bold w-16 text-right">{formatCurrency(item.totalPrice)}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeFromCart(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>

          {/* Footer actions — pointer-events-none bloque tout clic concurrent pendant un chargement */}
          <div className={`border-t p-3 space-y-3 ${(memoLoading || submitting || printLoading) ? 'pointer-events-none opacity-80' : ''}`}>
            <div className="flex justify-between items-center font-bold">
              <span className="text-sm">Nouveau total</span>
              <span className="text-primary">{formatCurrency(cartTotal)}</span>
            </div>
            <Separator />

            {/* Envoyer la commande à l'imprimante (cuisine) */}
            <Button variant="secondary" className="w-full" onClick={handleSendToKitchen}
              disabled={cart.length === 0 || printLoading}>
              {printLoading
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Send className="w-4 h-4 mr-2" />}
              Envoyer la commande
            </Button>

            {/* Mémo → sauvegarde En cours + redirect */}
            <Button variant="outline" className="w-full" onClick={handleMemo}
              disabled={memoLoading || submitting}>
              {memoLoading
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <BookMarked className="w-4 h-4 mr-2" />}
              Mémo
            </Button>

            {/* Facturer → crée facture + print + billing (actif même sans nouveaux articles en mode ajout) */}
            <Button className="w-full" onClick={handleFacturer}
              disabled={(cart.length === 0 && !(existingInvoiceId && existingInvoice)) || submitting || memoLoading}>
              {submitting
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Receipt className="w-4 h-4 mr-2" />}
              Facturer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
