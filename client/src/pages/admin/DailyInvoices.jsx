import { useState, useEffect, useCallback } from 'react';
import { statsAPI } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Loader2, Printer, FileText, Banknote, Smartphone, CreditCard, CalendarDays, Users, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DailyInvoices() {
  const { socket } = useSocket();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await statsAPI.getDailyInvoices({ date });
      setData(res.data.data);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Erreur chargement des factures');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh when a new payment arrives
  useEffect(() => {
    if (!socket) return;
    socket.on('payment:created', loadData);
    return () => socket.off('payment:created', loadData);
  }, [socket, loadData]);

  const printConsolidated = () => {
    if (!data) return;
    const dateObj = new Date(data.date + 'T12:00:00');
    const dateFormatted = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture globale - ${dateFormatted}</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; font-size: 13px; color: #333; }
      h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
      h2 { font-size: 15px; margin: 18px 0 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
      h3 { font-size: 13px; margin: 12px 0 6px; color: #555; }
      .subtitle { text-align: center; color: #666; margin-bottom: 16px; }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px; }
      .summary-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px; text-align: center; }
      .summary-box .label { font-size: 11px; color: #888; }
      .summary-box .value { font-size: 16px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
      th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #eee; }
      th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; color: #666; }
      .text-right { text-align: right; }
      .bold { font-weight: bold; }
      .agent-total { background: #f0f9ff; font-weight: bold; }
      .grand-total { background: #333; color: #fff; font-size: 15px; }
      .grand-total td { padding: 10px; }
      .payment-tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 4px; }
      .tag-cash { background: #dcfce7; color: #166534; }
      .tag-mobile { background: #dbeafe; color: #1e40af; }
      .tag-card { background: #f3e8ff; color: #6b21a8; }
      .tag-mixed { background: #fef3c7; color: #92400e; }
      @media print { body { padding: 0; } }
    </style></head><body>`;

    html += `<h1>FACTURE GLOBALE JOURNALIÈRE</h1>`;
    html += `<p class="subtitle">${dateFormatted}</p>`;

    html += `<div class="summary-grid">
      <div class="summary-box"><div class="label">Total Général</div><div class="value">${data.grandTotal.toLocaleString('fr-FR')} FCFA</div></div>
      <div class="summary-box"><div class="label">Espèces</div><div class="value">${data.totalCash.toLocaleString('fr-FR')} FCFA</div></div>
      <div class="summary-box"><div class="label">Mobile Money</div><div class="value">${data.totalMobileMoney.toLocaleString('fr-FR')} FCFA</div></div>
      <div class="summary-box"><div class="label">Carte bancaire</div><div class="value">${data.totalCard.toLocaleString('fr-FR')} FCFA</div></div>
    </div>`;

    html += `<p><strong>${data.invoiceCount}</strong> factures — <strong>${data.agents.length}</strong> agent(s)</p>`;

    for (const agent of data.agents) {
      html += `<h2>${agent.agentName}</h2>`;
      html += `<p style="font-size:11px;color:#666;">Total: ${agent.total.toLocaleString('fr-FR')} FCFA | Espèces: ${agent.cash.toLocaleString('fr-FR')} | Mobile Money: ${agent.mobileMoney.toLocaleString('fr-FR')} | Carte: ${agent.card.toLocaleString('fr-FR')}</p>`;

      html += `<table><thead><tr><th>N° Facture</th><th>Heure</th><th>Emplacement</th><th>Articles</th><th>Paiement</th><th class="text-right">Montant</th></tr></thead><tbody>`;

      for (const inv of agent.invoices) {
        const time = new Date(inv.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const items = inv.items.map(it => `${it.quantity}x ${it.name}`).join(', ');

        let payTag = '';
        const methodTags = { cash: 'tag-cash', mobile_money: 'tag-mobile', card: 'tag-card', mixed: 'tag-mixed' };
        const methodLabels = { cash: 'Espèces', mobile_money: 'Mobile Money', card: 'Carte', mixed: 'Mixte' };

        if (inv.paymentMethod === 'mixed' && inv.mixedPayments?.length > 0) {
          payTag = inv.mixedPayments.map(mp =>
            `<span class="payment-tag ${methodTags[mp.method] || ''}">${methodLabels[mp.method] || mp.method}: ${mp.amount.toLocaleString('fr-FR')}</span>`
          ).join('');
        } else {
          payTag = `<span class="payment-tag ${methodTags[inv.paymentMethod] || ''}">${methodLabels[inv.paymentMethod] || inv.paymentMethod}</span>`;
        }

        html += `<tr><td>${inv.ticketNumber}</td><td>${time}</td><td>${inv.table}</td><td style="font-size:11px">${items}</td><td>${payTag}</td><td class="text-right bold">${inv.total.toLocaleString('fr-FR')}</td></tr>`;
      }

      html += `<tr class="agent-total"><td colspan="5">Total ${agent.agentName}</td><td class="text-right">${agent.total.toLocaleString('fr-FR')} FCFA</td></tr>`;
      html += `</tbody></table>`;
    }

    html += `<table><tbody><tr class="grand-total"><td colspan="5">TOTAL GÉNÉRAL</td><td class="text-right">${data.grandTotal.toLocaleString('fr-FR')} FCFA</td></tr></tbody></table>`;
    html += `<p style="text-align:center;color:#999;font-size:11px;margin-top:20px;">Imprimé le ${new Date().toLocaleString('fr-FR')}</p>`;
    html += `</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.print(); };
  };

  const methodLabel = (m) => m === 'cash' ? 'Espèces' : m === 'mobile_money' ? 'Mobile Money' : m === 'card' ? 'Carte bancaire' : m === 'mixed' ? 'Mixte' : m;

  return (
    <div>
      <TopBar title="Facture Globale Journalière" />
      <div className="p-3 sm:p-6 space-y-4">
        {/* Date picker + actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" />
          </div>
          {data && !loading && (
            <Button onClick={printConsolidated}>
              <Printer className="w-4 h-4 mr-2" /> Imprimer la facture globale
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : !data || data.invoiceCount === 0 ? (
          <p className="text-center text-muted-foreground py-12">Aucune facture payée pour cette date</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <Receipt className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-bold text-primary">{formatCurrency(data.grandTotal)}</p>
                  <p className="text-xs text-muted-foreground">Total Général</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Banknote className="w-5 h-5 mx-auto mb-1 text-green-600" />
                  <p className="text-xl font-bold text-green-600">{formatCurrency(data.totalCash)}</p>
                  <p className="text-xs text-muted-foreground">Espèces</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Smartphone className="w-5 h-5 mx-auto mb-1 text-blue-600" />
                  <p className="text-xl font-bold text-blue-600">{formatCurrency(data.totalMobileMoney)}</p>
                  <p className="text-xs text-muted-foreground">Mobile Money</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <CreditCard className="w-5 h-5 mx-auto mb-1 text-purple-600" />
                  <p className="text-xl font-bold text-purple-600">{formatCurrency(data.totalCard)}</p>
                  <p className="text-xs text-muted-foreground">Carte bancaire</p>
                </CardContent>
              </Card>
            </div>

            <p className="text-sm text-muted-foreground">
              <strong>{data.invoiceCount}</strong> facture(s) — <strong>{data.agents.length}</strong> agent(s)
            </p>

            {/* Per-agent sections */}
            {data.agents.map((agent, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4" /> {agent.agentName}
                    <Badge variant="outline" className="ml-auto">{agent.invoices.length} facture(s)</Badge>
                    <Badge className="bg-primary">{formatCurrency(agent.total)}</Badge>
                  </CardTitle>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><Banknote className="w-3 h-3 text-green-600" /> {formatCurrency(agent.cash)}</span>
                    <span className="flex items-center gap-1"><Smartphone className="w-3 h-3 text-blue-600" /> {formatCurrency(agent.mobileMoney)}</span>
                    <span className="flex items-center gap-1"><CreditCard className="w-3 h-3 text-purple-600" /> {formatCurrency(agent.card)}</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {agent.invoices.map(inv => (
                      <div key={inv._id} className="flex items-center justify-between p-2 rounded-lg bg-muted text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-green-600 shrink-0" />
                            <span className="font-medium">{inv.ticketNumber}</span>
                            <span className="text-xs text-muted-foreground">{inv.table}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {inv.items.map(it => `${it.quantity}x ${it.name}`).join(', ')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {inv.paymentMethod === 'mixed' && inv.mixedPayments?.length > 0 ? (
                            <div className="flex gap-1">
                              {inv.mixedPayments.map((mp, i) => (
                                <Badge key={i} variant="outline" className="text-[10px] py-0">
                                  {methodLabel(mp.method)}: {formatCurrency(mp.amount)}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] py-0">
                              {methodLabel(inv.paymentMethod)}
                            </Badge>
                          )}
                          <span className="font-bold">{formatCurrency(inv.total)}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(inv.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
