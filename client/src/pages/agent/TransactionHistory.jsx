import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { statsAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Loader2, DollarSign, CreditCard, Smartphone, Banknote, Gift, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const METHOD_LABELS = {
  cash: { label: 'Espèces', icon: Banknote, color: 'text-green-600' },
  card: { label: 'Carte', icon: CreditCard, color: 'text-blue-600' },
  mobile_money: { label: 'Mobile Money', icon: Smartphone, color: 'text-orange-600' },
  mixed: { label: 'Mixte', icon: DollarSign, color: 'text-purple-600' },
  gift_card: { label: 'Carte cadeau', icon: Gift, color: 'text-pink-600' },
};

export default function TransactionHistory() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const loadHistory = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await statsAPI.getAgentHistory(user._id, {
        startDate, endDate, page, limit: 30
      });
      setPayments(data.data);
      setSummary(data.summary);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLoading(false);
    }
  }, [user._id, startDate, endDate]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const quickFilter = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div>
      <TopBar title="Historique des transactions" />
      <div className="p-6 space-y-6">
        {/* Date filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Du</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Au</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => quickFilter(0)}>Aujourd'hui</Button>
                <Button variant="outline" size="sm" onClick={() => quickFilter(7)}>7 jours</Button>
                <Button variant="outline" size="sm" onClick={() => quickFilter(30)}>30 jours</Button>
                <Button variant="outline" size="sm" onClick={() => quickFilter(90)}>3 mois</Button>
                <Button variant="outline" size="sm" onClick={() => quickFilter(180)}>6 mois</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">Total revenus</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(summary.totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold">{summary.totalTransactions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">Espèces</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(summary.byMethod?.cash || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">Mobile Money</p>
                <p className="text-xl font-bold text-orange-600">{formatCurrency(summary.byMethod?.mobile_money || 0)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Transaction list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Transactions ({pagination.total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : payments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Aucune transaction pour cette période</p>
            ) : (
              <div className="space-y-2">
                {payments.map((payment) => {
                  const methodInfo = METHOD_LABELS[payment.method] || METHOD_LABELS.cash;
                  const Icon = methodInfo.icon;
                  return (
                    <div key={payment._id} className="flex items-center justify-between p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
                          <Icon className={`w-5 h-5 ${methodInfo.color}`} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {payment.ticket?.ticketNumber || payment.paymentNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {payment.ticket?.table?.number ? `Table ${payment.ticket.table.number} · ` : ''}
                            {formatDateTime(payment.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">{methodInfo.label}</Badge>
                        {payment.mobileMoneyProvider && payment.mobileMoneyProvider !== 'none' && (
                          <Badge variant="secondary" className="text-xs">
                            {payment.mobileMoneyProvider === 'orange_money' ? 'Orange' : 'MTN'}
                          </Badge>
                        )}
                        <p className="font-bold text-primary">{formatCurrency(payment.amount)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {pagination.page} / {pagination.pages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => loadHistory(pagination.page - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={pagination.page >= pagination.pages} onClick={() => loadHistory(pagination.page + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
