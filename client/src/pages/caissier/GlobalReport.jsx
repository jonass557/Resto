import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cashRegisterAPI, printerAPI } from '@/services/api';
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
  Loader2, Calendar, ClipboardList, Banknote, CreditCard, Smartphone, Wallet, FileText, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';

const PAYMENT_LABELS = { cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money', mixed: 'Mixte', gift_card: 'Carte cadeau' };

function printDailyInvoice(detail, date) {
  const fmt = (n) => (n || 0).toLocaleString('fr-FR') + ' FCFA';
  const fmtDate = (d) => new Date(d).toLocaleString('fr-FR');
  const fmtTime = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let body = '';
  for (const row of detail.detail || []) {
    const s = row.session;
    body += `
      <div class="session">
        <div class="session-header">
          <span>Agent : <strong>${s.agent?.firstName} ${s.agent?.lastName}</strong> — Service ${s.service} (${s.sessionNumber})</span>
          <span class="badge ${s.status === 'open' ? 'open' : 'closed'}">${s.status === 'open' ? 'En cours' : 'Clôturé'}</span>
        </div>
        <div class="session-times">
          Ouverture : ${fmtDate(s.openedAt)}${s.closedAt ? ' | Clôture : ' + fmtDate(s.closedAt) : ''}
        </div>
        <div class="pay-row">
          <span>Espèces : ${fmt(s.totalCash)}</span>
          <span>Carte : ${fmt(s.totalCard)}</span>
          <span>Mobile : ${fmt(s.totalMobileMoney)}</span>
          <span>Transactions : ${s.transactionCount || 0}</span>
        </div>`;

    if (row.invoices.length > 0) {
      body += `<table><thead><tr>
        <th>N° Ticket</th><th>Table</th><th>Heure</th><th>Articles</th><th>Paiement</th><th class="right">Total</th>
      </tr></thead><tbody>`;
      for (const inv of row.invoices) {
        const itemLines = (inv.items || []).map(it =>
          `<span class="item-line">${it.quantity}x ${it.name}${it.category ? ' <em>[' + it.category + ']</em>' : ''} — ${fmt(it.totalPrice)}</span>`
        ).join('');
        body += `<tr>
          <td>${inv.ticketNumber}</td>
          <td>${inv.tableNumber || '—'}</td>
          <td>${fmtTime(inv.createdAt)}</td>
          <td class="items-cell">${itemLines}</td>
          <td>${PAYMENT_LABELS[inv.paymentMethod] || inv.paymentMethod || '—'}</td>
          <td class="right bold">${fmt(inv.total)}</td>
        </tr>`;
      }
      body += `</tbody></table>`;
    } else {
      body += `<p class="empty">Aucune facture payée sur cette session.</p>`;
    }

    body += `<div class="session-total">Sous-total session : <strong>${fmt(row.totalAmount)}</strong> (${row.invoices.length} facture(s))</div>`;
    body += `</div>`;
  }

  const dateStr = new Date(detail.date || date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture Journalière</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}
    h1{font-size:18px;text-align:center;margin-bottom:4px}
    .subtitle{text-align:center;color:#555;font-size:12px;margin-bottom:16px}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
    .sum-box{border:1px solid #ddd;border-radius:4px;padding:8px;text-align:center}
    .sum-box .label{font-size:10px;color:#666;margin-bottom:4px}
    .sum-box .value{font-size:14px;font-weight:bold}
    .session{border:1px solid #ccc;border-radius:4px;margin-bottom:16px;overflow:hidden}
    .session-header{background:#f5f5f5;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:12px}
    .session-times{padding:4px 12px;font-size:11px;color:#555;background:#fafafa;border-bottom:1px solid #eee}
    .pay-row{padding:6px 12px;font-size:11px;display:flex;gap:16px;background:#fff7ed;border-bottom:1px solid #eee}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#f0f0f0;padding:5px 8px;text-align:left;border-bottom:1px solid #ddd;font-size:10px;text-transform:uppercase}
    td{padding:5px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top}
    .right{text-align:right}
    .bold{font-weight:bold}
    .items-cell{max-width:260px}
    .item-line{display:block;margin-bottom:2px}
    .item-line em{color:#888;font-style:normal}
    .badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold}
    .badge.open{background:#dcfce7;color:#166534}
    .badge.closed{background:#f3f4f6;color:#374151}
    .session-total{padding:6px 12px;text-align:right;background:#f9fafb;font-size:12px;border-top:1px solid #e5e7eb}
    .empty{padding:8px 12px;color:#888;font-size:11px;font-style:italic}
    .grand-total{margin-top:16px;border:2px solid #111;border-radius:4px;padding:12px;background:#f9fafb}
    .grand-total table{font-size:13px}
    .grand-total td{padding:4px 8px;border:none}
    @media print{body{padding:8px}.session{page-break-inside:avoid}}
  </style></head><body>
  <h1>FACTURE JOURNALIÈRE</h1>
  <div class="subtitle">${dateStr} — Généré le ${new Date().toLocaleString('fr-FR')}</div>
  <div class="summary">
    <div class="sum-box"><div class="label">Chiffre d'affaires</div><div class="value">${fmt(detail.grandTotal)}</div></div>
    <div class="sum-box"><div class="label">Factures</div><div class="value">${detail.totalInvoices}</div></div>
    <div class="sum-box"><div class="label">Sessions</div><div class="value">${detail.sessionCount}</div></div>
    <div class="sum-box"><div class="label">Espèces / Mobile</div><div class="value">${fmt(detail.grandCash)} / ${fmt(detail.grandMobile)}</div></div>
  </div>
  ${body}
  <div class="grand-total">
    <table>
      <tr><td>Espèces</td><td class="right bold">${fmt(detail.grandCash)}</td></tr>
      <tr><td>Carte bancaire</td><td class="right bold">${fmt(detail.grandCard)}</td></tr>
      <tr><td>Mobile Money</td><td class="right bold">${fmt(detail.grandMobile)}</td></tr>
      ${detail.grandGiftCard > 0 ? `<tr><td>Carte cadeau</td><td class="right bold">${fmt(detail.grandGiftCard)}</td></tr>` : ''}
      <tr style="border-top:2px solid #111;font-size:15px"><td><strong>TOTAL JOURNÉE</strong></td><td class="right bold">${fmt(detail.grandTotal)}</td></tr>
    </table>
  </div>
  </body></html>`;

  // Use a hidden iframe — never blocked by Chrome popup blocker
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, 300);
}

export default function GlobalReport() {
  const { user } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [service, setService] = useState('all');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { socket } = useSocket();

  const handlePrint = async () => {
    setPrinting(true);
    try {
      let thermalDone = false;
      try {
        const printRes = await printerAPI.printGlobalReport({ date, service });
        if (printRes.data?.data?.printed) {
          toast.success('Rapport imprimé sur l\'imprimante thermique');
          thermalDone = true;
        } else if (printRes.data?.data?.queued) {
          toast.success('Rapport envoyé à l\'agent d\'impression');
          // fall through to browser print as backup
        }
      } catch { /* no thermal printer — fall through */ }

      if (!thermalDone) {
        // Browser print — always guaranteed to work
        const params = { date };
        if (service !== 'all') params.service = service;
        const { data } = await cashRegisterAPI.dailyDetail(params);
        printDailyInvoice(data.data, date);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur impression');
      console.error('Erreur impression:', err);
    } finally {
      setPrinting(false);
    }
  };

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
              <div className="flex gap-2">
                <Button onClick={loadReport} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ClipboardList className="w-4 h-4 mr-2" />}
                  Générer
                </Button>
                <Button variant="outline" onClick={handlePrint} disabled={printing}>
                  {printing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
                  Imprimer
                </Button>
              </div>
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
