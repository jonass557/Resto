import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cashRegisterAPI, ticketsAPI, readCache } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Wallet, DoorOpen, DoorClosed, Loader2, Banknote, CreditCard, Smartphone, TrendingUp, AlertTriangle, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CashRegister() {
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState(() =>
    readCache('/cash-register/current')?.data?.data || null
  );
  const [history, setHistory] = useState(() => {
    const u = user || JSON.parse(localStorage.getItem('user') || 'null');
    return readCache('/cash-register', { agent: u?._id, limit: 50 })?.data?.data || [];
  });
  const [unpaidTickets, setUnpaidTickets] = useState([]);
  const [loading, setLoading] = useState(() => {
    const u = user || JSON.parse(localStorage.getItem('user') || 'null');
    return !readCache('/cash-register/current') || !readCache('/cash-register', { agent: u?._id, limit: 50 });
  });
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [currentRes, historyRes, ticketsRes] = await Promise.all([
        cashRegisterAPI.getCurrent(),
        cashRegisterAPI.getAll({ agent: user?._id, limit: 50 }),
        ticketsAPI.getAll({ agent: user?._id, isPaid: false, type: 'invoice', limit: 200 })
      ]);
      setCurrentSession(currentRes.data.data);
      setHistory(historyRes.data.data);
      // Filtrer les tickets impayés de cet agent depuis l'ouverture de la caisse
      const session = currentRes.data.data;
      if (session) {
        const openedAt = new Date(session.openedAt);
        const unpaid = (ticketsRes.data.data || []).filter(t =>
          new Date(t.createdAt) >= openedAt
        );
        setUnpaidTickets(unpaid);
      } else {
        setUnpaidTickets([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpen = async () => {
    setSubmitting(true);
    try {
      await cashRegisterAPI.open({ openingAmount: parseFloat(openingAmount) || 0 });
      toast.success('Caisse ouverte');
      setOpenDialog(false);
      setOpeningAmount('');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur ouverture caisse');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    setSubmitting(true);
    try {
      await cashRegisterAPI.close({ closingAmount: parseFloat(closingAmount) || 0 });
      toast.success('Caisse fermée');
      setCloseDialog(false);
      setClosingAmount('');
      loadData();
    } catch (error) {
      const res = error.response?.data;
      if (res?.unpaidTickets) {
        setUnpaidTickets(res.unpaidTickets);
      }
      toast.error(res?.message || 'Erreur fermeture caisse');
    } finally {
      setSubmitting(false);
    }
  };

  const canClose = unpaidTickets.length === 0;

  if (loading) {
    return (
      <div><TopBar title="Caisse" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>
    );
  }

  return (
    <div>
      <TopBar title="Caisse" />
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Current Session */}
        {currentSession ? (
          <Card className="border-green-200">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base sm:text-lg">Session {currentSession.sessionNumber}</CardTitle>
                    <p className="text-xs sm:text-sm text-muted-foreground">Ouverte le {formatDateTime(currentSession.openedAt)}</p>
                  </div>
                </div>
                <Button variant="destructive" size="sm" className="w-full sm:w-auto" onClick={() => setCloseDialog(true)}>
                  <DoorClosed className="w-4 h-4 mr-2" /> Fermer la caisse
                  {!canClose && <Badge variant="destructive" className="ml-2">{unpaidTickets.length}</Badge>}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-3 rounded-lg bg-blue-50">
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-blue-600 font-medium">Espèces</span>
                  </div>
                  <p className="text-lg font-bold">{formatCurrency(currentSession.totalCash)}</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50">
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    <span className="text-xs text-purple-600 font-medium">Carte</span>
                  </div>
                  <p className="text-lg font-bold">{formatCurrency(currentSession.totalCard)}</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50">
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-4 h-4 text-orange-600" />
                    <span className="text-xs text-orange-600 font-medium">Mobile Money</span>
                  </div>
                  <p className="text-lg font-bold">{formatCurrency(currentSession.totalMobileMoney)}</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-green-600 font-medium">Total ventes</span>
                  </div>
                  <p className="text-lg font-bold">{formatCurrency(currentSession.totalSales)}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-sm">
                <div><span className="text-muted-foreground">Ouverture:</span> <span className="font-medium">{formatCurrency(currentSession.openingAmount)}</span></div>
                <div><span className="text-muted-foreground">Attendu en caisse:</span> <span className="font-medium">{formatCurrency(currentSession.expectedAmount)}</span></div>
                <div><span className="text-muted-foreground">Transactions:</span> <span className="font-medium">{currentSession.transactionCount}</span></div>
              </div>

              {/* Alerte tickets impayés */}
              {unpaidTickets.length > 0 && (
                <div className="mt-4 p-4 rounded-lg border border-red-300 bg-red-50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span className="font-semibold text-red-700">
                      {unpaidTickets.length} ticket(s) impayé(s) — Clôture impossible
                    </span>
                  </div>
                  <p className="text-sm text-red-600 mb-3">Tous les tickets doivent être validés (payés) avant de pouvoir fermer la caisse.</p>
                  <div className="space-y-1">
                    {unpaidTickets.map(ticket => (
                      <div key={ticket._id} className="flex items-center justify-between p-2 rounded bg-white border border-red-200 text-sm">
                        <div className="flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-red-500" />
                          <span className="font-medium">{ticket.ticketNumber}</span>
                          <span className="text-muted-foreground">Table {ticket.table?.number || '?'}</span>
                        </div>
                        <Badge variant="destructive">{formatCurrency(ticket.total)}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wallet className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Aucune caisse ouverte</p>
              <p className="text-sm text-muted-foreground mb-4">Ouvrez votre caisse pour commencer à enregistrer des paiements</p>
              <Button onClick={() => setOpenDialog(true)}>
                <DoorOpen className="w-4 h-4 mr-2" /> Ouvrir la caisse
              </Button>
            </CardContent>
          </Card>
        )}

        {/* History */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Historique des sections</CardTitle></CardHeader>
          <CardContent>
            {history.filter(s => s.status === 'closed').length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Aucun historique</p>
            ) : (
              <div className="space-y-3">
                {history.filter(s => s.status === 'closed').map(session => (
                  <div key={session._id} className="rounded-lg border bg-card p-3 sm:p-4 space-y-3">
                    {/* Session header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <p className="font-semibold text-sm">{session.sessionNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(session.openedAt)} → {formatDateTime(session.closedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{session.transactionCount} trans.</span>
                        <Badge className={session.difference >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          Écart: {formatCurrency(session.difference)}
                        </Badge>
                      </div>
                    </div>

                    {/* Payment breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50">
                        <Banknote className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-blue-600 font-medium truncate">Espèces</p>
                          <p className="text-sm font-bold truncate">{formatCurrency(session.totalCash)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-50">
                        <CreditCard className="w-4 h-4 text-purple-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-purple-600 font-medium truncate">Carte</p>
                          <p className="text-sm font-bold truncate">{formatCurrency(session.totalCard)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-50">
                        <Smartphone className="w-4 h-4 text-orange-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-orange-600 font-medium truncate">Mobile Money</p>
                          <p className="text-sm font-bold truncate">{formatCurrency(session.totalMobileMoney)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50">
                        <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-green-600 font-medium truncate">Total ventes</p>
                          <p className="text-sm font-bold truncate">{formatCurrency(session.totalSales)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Opening / closing amounts */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-2">
                      <span>Fond d'ouverture: <span className="font-medium text-foreground">{formatCurrency(session.openingAmount)}</span></span>
                      <span>Clôture réelle: <span className="font-medium text-foreground">{formatCurrency(session.closingAmount)}</span></span>
                      <span>Attendu: <span className="font-medium text-foreground">{formatCurrency(session.expectedAmount)}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Open Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ouvrir la caisse</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Montant d'ouverture (fond de caisse)</Label>
              <Input type="number" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Annuler</Button>
            <Button onClick={handleOpen} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DoorOpen className="w-4 h-4 mr-2" />}
              Ouvrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fermer la caisse</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!canClose && (
              <div className="p-3 rounded-lg border border-red-300 bg-red-50">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">Clôture impossible</span>
                </div>
                <p className="text-xs text-red-600">{unpaidTickets.length} ticket(s) impayé(s). Encaissez-les d'abord via la section Tickets.</p>
                <div className="mt-2 space-y-1">
                  {unpaidTickets.map(ticket => (
                    <div key={ticket._id} className="flex items-center justify-between text-xs p-1.5 rounded bg-white border border-red-200">
                      <span className="font-medium">{ticket.ticketNumber} — Table {ticket.table?.number || '?'}</span>
                      <span className="font-bold text-red-600">{formatCurrency(ticket.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span>Fond de caisse:</span><span>{formatCurrency(currentSession?.openingAmount || 0)}</span></div>
              <div className="flex justify-between"><span>Ventes espèces:</span><span>{formatCurrency(currentSession?.totalCash || 0)}</span></div>
              <div className="flex justify-between font-bold"><span>Montant attendu:</span><span>{formatCurrency(currentSession?.expectedAmount || 0)}</span></div>
            </div>
            <div className="space-y-2">
              <Label>Montant réel en caisse</Label>
              <Input type="number" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} placeholder="0" />
            </div>
            {closingAmount && (
              <p className={`text-sm font-medium ${parseFloat(closingAmount) - (currentSession?.expectedAmount || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Écart: {formatCurrency(parseFloat(closingAmount) - (currentSession?.expectedAmount || 0))}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleClose} disabled={submitting || !canClose}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DoorClosed className="w-4 h-4 mr-2" />}
              {canClose ? 'Fermer la caisse' : `${unpaidTickets.length} ticket(s) impayé(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
