import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { cashRegisterAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import {
  Users, Wallet, Loader2, Calendar, Play, Square, Eye,
  AlertTriangle, CheckCircle2, Clock, CreditCard, Banknote, Smartphone, ChevronDown, ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function CashierDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  // Open service dialog
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [serviceNum, setServiceNum] = useState('1');
  const [openingAmount, setOpeningAmount] = useState('');

  // Close service dialog
  const [closeDialog, setCloseDialog] = useState(false);
  const [closeAgent, setCloseAgent] = useState(null);
  const [closingAmount, setClosingAmount] = useState('');

  // Invoice detail
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(null);
  const [expandedAgent, setExpandedAgent] = useState(null);

  // Report detail
  const [reportDetail, setReportDetail] = useState(null);
  const [reportLoading, setReportLoading] = useState(null);

  const loadAgents = useCallback(async () => {
    try {
      const { data } = await cashRegisterAPI.getAgents();
      setAgents(data.data);
    } catch (err) {
      console.error('Erreur chargement agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  useEffect(() => {
    if (!socket) return;
    socket.on('cashRegister:opened', loadAgents);
    socket.on('cashRegister:closed', loadAgents);
    socket.on('invoice:created', loadAgents);
    socket.on('invoice:updated', loadAgents);
    socket.on('ticket:paid', loadAgents);
    return () => {
      socket.off('cashRegister:opened', loadAgents);
      socket.off('cashRegister:closed', loadAgents);
      socket.off('invoice:created', loadAgents);
      socket.off('invoice:updated', loadAgents);
      socket.off('ticket:paid', loadAgents);
    };
  }, [socket, loadAgents]);

  const handleOpenService = async () => {
    if (!selectedAgent) return;
    setActionLoading('open');
    try {
      await cashRegisterAPI.openService({
        agentId: selectedAgent._id,
        service: parseInt(serviceNum),
        openingAmount: parseFloat(openingAmount) || 0
      });
      toast.success(`Service ${serviceNum} ouvert pour ${selectedAgent.firstName} ${selectedAgent.lastName}`);
      setOpenDialog(false);
      setSelectedAgent(null);
      setOpeningAmount('');
      loadAgents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur ouverture service');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseService = async () => {
    if (!closeAgent) return;
    setActionLoading('close');
    try {
      await cashRegisterAPI.closeService({
        agentId: closeAgent._id,
        closingAmount: parseFloat(closingAmount) || 0
      });
      toast.success(`Service clôturé pour ${closeAgent.firstName} ${closeAgent.lastName}`);
      setCloseDialog(false);
      setCloseAgent(null);
      setClosingAmount('');
      setExpandedAgent(null);
      setInvoiceDetail(null);
      setReportDetail(null);
      loadAgents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur clôture service');
    } finally {
      setActionLoading(null);
    }
  };

  const loadInvoices = async (agentId) => {
    setInvoiceLoading(agentId);
    try {
      const { data } = await cashRegisterAPI.agentInvoices(agentId);
      setInvoiceDetail({ agentId, ...data.data });
    } catch (err) {
      toast.error('Erreur chargement factures');
    } finally {
      setInvoiceLoading(null);
    }
  };

  const loadReport = async (agentId) => {
    setReportLoading(agentId);
    try {
      const { data } = await cashRegisterAPI.serviceReport(agentId);
      setReportDetail({ agentId, ...data.data });
    } catch (err) {
      toast.error('Erreur chargement rapport');
    } finally {
      setReportLoading(null);
    }
  };

  const toggleExpand = (agentId) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null);
      setInvoiceDetail(null);
      setReportDetail(null);
    } else {
      setExpandedAgent(agentId);
      loadInvoices(agentId);
      loadReport(agentId);
    }
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const openCount = agents.filter(a => a.openSession).length;

  return (
    <div>
      <TopBar title={`Caissier — ${user?.firstName}`} />
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Date + summary */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="w-4 h-4" />
            <span className="capitalize">{dateStr}</span>
          </div>
          <Badge variant="outline" className="w-fit">
            <Users className="w-3 h-3 mr-1" />
            {openCount} service(s) ouvert(s) / {agents.length} agent(s)
          </Badge>
        </div>

        {/* Agents list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Aucun agent actif trouvé
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {agents.map(agent => (
              <Card key={agent._id} className={agent.openSession ? 'border-green-200' : ''}>
                <CardContent className="py-4">
                  {/* Agent header row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${agent.openSession ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {agent.firstName[0]}{agent.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium">{agent.firstName} {agent.lastName}</p>
                        {agent.openSession ? (
                          <p className="text-xs text-green-600">
                            Service {agent.openSession.service} — Ouvert à {new Date(agent.openSession.openedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Aucun service ouvert</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {agent.openSession ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => toggleExpand(agent._id)}>
                            <Eye className="w-4 h-4 mr-1" />
                            Détails
                            {expandedAgent === agent._id ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => { setCloseAgent(agent); setCloseDialog(true); }}>
                            <Square className="w-4 h-4 mr-1" />
                            Clôturer
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => { setSelectedAgent(agent); setOpenDialog(true); }}>
                          <Play className="w-4 h-4 mr-1" />
                          Ouvrir service
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedAgent === agent._id && agent.openSession && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {/* Sales summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-blue-50 p-3 text-center">
                          <Wallet className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                          <p className="text-xs text-muted-foreground">Total ventes</p>
                          <p className="font-bold text-sm">{formatCurrency(agent.openSession.totalSales || 0)}</p>
                        </div>
                        <div className="rounded-lg bg-green-50 p-3 text-center">
                          <Banknote className="w-4 h-4 mx-auto text-green-600 mb-1" />
                          <p className="text-xs text-muted-foreground">Espèces</p>
                          <p className="font-bold text-sm">{formatCurrency(agent.openSession.totalCash || 0)}</p>
                        </div>
                        <div className="rounded-lg bg-purple-50 p-3 text-center">
                          <CreditCard className="w-4 h-4 mx-auto text-purple-600 mb-1" />
                          <p className="text-xs text-muted-foreground">Carte</p>
                          <p className="font-bold text-sm">{formatCurrency(agent.openSession.totalCard || 0)}</p>
                        </div>
                        <div className="rounded-lg bg-orange-50 p-3 text-center">
                          <Smartphone className="w-4 h-4 mx-auto text-orange-600 mb-1" />
                          <p className="text-xs text-muted-foreground">Mobile Money</p>
                          <p className="font-bold text-sm">{formatCurrency(agent.openSession.totalMobileMoney || 0)}</p>
                        </div>
                      </div>

                      {/* Invoice status */}
                      {invoiceLoading === agent._id ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
                      ) : invoiceDetail?.agentId === agent._id && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Factures du service</h4>
                          <div className="flex gap-3 flex-wrap">
                            {invoiceDetail.enCours > 0 && (
                              <Badge variant="destructive" className="gap-1">
                                <Clock className="w-3 h-3" /> {invoiceDetail.enCours} en cours
                              </Badge>
                            )}
                            {invoiceDetail.aEncaisser > 0 && (
                              <Badge variant="secondary" className="gap-1 bg-orange-100 text-orange-700">
                                <AlertTriangle className="w-3 h-3" /> {invoiceDetail.aEncaisser} à encaisser
                              </Badge>
                            )}
                            <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700">
                              <CheckCircle2 className="w-3 h-3" /> {invoiceDetail.paid?.length || 0} payée(s)
                            </Badge>
                          </div>

                          {invoiceDetail.unpaidList?.length > 0 && (
                            <div className="mt-2 rounded border overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/50">
                                    <th className="text-left p-2">N°</th>
                                    <th className="text-left p-2">Table</th>
                                    <th className="text-right p-2">Montant</th>
                                    <th className="text-center p-2">Statut</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoiceDetail.unpaidList.map(inv => (
                                    <tr key={inv._id} className="border-t">
                                      <td className="p-2">{inv.ticketNumber}</td>
                                      <td className="p-2">{inv.tableNumber || '—'}</td>
                                      <td className="p-2 text-right">{formatCurrency(inv.total)}</td>
                                      <td className="p-2 text-center">
                                        <Badge variant={inv.memoStatus === 'en_cours' ? 'destructive' : 'secondary'} className="text-[10px]">
                                          {inv.memoStatus === 'en_cours' ? 'En cours' : 'À encaisser'}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Paid invoices report */}
                      {reportLoading === agent._id ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
                      ) : reportDetail?.agentId === agent._id && reportDetail.invoices?.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Factures payées</h4>
                          <div className="rounded border overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-white">
                                <tr className="bg-muted/50">
                                  <th className="text-left p-2">N°</th>
                                  <th className="text-left p-2">Table</th>
                                  <th className="text-right p-2">Montant</th>
                                  <th className="text-center p-2">Mode</th>
                                  <th className="text-center p-2">Heure</th>
                                </tr>
                              </thead>
                              <tbody>
                                {reportDetail.invoices.map(inv => (
                                  <tr key={inv._id} className="border-t">
                                    <td className="p-2">{inv.ticketNumber}</td>
                                    <td className="p-2">{inv.tableNumber || '—'}</td>
                                    <td className="p-2 text-right">{formatCurrency(inv.total)}</td>
                                    <td className="p-2 text-center">
                                      <Badge variant="outline" className="text-[10px]">
                                        {inv.payment?.method || inv.paymentMethod || '—'}
                                      </Badge>
                                    </td>
                                    <td className="p-2 text-center text-muted-foreground">
                                      {new Date(inv.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Open Service Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ouvrir un service</DialogTitle>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Agent: <strong>{selectedAgent.firstName} {selectedAgent.lastName}</strong>
              </p>
              <div>
                <Label>Service</Label>
                <Select value={serviceNum} onValueChange={setServiceNum}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Service 1 (Matin)</SelectItem>
                    <SelectItem value="2">Service 2 (Soir)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Montant d'ouverture (FCFA)</Label>
                <Input type="number" placeholder="0" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Annuler</Button>
            <Button onClick={handleOpenService} disabled={actionLoading === 'open'}>
              {actionLoading === 'open' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ouvrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Service Dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Clôturer le service
            </DialogTitle>
          </DialogHeader>
          {closeAgent && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Agent: <strong>{closeAgent.firstName} {closeAgent.lastName}</strong>
                {closeAgent.openSession && <> — Service {closeAgent.openSession.service}</>}
              </p>
              <div>
                <Label>Montant en caisse (FCFA)</Label>
                <Input type="number" placeholder="0" value={closingAmount} onChange={e => setClosingAmount(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Toutes les factures en cours et à encaisser doivent être réglées avant la clôture.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleCloseService} disabled={actionLoading === 'close'}>
              {actionLoading === 'close' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Clôturer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
