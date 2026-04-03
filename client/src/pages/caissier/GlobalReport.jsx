import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cashRegisterAPI } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import {
  Loader2, Calendar, ClipboardList, Banknote, CreditCard, Smartphone, Wallet, FileText
} from 'lucide-react';

export default function GlobalReport() {
  const { user } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [service, setService] = useState('all');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const { socket } = useSocket();

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date };
      if (service !== 'all') params.service = service;
      const { data } = await cashRegisterAPI.globalReport(params);
      setReport(data.data);
    } catch (err) {
      console.error('Erreur chargement rapport global:', err);
    } finally {
      setLoading(false);
    }
  }, [date, service]);

  useEffect(() => { loadReport(); }, [loadReport]);

  useEffect(() => {
    if (!socket) return;
    socket.on('payment:created', loadReport);
    socket.on('ticket:paid', loadReport);
    socket.on('cashRegister:closed', loadReport);
    return () => {
      socket.off('payment:created', loadReport);
      socket.off('ticket:paid', loadReport);
      socket.off('cashRegister:closed', loadReport);
    };
  }, [socket, loadReport]);

  return (
    <div>
      <TopBar title="Rapport global" />
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label>Service</Label>
                <Select value={service} onValueChange={setService}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les services</SelectItem>
                    <SelectItem value="1">Service 1 (Matin)</SelectItem>
                    <SelectItem value="2">Service 2 (Soir)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={loadReport} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ClipboardList className="w-4 h-4 mr-2" />}
                Générer
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : report ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card>
                <CardContent className="py-4 text-center">
                  <FileText className="w-5 h-5 mx-auto text-blue-600 mb-1" />
                  <p className="text-xs text-muted-foreground">Total factures</p>
                  <p className="text-xl font-bold">{report.totalInvoices}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <Wallet className="w-5 h-5 mx-auto text-green-600 mb-1" />
                  <p className="text-xs text-muted-foreground">Chiffre d'affaires</p>
                  <p className="text-xl font-bold">{formatCurrency(report.grandTotal)}</p>
                </CardContent>
              </Card>
              <Card className="col-span-2 sm:col-span-1">
                <CardContent className="py-4 text-center">
                  <Calendar className="w-5 h-5 mx-auto text-purple-600 mb-1" />
                  <p className="text-xs text-muted-foreground">Sessions</p>
                  <p className="text-xl font-bold">{report.report?.length || 0}</p>
                </CardContent>
              </Card>
            </div>

            {/* Per-agent breakdown */}
            {report.report?.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Détail par agent</h3>
                {report.report.map((r, idx) => (
                  <Card key={idx}>
                    <CardContent className="py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {r.session.agent?.firstName?.[0]}{r.session.agent?.lastName?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{r.session.agent?.firstName} {r.session.agent?.lastName}</p>
                            <p className="text-xs text-muted-foreground">
                              Service {r.session.service} — {r.session.sessionNumber}
                            </p>
                          </div>
                        </div>
                        <Badge variant={r.session.status === 'open' ? 'default' : 'secondary'}>
                          {r.session.status === 'open' ? 'En cours' : 'Clôturé'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                        <div className="rounded bg-blue-50 p-2 text-center">
                          <p className="text-muted-foreground">Factures</p>
                          <p className="font-bold">{r.invoiceCount}</p>
                        </div>
                        <div className="rounded bg-green-50 p-2 text-center">
                          <p className="text-muted-foreground">Total</p>
                          <p className="font-bold">{formatCurrency(r.totalAmount)}</p>
                        </div>
                        <div className="rounded bg-emerald-50 p-2 text-center">
                          <Banknote className="w-3 h-3 mx-auto mb-0.5 text-emerald-600" />
                          <p className="text-muted-foreground">Espèces</p>
                          <p className="font-bold">{formatCurrency(r.totalCash)}</p>
                        </div>
                        <div className="rounded bg-purple-50 p-2 text-center">
                          <CreditCard className="w-3 h-3 mx-auto mb-0.5 text-purple-600" />
                          <p className="text-muted-foreground">Carte</p>
                          <p className="font-bold">{formatCurrency(r.totalCard)}</p>
                        </div>
                        <div className="rounded bg-orange-50 p-2 text-center">
                          <Smartphone className="w-3 h-3 mx-auto mb-0.5 text-orange-600" />
                          <p className="text-muted-foreground">Mobile</p>
                          <p className="font-bold">{formatCurrency(r.totalMobileMoney)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Aucune session trouvée pour cette date et ce service.
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
