import { useState, useEffect, useCallback } from 'react';
import { productsAPI, categoriesAPI, invalidateCache, readCache } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { useSocket } from '@/contexts/SocketContext';
import { Plus, Search, Edit, Trash2, Package, Loader2, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProductManagement() {
  const [products, setProducts] = useState(() => readCache('/products', { search: '' })?.data?.data || []);
  const [categories, setCategories] = useState(() => readCache('/categories')?.data?.data || []);
  const [loading, setLoading] = useState(() => !readCache('/products', { search: '' }) || !readCache('/categories'));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Product dialog
  const [productDialog, setProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', price: '', category: '', description: '', taxRate: '0', isAvailable: true });

  // Category dialog
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', color: '#3B82F6', description: '' });

  const [submitting, setSubmitting] = useState(false);
  const { socket } = useSocket();

  const loadData = useCallback(async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        productsAPI.getAll({ search: searchQuery }),
        categoriesAPI.getAll()
      ]);
      setProducts(prodRes.data.data);
      setCategories(catRes.data.data);
    } catch (error) {
      toast.error('Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const reload = () => { invalidateCache('/products'); invalidateCache('/categories'); loadData(); };
    socket.on('product:created', reload);
    socket.on('product:updated', reload);
    socket.on('product:deleted', reload);
    socket.on('category:created', reload);
    socket.on('category:updated', reload);
    socket.on('category:deleted', reload);
    return () => {
      socket.off('product:created', reload);
      socket.off('product:updated', reload);
      socket.off('product:deleted', reload);
      socket.off('category:created', reload);
      socket.off('category:updated', reload);
      socket.off('category:deleted', reload);
    };
  }, [socket, loadData]);

  const filtered = selectedCategory === 'all' ? products : products.filter(p => p.category?._id === selectedCategory);

  // Product handlers
  const openCreateProduct = () => {
    setEditingProduct(null);
    setProductForm({ name: '', price: '', category: categories[0]?._id || '', description: '', taxRate: '0', isAvailable: true });
    setProductDialog(true);
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name, price: product.price.toString(),
      category: product.category?._id || '', description: product.description || '',
      taxRate: (product.taxRate || 0).toString(), isAvailable: product.isAvailable
    });
    setProductDialog(true);
  };

  const handleProductSubmit = async () => {
    if (!productForm.name || !productForm.price || !productForm.category) { toast.error('Champs obligatoires manquants'); return; }
    setSubmitting(true);
    try {
      const data = {
        ...productForm,
        price: parseFloat(productForm.price),
        costPrice: 0,
        stock: -1,
        taxRate: parseFloat(productForm.taxRate) || 0
      };
      if (editingProduct) {
        await productsAPI.update(editingProduct._id, data);
        toast.success('Produit mis à jour');
      } else {
        await productsAPI.create(data);
        toast.success('Produit créé');
      }
      setProductDialog(false);
      loadData();
    } catch (error) {
      toast.error('Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!confirm(`Supprimer "${product.name}"?`)) return;
    try {
      await productsAPI.delete(product._id);
      toast.success('Produit supprimé');
      loadData();
    } catch (error) {
      toast.error('Erreur suppression');
    }
  };

  // Category handlers
  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', color: '#3B82F6', description: '' });
    setCategoryDialog(true);
  };

  const openEditCategory = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, color: cat.color, description: cat.description || '' });
    setCategoryDialog(true);
  };

  const handleCategorySubmit = async () => {
    if (!categoryForm.name) { toast.error('Nom requis'); return; }
    setSubmitting(true);
    try {
      if (editingCategory) {
        await categoriesAPI.update(editingCategory._id, categoryForm);
        toast.success('Catégorie mise à jour');
      } else {
        await categoriesAPI.create(categoryForm);
        toast.success('Catégorie créée');
      }
      setCategoryDialog(false);
      loadData();
    } catch (error) {
      toast.error('Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCategory = async (cat) => {
    if (!confirm(`Supprimer "${cat.name}"?`)) return;
    try {
      await categoriesAPI.delete(cat._id);
      toast.success('Catégorie supprimée');
      loadData();
    } catch (error) {
      toast.error('Erreur');
    }
  };

  return (
    <div>
      <TopBar title="Gestion des produits" />
      <div className="p-6 space-y-4">
        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Produits ({products.length})</TabsTrigger>
            <TabsTrigger value="categories">Catégories ({categories.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4 mt-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher un produit..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Catégorie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  {categories.map(cat => <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={openCreateProduct}><Plus className="w-4 h-4 mr-2" /> Nouveau produit</Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : (
              <div className="grid gap-2">
                {filtered.map(product => (
                  <Card key={product._id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                          {product.image ? <img src={product.image} alt="" className="w-full h-full object-cover rounded-lg" /> : <Package className="w-6 h-6 text-muted-foreground" />}
                        </div>
                        <div>
                          <p className="font-bold">{product.name}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge style={{ backgroundColor: product.category?.color + '20', color: product.category?.color }}>{product.category?.name}</Badge>
                            {!product.isAvailable && <Badge variant="destructive">Indisponible</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold text-primary">{formatCurrency(product.price)}</p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => openEditProduct(product)}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteProduct(product)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="categories" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={openCreateCategory}><Plus className="w-4 h-4 mr-2" /> Nouvelle catégorie</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {categories.map(cat => (
                <Card key={cat._id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: cat.color + '20' }}>
                          <div className="w-full h-full flex items-center justify-center">
                            <Tag className="w-4 h-4" style={{ color: cat.color }} />
                          </div>
                        </div>
                        <div>
                          <p className="font-bold">{cat.name}</p>
                          <p className="text-xs text-muted-foreground">{products.filter(p => p.category?._id === cat._id).length} produits</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEditCategory(cat)}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteCategory(cat)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingProduct ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            <div><Label>Nom *</Label><Input value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} /></div>
            <div><Label>Prix de vente *</Label><Input type="number" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} /></div>
            <div><Label>Catégorie *</Label>
              <Select value={productForm.category} onValueChange={v => setProductForm({...productForm, category: v})}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{categories.map(cat => <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Input value={productForm.description} onChange={e => setProductForm({...productForm, description: e.target.value})} /></div>
            <div><Label>Taux de taxe (%)</Label><Input type="number" value={productForm.taxRate} onChange={e => setProductForm({...productForm, taxRate: e.target.value})} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={productForm.isAvailable} onCheckedChange={v => setProductForm({...productForm, isAvailable: v})} />
              <Label>Disponible à la vente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialog(false)}>Annuler</Button>
            <Button onClick={handleProductSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingProduct ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom *</Label><Input value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})} /></div>
            <div><Label>Couleur</Label><Input type="color" value={categoryForm.color} onChange={e => setCategoryForm({...categoryForm, color: e.target.value})} className="h-10 w-20" /></div>
            <div><Label>Description</Label><Input value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialog(false)}>Annuler</Button>
            <Button onClick={handleCategorySubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
