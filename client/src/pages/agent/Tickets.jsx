import { useState, useEffect, useCallback } from 'react';
import { ticketsAPI, printerAPI } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Loader2, Printer, FileText, Receipt, Hash } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [printing, setPrinting] = useState(false);
  const { socket } = useSocket();

  const loadTickets = useCallback(async () => {
    try {
      const { data } = await ticketsAPI.getAll({ limit: 100 });
      setTickets(data.data);
    } catch (error) {
      toast.error('Erreur chargement tickets');
    } finally {
      setLoading(false);
    }
  }, []);

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
      // Send to physical printer
      await printerAPI.printTicket({ ticketId: ticket._id });
      await ticketsAPI.markPrinted(ticket._id);
      toast.success('Facture envoyée à l\'imprimante');
      loadTickets();
    } catch (error) {
      // Fallback: browser print
      toast.error('Imprimante non disponible — impression navigateur');
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div>
      <TopBar title="Tickets & Factures" />
      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
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
                <CardContent className="p-4 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${ticket.type === 'invoice' ? 'bg-green-50' : 'bg-blue-50'}`}>
                      {ticket.type === 'invoice' ? <FileText className="w-5 h-5 text-green-600" /> : <Receipt className="w-5 h-5 text-blue-600" />}
                    </div>
                    <div>
                      <p className="font-bold">{ticket.ticketNumber}</p>
                      <p className="text-sm text-muted-foreground">
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
                    <p className="font-bold text-primary">{formatCurrency(ticket.total)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(ticket.createdAt)}</p>
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

              <Button className="w-full" onClick={() => printTicket(selectedTicket)} disabled={printing}>
                {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                Imprimer & envoyer au client
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
