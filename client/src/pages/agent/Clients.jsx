import { useState, useEffect, useCallback } from 'react';
import { clientsAPI, readCache } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Search, Plus, UserCircle, Loader2, Phone, Mail, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Clients() {
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState(() => readCache('/clients', { search: '' })?.data?.data || []);
  const [loading, setLoading] = useState(() => !readCache('/clients', { search: '' }));
  const [dialog, setDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientHistory, setClientHistory] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', type: 'individual', category: 'standard' });
  const [submitting, setSubmitting] = useState(false);

  const loadClients = useCallback(async () => {
    try {
      const { data } = await clientsAPI.getAll({ search: searchQuery });
      setClients(data.data);
    } catch (error) {
      toast.error('Erreur chargement clients');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName) { toast.error('Nom et prénom requis'); return; }
    setSubmitting(true);
    try {
      if (selectedClient) {
        await clientsAPI.update(selectedClient._id, form);
        toast.success('Client mis à jour');
      } else {
        await clientsAPI.create(form);
        toast.success('Client créé');
      }
      setDialog(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', type: 'individual', category: 'standard' });
      setSelectedClient(null);
      loadClients();
    } catch (error) {
      toast.error('Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const viewDetails = async (client) => {
    setSelectedClient(client);
    try {
      const { data } = await clientsAPI.getHistory(client._id);
      setClientHistory(data.data);
      setDetailDialog(true);
    } catch (error) {
      toast.error('Erreur chargement historique');
    }
  };

  const editClient = (client) => {
    setSelectedClient(client);
    setForm({
      firstName: client.firstName, lastName: client.lastName,
      email: client.email, phone: client.phone,
      type: client.type, category: client.category
    });
    setDialog(true);
  };

  return (
    <div>
      <TopBar title="Clients" />
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher un client..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Button onClick={() => { setSelectedClient(null); setForm({ firstName: '', lastName: '', email: '', phone: '', type: 'individual', category: 'standard' }); setDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Nouveau client
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : clients.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Aucun client trouvé</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {clients.map(client => (
              <Card key={client._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold">{client.firstName} {client.lastName}</p>
                      {client.phone && <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</p>}
                      {client.email && <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{client.email}</p>}
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline">{client.type === 'individual' ? 'Particulier' : 'Entreprise'}</Badge>
                        <Badge variant="secondary">{client.visitCount} visites</Badge>
                        <Badge className="bg-green-100 text-green-800">{formatCurrency(client.totalSpent)}</Badge>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => viewDetails(client)}>Historique</Button>
                        <Button size="sm" variant="ghost" onClick={() => editClient(client)}>Modifier</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedClient ? 'Modifier le client' : 'Nouveau client'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prénom</Label><Input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} /></div>
              <div><Label>Nom</Label><Input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><Label>Téléphone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Particulier</SelectItem>
                  <SelectItem value="corporate">Entreprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {selectedClient ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Historique - {selectedClient?.firstName} {selectedClient?.lastName}</DialogTitle></DialogHeader>
          {clientHistory && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {clientHistory.tickets?.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">Aucun historique</p>
              ) : (
                clientHistory.tickets?.map(ticket => (
                  <div key={ticket._id} className="p-3 bg-muted rounded-lg text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{ticket.ticketNumber}</span>
                      <span className="font-bold">{formatCurrency(ticket.total)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDateTime(ticket.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
