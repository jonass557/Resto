import { useState, useEffect, useCallback } from 'react';
import { tablesAPI, invalidateCache, readCache } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getStatusColor, getStatusLabel } from '@/lib/utils';
import { Users, Loader2, Pencil, Trash2, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminTables() {
  const [tables, setTables] = useState(() => readCache('/tables')?.data?.data || []);
  const [loading, setLoading] = useState(() => !readCache('/tables'));
  const [filter, setFilter] = useState('all');
  const { socket } = useSocket();

  // Add / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [form, setForm] = useState({ number: '', name: '', capacity: 4, zone: 'Salle principale' });
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadTables = useCallback(async () => {
    try {
      const { data } = await tablesAPI.getAll();
      setTables(data.data);
    } catch (error) {
      toast.error('Erreur chargement des tables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  useEffect(() => {
    if (!socket) return;
    const reload = () => { invalidateCache('/tables'); loadTables(); };
    socket.on('table:created', reload);
    socket.on('table:updated', reload);
    socket.on('table:deleted', reload);
    socket.on('table:status-changed', reload);
    return () => {
      socket.off('table:created', reload);
      socket.off('table:updated', reload);
      socket.off('table:deleted', reload);
      socket.off('table:status-changed', reload);
    };
  }, [socket, loadTables]);

  const openEdit = (table) => {
    setEditingTable(table);
    setForm({ number: table.number, name: table.name, capacity: table.capacity, zone: table.zone });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.number || !form.name) { toast.error('Numéro et nom requis'); return; }
    setSaving(true);
    try {
      const payload = { ...form, number: parseInt(form.number), capacity: parseInt(form.capacity) || 4 };
      await tablesAPI.update(editingTable._id, payload);
      toast.success('Table modifiée');
      setDialogOpen(false);
      loadTables();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tablesAPI.delete(deleteTarget._id);
      toast.success('Table supprimée');
      setDeleteTarget(null);
      loadTables();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur suppression');
    } finally {
      setDeleting(false);
    }
  };

  const filteredTables = filter === 'all' ? tables : tables.filter(t => t.status === filter);
  const zones = [...new Set(tables.map(t => t.zone))];

  if (loading) {
    return (
      <div>
        <TopBar title="Gestion des Tables" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Gestion des Tables" />
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Filters + Add */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
            {['all', 'available', 'occupied', 'reserved', 'cleaning'].map((status) => (
              <Button key={status} variant={filter === status ? 'default' : 'outline'} size="sm" onClick={() => setFilter(status)}>
                {status === 'all' ? 'Toutes' : getStatusLabel(status)}
                <Badge variant="secondary" className="ml-2">
                  {status === 'all' ? tables.length : tables.filter(t => t.status === status).length}
                </Badge>
              </Button>
            ))}
          </div>
        </div>

        {/* Tables by zone */}
        {zones.map((zone) => {
          const zoneTables = filteredTables.filter(t => t.zone === zone);
          if (zoneTables.length === 0) return null;
          return (
            <div key={zone}>
              <h3 className="text-lg font-semibold mb-3">{zone}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {zoneTables.map((table) => (
                  <Card
                    key={table._id}
                    className={`relative group ${
                      table.status === 'occupied' ? 'border-red-200 bg-red-50/30' :
                      table.status === 'reserved' ? 'border-blue-200 bg-blue-50/30' :
                      'hover:border-primary/50'
                    }`}
                  >
                    <CardContent className="p-4 text-center">
                      <div className="text-3xl font-bold text-primary mb-2">{table.number}</div>
                      <p className="text-sm text-muted-foreground mb-2">{table.name}</p>
                      <Badge className={getStatusColor(table.status)}>
                        {getStatusLabel(table.status)}
                      </Badge>
                      <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />
                        <span>{table.capacity} places</span>
                      </div>
                      {table.currentOrders?.length > 0 && (
                        <div className="flex items-center justify-center gap-1 mt-2">
                          <ShoppingCart className="w-3 h-3 text-orange-500" />
                          <span className="text-xs font-medium text-orange-600">
                            {table.currentOrders.length} commande(s)
                          </span>
                        </div>
                      )}
                      {/* Edit / Delete buttons */}
                      <div className="flex gap-2 mt-3 justify-center">
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(table)}>
                          <Pencil className="w-3 h-3 mr-1" /> Modifier
                        </Button>
                        <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={() => setDeleteTarget(table)}>
                          <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier la table</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Numéro</Label><Input type="number" placeholder="1" value={form.number} onChange={e => setForm({...form, number: e.target.value})} /></div>
              <div><Label>Capacité</Label><Input type="number" placeholder="4" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} /></div>
            </div>
            <div><Label>Nom</Label><Input placeholder="Table 1" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>Zone</Label><Input placeholder="Salle principale" value={form.zone} onChange={e => setForm({...form, zone: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer la table</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Voulez-vous vraiment supprimer la table <strong>{deleteTarget?.name}</strong> (n°{deleteTarget?.number}) ? Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
