import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ticketsAPI, invalidateCache } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Loader2, UtensilsCrossed, Plus, Trash2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

export default function InvoicesEnCours() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openDeleteDialog = (inv) => {
    setDeleteTarget(inv);
    setAdminEmail('');
    setAdminPassword('');
  };

  const handleAdminDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { data } = await ticketsAPI.adminDelete(deleteTarget._id, { email: adminEmail, password: adminPassword });
      toast.success(data.message || 'Facture supprimée');
      setDeleteTarget(null);
      invalidateCache('/tickets');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur suppression');
    } finally {
      setDeleteLoading(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const { data } = await ticketsAPI.getAll({ type: 'invoice', isPaid: false, limit: 100 });
      setInvoices((data.data || []).filter(t => t.memoStatus === 'en_cours'));
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
    socket.on('invoice:created', reload);
    socket.on('invoice:updated', reload);
    socket.on('invoice:memo', reload);
    socket.on('ticket:paid', reload);
    socket.on('ticket:deleted', reload);
    return () => {
      socket.off('invoice:created', reload);
      socket.off('invoice:updated', reload);
      socket.off('invoice:memo', reload);
      socket.off('ticket:paid', reload);
      socket.off('ticket:deleted', reload);
    };
  }, [socket, load]);

  return (
    <div>
      <TopBar title="En cours" />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{invoices.length} facture{invoices.length !== 1 ? 's' : ''} en cours</p>
          <Button onClick={() => navigate('/agent/restaurant')}>
            <Plus className="w-4 h-4 mr-2" /> Nouvelle commande
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucune facture en cours</p>
            <p className="text-sm mt-1">Commencez une nouvelle commande</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {invoices.map((inv, idx) => (
              <Card key={inv._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                          <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                        </div>
                        <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{idx + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{inv.ticketNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          Table {inv.tableNumber || inv.table?.number || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(inv.createdAt)}</p>
                        <div className="mt-1 space-y-0.5">
                          {inv.items?.slice(0, 3).map((item, i) => (
                            <p key={i} className="text-xs text-muted-foreground truncate">
                              {item.quantity}× {item.name}
                            </p>
                          ))}
                          {inv.items?.length > 3 && (
                            <p className="text-xs text-muted-foreground">+{inv.items.length - 3} article(s)…</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <p className="font-bold text-primary text-sm">{formatCurrency(inv.total)}</p>
                      <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs">
                        En cours
                      </Badge>
                      <div className="mt-1.5 flex flex-col gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs w-full"
                          onClick={() => navigate(`/agent/restaurant?invoiceId=${inv._id}`)}>
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
      {/* Admin delete dialog */}
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
              Entrez les identifiants de l'administrateur pour confirmer la suppression.
            </p>
            <div>
              <Label className="text-xs">Email administrateur</Label>
              <Input type="email" placeholder="admin@exemple.com" value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Mot de passe</Label>
              <Input type="password" placeholder="••••••••" value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)} className="h-8 text-sm mt-1"
                onKeyDown={e => e.key === 'Enter' && handleAdminDelete()} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button variant="destructive" size="sm" onClick={handleAdminDelete}
              disabled={deleteLoading || !adminEmail || !adminPassword}>
              {deleteLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Confirmer la suppression
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
