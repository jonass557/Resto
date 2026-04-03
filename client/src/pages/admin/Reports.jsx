import { useState, useEffect, useCallback } from 'react';
import { statsAPI, accountingAPI, invalidateCache, readCache } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2, Download, FileText, BarChart3, PieChart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart as RePieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316', '#06B6D4', '#84CC16'];

export default function Reports() {
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [salesData, setSalesData] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return readCache('/stats/sales', { startDate: sd, endDate: ed })?.data?.data || null;
  });
  const [balance, setBalance] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return readCache('/accounting/balance', { startDate: sd, endDate: ed })?.data?.data || null;
  });
  const [productStats, setProductStats] = useState(() => readCache('/stats/products', { period: 'month' })?.data?.data || []);
  const [loading, setLoading] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return !readCache('/stats/sales', { startDate: sd, endDate: ed }) || !readCache('/accounting/balance', { startDate: sd, endDate: ed });
  });

  const { socket } = useSocket();

  const loadData = useCallback(async () => {
    if (!readCache('/stats/sales', { startDate, endDate })) setLoading(true);
    try {
      const [salesRes, balanceRes, productsRes] = await Promise.all([
        statsAPI.getSales({ startDate, endDate }),
        accountingAPI.getBalance({ startDate, endDate }),
        statsAPI.getProducts({ period: 'month' })
      ]);
      setSalesData(salesRes.data.data);
      setBalance(balanceRes.data.data);
      setProductStats(productsRes.data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const reload = () => { invalidateCache('/stats'); invalidateCache('/accounting'); loadData(); };
    socket.on('payment:created', reload);
    socket.on('ticket:paid', reload);
    return () => {
      socket.off('payment:created', reload);
      socket.off('ticket:paid', reload);
    };
  }, [socket, loadData]);

  const exportCSV = (data, filename) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
  };

  if (loading) {
    return <div><TopBar title="Rapports" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>;
  }

  const expensePieData = balance?.expensesByCategory
    ? Object.entries(balance.expensesByCategory).map(([key, value]) => ({ name: key, value }))
    : [];

  return (
    <div>
      <TopBar title="Rapports & Analyses" />
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div><Label>Du</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label>Au</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Recettes</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(balance?.totalRevenue || 0)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Dépenses</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(balance?.totalExpenses || 0)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Remboursements</p>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(balance?.totalRefunds || 0)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Résultat net</p>
            <p className={`text-xl font-bold ${(balance?.netIncome || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(balance?.netIncome || 0)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-xl font-bold">{salesData?.totalTransactions || 0}</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="revenue">
          <TabsList>
            <TabsTrigger value="revenue">Revenus</TabsTrigger>
            <TabsTrigger value="products">Produits</TabsTrigger>
            <TabsTrigger value="expenses">Dépenses</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Évolution des revenus</CardTitle>
                <Button variant="outline" size="sm" onClick={() => exportCSV(salesData?.summary?.map(d => ({ date: d.date, transactions: d.count, revenue: d.revenue })), 'rapport-revenus')}>
                  <Download className="w-4 h-4 mr-2" /> Exporter CSV
                </Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesData?.summary || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={d => formatDate(d)} />
                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => formatCurrency(v)} labelFormatter={d => formatDate(d)} />
                    <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} name="CA" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Performance des produits</CardTitle>
                <Button variant="outline" size="sm" onClick={() => exportCSV(productStats.map(p => ({ nom: p.name, quantite: p.quantity, commandes: p.orders, ca: p.revenue })), 'rapport-produits')}>
                  <Download className="w-4 h-4 mr-2" /> Exporter CSV
                </Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={productStats.slice(0, 15)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="CA" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses" className="space-y-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Répartition des dépenses</CardTitle></CardHeader>
              <CardContent>
                {expensePieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RePieChart>
                      <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={3} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {expensePieData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => formatCurrency(v)} />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Aucune dépense</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
