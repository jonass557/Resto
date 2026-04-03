import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Users, ShoppingCart, Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Tables() {
  const [tables, setTables] = useState(() => readCache('/tables')?.data?.data || []);
  const [loading, setLoading] = useState(() => !readCache('/tables'));
  const [filter, setFilter] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTable, setNewTable] = useState({ number: '', name: '', capacity: 4, zone: 'Salle principale' });
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const { socket } = useSocket();

  const loadTables = useCallback(async () => {
    invalidateCache('/tables');
    try {
      const { data } = await tablesAPI.getAll();
      setTables(data.data);
    } catch (error) {
      toast.error('Erreur chargement des tables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (!socket) return;
    socket.on('table:updated', loadTables);
    socket.on('table:status-changed', loadTables);
    socket.on('order:created', loadTables);
    return () => {
      socket.off('table:updated', loadTables);
      socket.off('table:status-changed', loadTables);
      socket.off('order:created', loadTables);
    };
  }, [socket, loadTables]);

  const addTable = async () => {
    if (!newTable.number || !newTable.name) { toast.error('Numéro et nom requis'); return; }
    setAdding(true);
    try {
      await tablesAPI.create({ ...newTable, number: parseInt(newTable.number), capacity: parseInt(newTable.capacity) || 4 });
      toast.success('Table ajoutée');
      setShowAddDialog(false);
      setNewTable({ number: '', name: '', capacity: 4, zone: 'Salle principale' });
      loadTables();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur ajout table');
    } finally {
      setAdding(false);
    }
  };

  const filteredTables = filter === 'all' ? tables : tables.filter(t => t.status === filter);

  const zones = [...new Set(tables.map(t => t.zone))];

  if (loading) {
    return (
      <div>
        <TopBar title="Tables & Commandes" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Tables & Commandes" />
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Filters + Add button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
            {['all', 'available', 'occupied', 'reserved', 'cleaning'].map((status) => (
              <Button
                key={status}
                variant={filter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(status)}
              >
                {status === 'all' ? 'Toutes' : getStatusLabel(status)}
                <Badge variant="secondary" className="ml-2">
                  {status === 'all' ? tables.length : tables.filter(t => t.status === status).length}
                </Badge>
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter une table
          </Button>
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
                    className={`cursor-pointer hover:shadow-md transition-all ${
                      table.status === 'occupied' ? 'border-red-200 bg-red-50/30' :
                      table.status === 'reserved' ? 'border-blue-200 bg-blue-50/30' :
                      'hover:border-primary/50'
                    }`}
                    onClick={() => navigate(`/agent/tables/${table._id}`)}
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Table Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une table</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Numéro</Label><Input type="number" placeholder="1" value={newTable.number} onChange={e => setNewTable({...newTable, number: e.target.value})} /></div>
              <div><Label>Capacité</Label><Input type="number" placeholder="4" value={newTable.capacity} onChange={e => setNewTable({...newTable, capacity: e.target.value})} /></div>
            </div>
            <div><Label>Nom</Label><Input placeholder="Table 1" value={newTable.name} onChange={e => setNewTable({...newTable, name: e.target.value})} /></div>
            <div><Label>Zone</Label><Input placeholder="Salle principale" value={newTable.zone} onChange={e => setNewTable({...newTable, zone: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Annuler</Button>
            <Button onClick={addTable} disabled={adding}>
              {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
