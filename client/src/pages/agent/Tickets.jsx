import { useState, useEffect, useCallback } from 'react';
import { ticketsAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { usePrinter } from '@/contexts/PrinterContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Loader2, Printer, CheckCircle2, Banknote, Smartphone, CreditCard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';

const METHOD_LABEL = { cash: 'Espèces', mobile_money: 'Mobile Money', card: 'Carte', mixed: 'Mixte' };
const METHOD_ICON = { cash: Banknote, mobile_money: Smartphone, card: CreditCard, mixed: CreditCard };
const METHOD_COLOR = { cash: 'text-green-600', mobile_money: 'text-blue-600', card: 'text-purple-600', mixed: 'text-orange-600' };

export default function PaidInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [printing, setPrinting] = useState(false);
  const { socket } = useSocket();
  const { printTicketById } = usePrinter();

  const load = useCallback(async () => {
    try {
      const { data } = await ticketsAPI.getAll({ agent: user?._id, type: 'invoice', isPaid: 'true', limit: 200 });
      setInvoices(data.data);
    } catch {
      toast.error('Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on('ticket:paid', load);
    socket.on('ticket:deleted', load);
    return () => {
      socket.off('ticket:paid', load);
      socket.off('ticket:deleted', load);
    };
  }, [socket, load]);

  const handlePrint = async (inv) => {
    setPrinting(true);
    try {
      await printTicketById(inv._id);
    } catch {
      toast.error('Erreur impression');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div>
      <TopBar title="Factures payées" />
      <div className="p-3 sm:p-6 space-y-4">
        <p className="text-xs text-muted-foreground">Les factures payées sont automatiquement supprimées après 24 h.</p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-muted-foreground">Aucune facture payée</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {invoices.map((inv, idx) => {
              const Icon = METHOD_ICON[inv.payment?.method] || Banknote;
              return (
                <Card key={inv._id} className="hover:shadow-md transition-shadow cursor-pointer border-green-100" onClick={() => setSelected(inv)}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          </div>
                          <span className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{idx + 1}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{inv.ticketNumber}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {inv.tableNumber || (inv.table?.number ? `Table ${inv.table.number}` : 'À emporter')}
                            {' · '}{formatDateTime(inv.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <p className="font-bold text-primary text-sm">{formatCurrency(inv.total)}</p>
                        <Badge variant="outline" className="gap-1 text-green-700 border-green-300 text-xs">
                          <Icon className={`w-3 h-3 ${METHOD_COLOR[inv.payment?.method] || ''}`} />
                          {METHOD_LABEL[inv.payment?.method] || 'Payé'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.ticketNumber}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>Table : {selected.tableNumber || selected.table?.number || '—'}</p>
                <p>Date : {formatDateTime(selected.createdAt)}</p>
              </div>

              <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                {selected.items?.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{item.quantity}× {item.name}</span>
                    <span>{formatCurrency(item.totalPrice)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(selected.total)}</span>
                </div>
              </div>

              {selected.payment && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm space-y-1">
                  <p className="font-semibold text-green-800 mb-1">Paiement</p>
                  {selected.payment.method === 'mixed' && selected.payment.mixedPayments?.length > 0 ? (
                    selected.payment.mixedPayments.map((mp, i) => {
                      const Icon = METHOD_ICON[mp.method] || Banknote;
                      return (
                        <div key={i} className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5">
                            <Icon className={`w-3.5 h-3.5 ${METHOD_COLOR[mp.method] || ''}`} />
                            {METHOD_LABEL[mp.method] || mp.method}
                          </span>
                          <span className="font-medium">{formatCurrency(mp.amount)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex justify-between items-center">
                      {(() => { const Icon = METHOD_ICON[selected.payment.method] || Banknote; return (
                        <span className="flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${METHOD_COLOR[selected.payment.method] || ''}`} />
                          {METHOD_LABEL[selected.payment.method] || selected.payment.method}
                        </span>
                      ); })()}
                      <span className="font-medium">{formatCurrency(selected.payment.amount)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-bold text-green-700">
                    <span>Total encaissé</span>
                    <span>{formatCurrency(selected.payment.amountReceived || selected.total)}</span>
                  </div>
                </div>
              )}

              <Button className="w-full" variant="outline" onClick={() => handlePrint(selected)} disabled={printing}>
                {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                Réimprimer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
