import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ticketsAPI, productsAPI, categoriesAPI, invalidateCache, printerAPI } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Loader2, Wallet, CreditCard, Trash2, ShieldAlert, Plus, Minus, Search, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import toast from 'react-hot-toast';

export default function InvoicesAEncaisser() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Delete dialog ---
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // --- Add items dialog ---
  const [addTarget, setAddTarget] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]); // [{product, quantity}]
  const [addLoading, setAddLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);

  // ---- Delete handlers ----
  const openDeleteDialog = (inv) => { setDeleteTarget(inv); setAdminPassword(''); };

  const handleAdminDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { data } = await ticketsAPI.adminDelete(deleteTarget._id, { password: adminPassword });
      toast.success(data.message || 'Facture supprimée');
      setDeleteTarget(null);
      invalidateCache('/tickets');
      load();
      if (data.ticketData) {
        try { await printerAPI.printTicket({ ticketData: data.ticketData }); } catch { /* non-bloquant */ }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur suppression');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ---- Add items handlers ----
  const openAddDialog = async (inv) => {
    setAddTarget(inv);
    setCart([]);
    setSearchQuery('');
    setSelectedCat('all');
    setProductsLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([productsAPI.getAll({ limit: 200 }), categoriesAPI.getAll()]);
      setProducts(prodRes.data.data || []);
      setCategories(catRes.data.data || []);
    } catch {
      toast.error('Erreur chargement produits');
    } finally {
      setProductsLoading(false);
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.product._id === product._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (idx, delta) => {
    setCart(prev => {
      const next = [...prev];
      const newQty = next[idx].quantity + delta;
      if (newQty <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], quantity: newQty };
      return next;
    });
  };

  const handleAddItems = async () => {
    if (!addTarget || cart.length === 0) return;
    setAddLoading(true);
    try {
      const items = cart.map(c => ({
        name: c.product.name,
        category: c.product.category?.name || '',
        unitPrice: c.product.price,
        quantity: c.quantity,
        totalPrice: c.product.price * c.quantity,
      }));
      await ticketsAPI.addItems(addTarget._id, items);
      toast.success('Articles ajoutés à la facture');
      setAddTarget(null);
      invalidateCache('/tickets');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur ajout articles');
    } finally {
      setAddLoading(false);
    }
  };

  const filteredProducts = (products || []).filter(p => {
    const matchCat = selectedCat === 'all' || p.category?._id === selectedCat;
    const matchSearch = !searchQuery || p.name.toLowerCase().startsWith(searchQuery.toLowerCase());
    return matchCat && matchSearch && p.isAvailable !== false;
  });

  const cartTotal = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);

  // ---- Load invoices ----
  const load = useCallback(async () => {
    try {
      const { data } = await ticketsAPI.getAll({ type: 'invoice', isPaid: false, limit: 100 });
      setInvoices((data.data || []).filter(t => t.memoStatus === 'a_encaisser'));
    } catch {
      toast.error('Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const reload = () => { invalidateCache('/tickets'); load(); };
    socket.on('invoice:memo', reload);
    socket.on('invoice:updated', reload);
    socket.on('ticket:paid', reload);
    socket.on('ticket:deleted', reload);
    return () => {
      socket.off('invoice:memo', reload);
      socket.off('invoice:updated', reload);
      socket.off('ticket:paid', reload);
      socket.off('ticket:deleted', reload);
    };
  }, [socket, load]);

  return (
    <div>
      <TopBar title="À Encaisser" />
      <div className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          {invoices.length} facture{invoices.length !== 1 ? 's' : ''} en attente d'encaissement
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucune facture à encaisser</p>
            <p className="text-sm mt-1">Les factures mémorisées apparaissent ici</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {invoices.map((inv, idx) => (
              <Card key={inv._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                        </div>
                        <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{idx + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{inv.ticketNumber}</p>
                        <p className="text-xs text-muted-foreground">Table {inv.tableNumber || inv.table?.number || '—'}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(inv.createdAt)}</p>
                        <div className="mt-1 space-y-0.5">
                          {inv.items?.slice(0, 3).map((item, i) => (
                            <p key={i} className="text-xs text-muted-foreground truncate">{item.quantity}× {item.name}</p>
                          ))}
                          {inv.items?.length > 3 && (
                            <p className="text-xs text-muted-foreground">+{inv.items.length - 3} article(s)…</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <p className="font-bold text-primary text-sm">{formatCurrency(inv.total)}</p>
                      <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-xs">À encaisser</Badge>
                      <div className="mt-1.5 flex flex-col gap-1">
                        <Button size="sm" className="h-7 text-xs w-full"
                          onClick={() => navigate(`/agent/billing/${inv._id}`)}>
                          <CreditCard className="w-3 h-3 mr-1" /> Encaisser
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs w-full"
                          onClick={() => openAddDialog(inv)}>
                          <Plus className="w-3 h-3 mr-1" /> Ajouter
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => openDeleteDialog(inv)}>
                          <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Admin delete dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" />
              Suppression autorisée par l'admin
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Facture <strong>{deleteTarget?.ticketNumber}</strong> — {formatCurrency(deleteTarget?.total || 0)}
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">
              Entrez le mot de passe administrateur pour confirmer la suppression.
            </p>
            <div>
              <Label className="text-xs">Mot de passe administrateur</Label>
              <Input type="password" inputMode="numeric" pattern="[0-9]*" placeholder="••••"
                value={adminPassword} autoFocus
                onChange={e => setAdminPassword(e.target.value.replace(/\D/g, ''))}
                className="h-8 text-sm mt-1"
                onKeyDown={e => e.key === 'Enter' && adminPassword && handleAdminDelete()} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button variant="destructive" size="sm" onClick={handleAdminDelete}
              disabled={deleteLoading || !adminPassword}>
              {deleteLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Confirmer la suppression
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add items dialog ── */}
      <Dialog open={!!addTarget} onOpenChange={(o) => !o && setAddTarget(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-primary" />
              Ajouter des articles — {addTarget?.ticketNumber}
            </DialogTitle>
          </DialogHeader>

          {productsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Search */}
              <div className="px-4 pb-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Rechercher…" value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-sm" />
                </div>
              </div>

              {/* Category tabs */}
              <div className="px-4 pb-2 flex gap-1.5 flex-wrap shrink-0">
                <button
                  onClick={() => setSelectedCat('all')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selectedCat === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  Tous
                </button>
                {categories.map(cat => (
                  <button key={cat._id}
                    onClick={() => setSelectedCat(cat._id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selectedCat === cat._id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Product grid */}
              <ScrollArea className="flex-1 px-4">
                <div className="grid grid-cols-2 gap-2 pb-2">
                  {filteredProducts.map(p => {
                    const inCart = cart.find(c => c.product._id === p._id);
                    return (
                      <button key={p._id}
                        onClick={() => addToCart(p)}
                        className="text-left p-2.5 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors relative">
                        {inCart && (
                          <span className="absolute top-1.5 right-1.5 bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                            {inCart.quantity}
                          </span>
                        )}
                        <p className="text-xs font-semibold leading-tight line-clamp-2">{p.name}</p>
                        {p.category?.name && <p className="text-[10px] text-muted-foreground mt-0.5">{p.category.name}</p>}
                        <p className="text-xs font-bold text-primary mt-1">{formatCurrency(p.price)}</p>
                      </button>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <p className="col-span-2 text-center text-sm text-muted-foreground py-8">Aucun article trouvé</p>
                  )}
                </div>
              </ScrollArea>

              {/* Cart summary */}
              {cart.length > 0 && (
                <div className="px-4 pt-2 pb-3 border-t shrink-0 space-y-1.5 bg-muted/30">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5" /> Panier ({cart.length} article{cart.length > 1 ? 's' : ''})
                  </p>
                  {cart.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate flex-1">{c.product.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => updateQty(idx, -1)} className="w-5 h-5 rounded border flex items-center justify-center hover:bg-destructive hover:text-white transition-colors">
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="w-4 text-center font-bold">{c.quantity}</span>
                        <button onClick={() => updateQty(idx, 1)} className="w-5 h-5 rounded border flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                        <span className="text-primary font-semibold w-16 text-right">{formatCurrency(c.product.price * c.quantity)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-sm border-t pt-1.5">
                    <span>Total ajout</span>
                    <span className="text-primary">{formatCurrency(cartTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="px-4 py-3 border-t gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setAddTarget(null)}>Annuler</Button>
            <Button size="sm" onClick={handleAddItems}
              disabled={addLoading || cart.length === 0}>
              {addLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
              Confirmer ({cart.length} article{cart.length > 1 ? 's' : ''})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
