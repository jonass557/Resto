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
import { Loader2, Wallet, CreditCard, Trash2, ShieldAlert, Plus, Ban } from 'lucide-react';
import toast from 'react-hot-toast';

export default function InvoicesAEncaisser() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [deletedIds, setDeletedIds] = useState(new Set());
  // --- Delete dialog ---
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const markDeleted = (id) => {
    setDeletedIds(prev => new Set([...prev, id]));
    setTimeout(() => {
      setDeletedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      setInvoices(prev => prev.filter(i => i._id !== id));
    }, 10000);
  };

  // ---- Delete handlers ----
  const openDeleteDialog = (inv) => { setDeleteTarget(inv); setAdminPassword(''); };

  const handleAdminDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { data } = await ticketsAPI.adminDelete(deleteTarget._id, { password: adminPassword });
      toast.success(data.message || 'Facture supprimée');
      markDeleted(deleteTarget._id);
      setDeleteTarget(null);
      invalidateCache('/tickets');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur suppression');
    } finally {
      setDeleteLoading(false);
    }
  };

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
    const onDeleted = ({ ticketId }) => {
      if (ticketId) markDeleted(ticketId);
      invalidateCache('/tickets');
    };
    socket.on('invoice:memo', reload);
    socket.on('invoice:updated', reload);
    socket.on('ticket:paid', reload);
    socket.on('ticket:deleted', onDeleted);
    return () => {
      socket.off('invoice:memo', reload);
      socket.off('invoice:updated', reload);
      socket.off('ticket:paid', reload);
      socket.off('ticket:deleted', onDeleted);
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
            {invoices.map((inv, idx) => {
              const isDeleted = deletedIds.has(inv._id);
              return (
                <Card key={inv._id} className={`transition-all ${isDeleted ? 'opacity-60 border-destructive/50 bg-red-50/40' : 'hover:shadow-md'}`}>
                  <CardContent className="p-3 sm:p-4">
                    {isDeleted && (
                      <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-red-100 rounded text-red-700 text-xs font-semibold">
                        <Ban className="w-3.5 h-3.5" /> FACTURE SUPPRIMÉE
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${isDeleted ? 'bg-red-100' : 'bg-blue-50'}`}>
                            <Wallet className={`w-4 h-4 sm:w-5 sm:h-5 ${isDeleted ? 'text-red-400' : 'text-blue-500'}`} />
                          </div>
                          <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{idx + 1}</span>
                        </div>
                        <div className="min-w-0">
                          <p className={`font-bold text-sm truncate ${isDeleted ? 'line-through text-muted-foreground' : ''}`}>{inv.ticketNumber}</p>
                          <p className="text-xs text-muted-foreground">Table {inv.tableNumber || inv.table?.number || '—'}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(inv.createdAt)}</p>
                          <div className="mt-1 space-y-0.5">
                            {inv.items?.slice(0, 3).map((item, i) => (
                              <p key={i} className={`text-xs text-muted-foreground truncate ${isDeleted ? 'line-through' : ''}`}>{item.quantity}× {item.name}</p>
                            ))}
                            {inv.items?.length > 3 && (
                              <p className="text-xs text-muted-foreground">+{inv.items.length - 3} article(s)…</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-1.5">
                        <p className={`font-bold text-sm ${isDeleted ? 'text-red-500 line-through' : 'text-primary'}`}>{formatCurrency(inv.total)}</p>
                        {isDeleted ? (
                          <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-xs">Supprimée</Badge>
                        ) : (
                          <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-xs">À encaisser</Badge>
                        )}
                        {!isDeleted && (
                          <div className="mt-1.5 flex flex-col gap-1">
                            <Button size="sm" className="h-7 text-xs w-full"
                              onClick={() => navigate(`/agent/billing/${inv._id}`)}>
                              <CreditCard className="w-3 h-3 mr-1" /> Encaisser
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs w-full"
                              onClick={() => navigate(`/agent/restaurant?invoiceId=${inv._id}`)}>
                              <Plus className="w-3 h-3 mr-1" /> Ajouter
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => openDeleteDialog(inv)}>
                              <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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
              <Input type="password" placeholder="••••"
                value={adminPassword} autoFocus
                onChange={e => setAdminPassword(e.target.value)}
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

    </div>
  );
}
