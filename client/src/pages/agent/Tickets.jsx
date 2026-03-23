import { useState, useEffect, useCallback } from 'react';
import { ticketsAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { usePrinter } from '@/contexts/PrinterContext';
import TopBar from '@/components/layout/TopBar';
import PaymentDialog from '@/components/PaymentDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Loader2, Printer, FileText, Receipt, Hash, CreditCard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [payDialog, setPayDialog] = useState(false);
  const [invoiceToPay, setInvoiceToPay] = useState(null);
  const { user } = useAuth();
  const { socket } = useSocket();
  const { printTicketById } = usePrinter();

  const loadTickets = useCallback(async () => {
    try {
      const { data } = await ticketsAPI.getAll({ agent: user?._id, limit: 100 });
      setTickets(data.data);
    } catch (error) {
      toast.error('Erreur chargement tickets');
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  useEffect(() => {
    if (!socket) return;
    socket.on('ticket:created', loadTickets);
    socket.on('ticket:invoice-created', loadTickets);
    socket.on('ticket:paid', loadTickets);
    socket.on('ticket:deleted', loadTickets);
    return () => {
      socket.off('ticket:created', loadTickets);
      socket.off('ticket:invoice-created', loadTickets);
      socket.off('ticket:paid', loadTickets);
      socket.off('ticket:deleted', loadTickets);
    };
  }, [socket, loadTickets]);

  const filtered = filter === 'all' ? tickets :
    filter === 'paid' ? tickets.filter(t => t.type === 'invoice' && t.isPaid) :
    filter === 'unpaid' ? tickets.filter(t => t.type === 'invoice' && !t.isPaid) :
    tickets.filter(t => t.type === filter);

  const printTicket = async (ticket) => {
    setPrinting(true);
    try {
      await printTicketById(ticket._id);
      await ticketsAPI.markPrinted(ticket._id);
      loadTickets();
    } catch {
      toast.error('Erreur impression');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div>
      <TopBar title="Tickets & Factures" />
      <div className="p-3 sm:p-6 space-y-4">
        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
          {[
            { key: 'all', label: 'Tous' },
            { key: 'order', label: 'Tickets' },
            { key: 'invoice', label: 'Factures' },
            { key: 'paid', label: 'Factures payées' },
            { key: 'unpaid', label: 'Factures impayées' },
          ].map(({ key, label }) => (
            <Button key={key} variant={filter === key ? 'default' : 'outline'} size="sm" onClick={() => setFilter(key)}>
              {label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Aucun ticket trouvé</p>
        ) : (
          <div className="grid gap-3">
            {filtered.map(ticket => (
              <Card key={ticket._id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTicket(ticket)}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${ticket.type === 'invoice' ? 'bg-green-50' : 'bg-blue-50'}`}>
                      {ticket.type === 'invoice' ? <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" /> : <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm sm:text-base">{ticket.ticketNumber}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {ticket.table ? `Table ${ticket.table.number}` : 'À emporter'} · {ticket.agent?.firstName} {ticket.agent?.lastName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ticket.table && (
                      <Badge variant="outline" className="gap-1">
                        <Hash className="w-3 h-3" /> Table {ticket.table.number}
                      </Badge>
                    )}
                    <Badge variant={ticket.type === 'invoice' ? 'default' : 'secondary'}>
                      {ticket.type === 'invoice' ? 'Facture' : 'Ticket'}
                    </Badge>
                    {ticket.type === 'invoice' && (
                      <Badge variant={ticket.isPaid ? 'default' : 'destructive'}>
                        {ticket.isPaid ? 'Payé' : 'Impayé'}
                      </Badge>
                    )}
                    <p className="font-bold text-primary text-sm">{formatCurrency(ticket.total)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(ticket.createdAt)}</p>
                  </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedTicket?.ticketNumber}</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {selectedTicket.table && (
                  <Badge variant="outline"><Hash className="w-3 h-3 mr-1" /> Table {selectedTicket.table.number}</Badge>
                )}
                <Badge variant={selectedTicket.type === 'invoice' ? 'default' : 'secondary'}>
                  {selectedTicket.type === 'invoice' ? 'Facture' : 'Ticket'}
                </Badge>
                {selectedTicket.type === 'invoice' && (
                  <Badge variant={selectedTicket.isPaid ? 'default' : 'destructive'}>
                    {selectedTicket.isPaid ? 'Payé' : 'Impayé'}
                  </Badge>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                <p>Agent: {selectedTicket.agent?.firstName} {selectedTicket.agent?.lastName}</p>
                <p>Date: {formatDateTime(selectedTicket.createdAt)}</p>
              </div>

              <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                {selectedTicket.items?.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{item.quantity}x {item.name}</span>
                    <span>{formatCurrency(item.totalPrice)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(selectedTicket.total)}</span>
                </div>
              </div>

              {selectedTicket.type === 'invoice' && !selectedTicket.isPaid && (
                <Button className="w-full" variant="default" onClick={() => {
                  setInvoiceToPay(selectedTicket);
                  setPayDialog(true);
                }}>
                  <CreditCard className="w-4 h-4 mr-2" /> Confirmer le paiement
                </Button>
              )}
              <Button className="w-full" variant="outline" onClick={() => printTicket(selectedTicket)} disabled={printing}>
                {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                Imprimer & envoyer au client
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PaymentDialog
        open={payDialog}
        onOpenChange={setPayDialog}
        invoice={invoiceToPay}
        onSuccess={() => {
          setPayDialog(false);
          setInvoiceToPay(null);
          setSelectedTicket(null);
          loadTickets();
        }}
      />
    </div>
  );
}
