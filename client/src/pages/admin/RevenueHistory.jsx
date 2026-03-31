import { useState, useEffect, useCallback, useRef } from 'react';
import { statsAPI, readCache } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Loader2, Calendar, TrendingUp, ArrowLeft, Download, Printer,
  ChevronRight, Banknote, CreditCard, Smartphone, Eye
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export default function RevenueHistory() {
  const { socket } = useSocket();
  const [view, setView] = useState('months');
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthlyData, setMonthlyData] = useState(() => readCache('/stats/revenue-history', { year: new Date().getFullYear() })?.data?.data || []);
  const [dailyData, setDailyData] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(() => readCache('/stats/revenue-history', { year: new Date().getFullYear() })?.data?.totalRevenue || 0);
  const [totalTransactions, setTotalTransactions] = useState(() => readCache('/stats/revenue-history', { year: new Date().getFullYear() })?.data?.totalTransactions || 0);
  const [loading, setLoading] = useState(() => !readCache('/stats/revenue-history', { year: new Date().getFullYear() }));
  const [dailyReport, setDailyReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef(null);

  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  const loadMonthly = useCallback(async () => {
    if (!readCache('/stats/revenue-history', { year })) setLoading(true);
    try {
      const { data } = await statsAPI.getRevenueHistory({ year });
      setMonthlyData(data.data || []);
      setTotalRevenue(data.totalRevenue || 0);
      setTotalTransactions(data.totalTransactions || 0);
    } catch (e) { toast.error(e.response?.data?.message || 'Erreur chargement'); }
    finally { setLoading(false); }
  }, [year]);

  const loadDaily = useCallback(async (m) => {
    if (!readCache('/stats/revenue-history', { year, month: m })) setLoading(true);
    try {
      const { data } = await statsAPI.getRevenueHistory({ year, month: m });
      setDailyData(data.data || []);
      setTotalRevenue(data.totalRevenue || 0);
      setTotalTransactions(data.totalTransactions || 0);
    } catch (e) { toast.error(e.response?.data?.message || 'Erreur chargement'); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => {
    if (view === 'months') loadMonthly();
  }, [view, loadMonthly]);

  // Auto-refresh when a payment is confirmed
  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      if (view === 'months') loadMonthly();
      else if (view === 'days' && selectedMonth) loadDaily(selectedMonth);
    };
    socket.on('payment:created', refresh);
    return () => socket.off('payment:created', refresh);
  }, [socket, view, selectedMonth, loadMonthly, loadDaily]);

  const openMonth = (monthNum) => {
    setSelectedMonth(monthNum);
    setView('days');
    loadDaily(monthNum);
  };

  const backToMonths = () => {
    setView('months');
    setSelectedMonth(null);
    setDailyData([]);
  };

  const loadDailyReport = async (dateStr) => {
    setReportLoading(true);
    setReportOpen(true);
    try {
      const { data } = await statsAPI.getDailyReport(dateStr);
      setDailyReport(data.data);
    } catch (e) { toast.error(e.response?.data?.message || 'Erreur chargement rapport'); }
    finally { setReportLoading(false); }
  };

  const methodLabel = (m) => ({ cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money', gift_card: 'Carte cadeau' }[m] || m);

  const generatePDF = () => {
    if (!dailyReport) return;
    const r = dailyReport;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const payRows = (r.payments || []).map(p =>
      `<tr><td>${new Date(p.time).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td>${p.paymentNumber}</td><td>${p.agent}</td><td>${methodLabel(p.method)}</td><td style="text-align:right;font-weight:600">${formatCurrency(p.amount)}</td></tr>`
    ).join('');
    const prodRows = (r.products || []).map(p =>
      `<tr><td>${p.name}</td><td style="text-align:center">${p.quantity}</td><td style="text-align:right">${formatCurrency(p.revenue)}</td></tr>`
    ).join('');
    const agentRows = (r.agents || []).map(a =>
      `<tr><td>${a.name}</td><td style="text-align:center">${a.transactions}</td><td style="text-align:right">${formatCurrency(a.revenue)}</td></tr>`
    ).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>Rapport du ${formatDate(r.date)}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',system-ui,sans-serif;padding:30px;color:#1a1a1a;max-width:800px;margin:0 auto}
      h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;margin:20px 0 10px;padding-bottom:6px;border-bottom:2px solid #3B82F6}
      .subtitle{color:#666;font-size:13px;margin-bottom:20px}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
      .kpi{background:#f8f9fa;border-radius:8px;padding:14px;text-align:center}
      .kpi .label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px}
      .kpi .value{font-size:20px;font-weight:700;margin-top:4px}
      .kpi .value.green{color:#16a34a}.kpi .value.blue{color:#2563eb}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px}
      th{background:#f1f5f9;padding:8px 10px;text-align:left;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.3px}
      td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
      tr:hover td{background:#f8fafc}
      .footer{margin-top:30px;text-align:center;font-size:11px;color:#999;border-top:1px solid #e5e7eb;padding-top:10px}
      @media print{body{padding:15px}h1{font-size:18px}.grid{gap:8px}.kpi{padding:10px}}
    </style></head><body>
    <h1>Rapport Journalier des Recettes</h1>
    <p class="subtitle">Date : ${formatDate(r.date)} — Généré le ${new Date().toLocaleString('fr-FR')}</p>
    <div class="grid">
      <div class="kpi"><div class="label">Chiffre d'affaires</div><div class="value green">${formatCurrency(r.totalRevenue)}</div></div>
      <div class="kpi"><div class="label">Transactions</div><div class="value blue">${r.totalTransactions}</div></div>
      <div class="kpi"><div class="label">Commandes</div><div class="value blue">${r.totalOrders}</div></div>
      <div class="kpi"><div class="label">Tickets</div><div class="value blue">${r.totalTickets}</div></div>
    </div>
    <h2>Répartition par mode de paiement</h2>
    <div class="grid">
      <div class="kpi"><div class="label">Espèces</div><div class="value">${formatCurrency(r.byMethod?.cash || 0)}</div></div>
      <div class="kpi"><div class="label">Carte</div><div class="value">${formatCurrency(r.byMethod?.card || 0)}</div></div>
      <div class="kpi"><div class="label">Mobile Money</div><div class="value">${formatCurrency(r.byMethod?.mobile_money || 0)}</div></div>
      <div class="kpi"><div class="label">Carte cadeau</div><div class="value">${formatCurrency(r.byMethod?.gift_card || 0)}</div></div>
    </div>
    ${agentRows ? `<h2>Performance par agent</h2><table><thead><tr><th>Agent</th><th style="text-align:center">Transactions</th><th style="text-align:right">CA</th></tr></thead><tbody>${agentRows}</tbody></table>` : ''}
    ${prodRows ? `<h2>Produits vendus</h2><table><thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">CA</th></tr></thead><tbody>${prodRows}</tbody></table>` : ''}
    ${payRows ? `<h2>Détail des transactions</h2><table><thead><tr><th>Heure</th><th>N° Paiement</th><th>Agent</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead><tbody>${payRows}</tbody></table>` : ''}
    <div class="footer">Restaurant Manager — Rapport généré automatiquement</div>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div>
      <TopBar title="Historique Chiffre d'Affaires" />
      <div className="p-3 sm:p-6 space-y-4">
        {/* Header controls */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            {view === 'days' && (
              <Button variant="outline" size="sm" onClick={backToMonths}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Retour
              </Button>
            )}
            <Select value={String(year)} onValueChange={v => { setYear(parseInt(v)); if (view === 'days' && selectedMonth) loadDaily(selectedMonth); }}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-sm font-medium">Total : <strong className="text-green-600">{formatCurrency(totalRevenue)}</strong></span>
            <span className="text-xs text-muted-foreground hidden sm:inline">({totalTransactions} trans.)</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <Tabs value={view} onValueChange={v => { if (v === 'months') backToMonths(); }}>
            <TabsList>
              <TabsTrigger value="months">Vue par mois</TabsTrigger>
              {selectedMonth && <TabsTrigger value="days">{MONTHS_FR[selectedMonth - 1]} {year}</TabsTrigger>}
            </TabsList>

            {/* MONTHLY VIEW */}
            <TabsContent value="months" className="space-y-4 mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Chiffre d'affaires mensuel — {year}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="monthName" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={v => formatCurrency(v)} />
                      <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} name="CA" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid gap-2 sm:gap-3">
                {monthlyData.map((m, i) => (
                  <Card key={m.month} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openMonth(i + 1)}>
                    <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold capitalize text-sm sm:text-base truncate">{m.monthName} {year}</p>
                          <p className="text-xs text-muted-foreground">{m.transactions} trans.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <div className="text-right">
                          <p className="font-bold text-primary text-sm sm:text-base">{formatCurrency(m.revenue)}</p>
                          <div className="hidden sm:flex gap-2 text-[10px] text-muted-foreground">
                            {m.cash > 0 && <span>Esp: {formatCurrency(m.cash)}</span>}
                            {m.card > 0 && <span>CB: {formatCurrency(m.card)}</span>}
                            {m.mobile_money > 0 && <span>MM: {formatCurrency(m.mobile_money)}</span>}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* DAILY VIEW */}
            <TabsContent value="days" className="space-y-4 mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">CA journalier — {selectedMonth && MONTHS_FR[selectedMonth - 1]} {year}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dailyData.filter(d => d.revenue > 0)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={d => d.split('-')[2]} tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={v => formatCurrency(v)} labelFormatter={d => formatDate(d)} />
                      <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="CA" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid gap-2">
                {dailyData.map(day => {
                  const dayNum = parseInt(day.date.split('-')[2]);
                  const dayName = new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'long' });
                  const isToday = day.date === new Date().toISOString().split('T')[0];
                  return (
                    <Card key={day.date} className={`transition-shadow ${day.revenue > 0 ? 'hover:shadow-md' : 'opacity-60'}`}>
                      <CardContent className="p-2.5 sm:p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${day.revenue > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                            {dayNum}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-xs sm:text-sm capitalize truncate">
                              {dayName}
                              {isToday && <Badge variant="outline" className="ml-1 text-[10px] py-0">Auj.</Badge>}
                            </p>
                            <p className="text-xs text-muted-foreground">{day.transactions} trans.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                          <div className="text-right">
                            <p className={`font-bold text-sm ${day.revenue > 0 ? 'text-green-600' : 'text-gray-400'}`}>{formatCurrency(day.revenue)}</p>
                            <div className="hidden sm:flex gap-2 text-[10px] text-muted-foreground">
                              {day.cash > 0 && <span className="flex items-center gap-0.5"><Banknote className="w-3 h-3" />{formatCurrency(day.cash)}</span>}
                              {day.card > 0 && <span className="flex items-center gap-0.5"><CreditCard className="w-3 h-3" />{formatCurrency(day.card)}</span>}
                              {day.mobile_money > 0 && <span className="flex items-center gap-0.5"><Smartphone className="w-3 h-3" />{formatCurrency(day.mobile_money)}</span>}
                            </div>
                          </div>
                          {day.revenue > 0 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => loadDailyReport(day.date)} title="Voir le rapport">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Daily Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Rapport du {dailyReport && formatDate(dailyReport.date)}
            </DialogTitle>
          </DialogHeader>
          {reportLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : dailyReport && (
            <div className="space-y-4" ref={reportRef}>
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Chiffre d'affaires</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(dailyReport.totalRevenue)}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Transactions</p>
                  <p className="text-lg font-bold text-blue-600">{dailyReport.totalTransactions}</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Commandes</p>
                  <p className="text-lg font-bold text-purple-600">{dailyReport.totalOrders}</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Tickets</p>
                  <p className="text-lg font-bold text-orange-600">{dailyReport.totalTickets}</p>
                </div>
              </div>

              {/* Payment methods */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Par mode de paiement</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <Banknote className="w-4 h-4 text-green-600" />
                    <div><p className="text-[10px] text-muted-foreground">Espèces</p><p className="font-bold text-sm">{formatCurrency(dailyReport.byMethod?.cash || 0)}</p></div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <div><p className="text-[10px] text-muted-foreground">Carte</p><p className="font-bold text-sm">{formatCurrency(dailyReport.byMethod?.card || 0)}</p></div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <Smartphone className="w-4 h-4 text-orange-600" />
                    <div><p className="text-[10px] text-muted-foreground">Mobile Money</p><p className="font-bold text-sm">{formatCurrency(dailyReport.byMethod?.mobile_money || 0)}</p></div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    <div><p className="text-[10px] text-muted-foreground">Carte cadeau</p><p className="font-bold text-sm">{formatCurrency(dailyReport.byMethod?.gift_card || 0)}</p></div>
                  </div>
                </div>
              </div>

              {/* Agents */}
              {dailyReport.agents?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Par agent</h3>
                  <div className="space-y-1">
                    {dailyReport.agents.map((a, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                        <span className="font-medium">{a.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground">{a.transactions} trans.</span>
                          <span className="font-bold text-primary">{formatCurrency(a.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products */}
              {dailyReport.products?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Produits vendus</h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {dailyReport.products.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                        <span>{p.quantity}x {p.name}</span>
                        <span className="font-bold">{formatCurrency(p.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transactions */}
              {dailyReport.payments?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Détail des transactions</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {dailyReport.payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{new Date(p.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="font-medium">{p.paymentNumber}</span>
                          <span className="text-muted-foreground">{p.agent}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] py-0">{methodLabel(p.method)}</Badge>
                          <span className="font-bold">{formatCurrency(p.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <Button className="flex-1" onClick={generatePDF}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimer / PDF
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => {
                  if (!dailyReport) return;
                  const r = dailyReport;
                  const rows = [['Heure','N° Paiement','Agent','Mode','Montant']];
                  for (const p of r.payments || []) {
                    rows.push([new Date(p.time).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}), p.paymentNumber, p.agent, methodLabel(p.method), p.amount]);
                  }
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `rapport-${r.date}.csv`; a.click();
                  toast.success('CSV téléchargé');
                }}>
                  <Download className="w-4 h-4 mr-2" /> Exporter CSV
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
