import { useState, useEffect, useCallback } from 'react';
import { statsAPI, invalidateCache, readCache } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { Loader2, TrendingUp, Calendar, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function Sales() {
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [salesData, setSalesData] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return readCache('/stats/sales', { startDate: sd, endDate: ed })?.data?.data || null;
  });
  const [productStats, setProductStats] = useState(() => readCache('/stats/products', { period: 'month' })?.data?.data || []);
  const [loading, setLoading] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return !readCache('/stats/sales', { startDate: sd, endDate: ed }) || !readCache('/stats/products', { period: 'month' });
  });

  const { socket } = useSocket();

  const loadData = useCallback(async () => {
    invalidateCache('/stats');
    if (!readCache('/stats/sales', { startDate, endDate })) setLoading(true);
    try {
      const [salesRes, productsRes] = await Promise.all([
        statsAPI.getSales({ startDate, endDate }),
        statsAPI.getProducts({ period: 'month' })
      ]);
      setSalesData(salesRes.data.data);
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
    socket.on('payment:created', loadData);
    socket.on('ticket:paid', loadData);
    return () => {
      socket.off('payment:created', loadData);
      socket.off('ticket:paid', loadData);
    };
  }, [socket, loadData]);

  if (loading) {
    return <div><TopBar title="Ventes" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>;
  }

  return (
    <div>
      <TopBar title="Section Ventes" />
      <div className="p-6 space-y-6">
        {/* Date filters */}
        <div className="flex items-center gap-4">
          <div><Label>Du</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label>Au</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Chiffre d'affaires total</p>
            <p className="text-3xl font-bold text-primary mt-1">{formatCurrency(salesData?.totalRevenue || 0)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Nombre de transactions</p>
            <p className="text-3xl font-bold mt-1">{salesData?.totalTransactions || 0}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Panier moyen</p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(salesData?.totalTransactions ? salesData.totalRevenue / salesData.totalTransactions : 0)}</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="daily">
          <TabsList>
            <TabsTrigger value="daily">Synthèse quotidienne</TabsTrigger>
            <TabsTrigger value="products">Palmarès produits</TabsTrigger>
            <TabsTrigger value="journal">Journal des ventes</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-4 mt-4">
            {/* Daily Revenue Chart */}
            <Card>
              <CardHeader><CardTitle className="text-base">Évolution du chiffre d'affaires</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={salesData?.summary || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} />
                    <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={(d) => formatDate(d)} />
                    <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} name="CA" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Daily Summary Table */}
            <Card>
              <CardHeader><CardTitle className="text-base">Détail par jour</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {salesData?.summary?.map(day => (
                    <div key={day.date} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{formatDate(day.date)}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-sm text-muted-foreground">{day.count} transactions</span>
                        <span className="font-bold text-primary">{formatCurrency(day.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="w-5 h-5" /> Palmarès des produits</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={productStats.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} name="CA" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  {productStats.map((product, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="font-medium">{product.name}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span>{product.quantity} vendus</span>
                        <span>{product.orders} commandes</span>
                        <span className="font-bold text-primary">{formatCurrency(product.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="journal" className="space-y-3 mt-4">
            {salesData?.payments?.map(payment => (
              <Card key={payment._id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{payment.paymentNumber}</p>
                    <p className="text-sm text-muted-foreground">{payment.agent?.firstName} {payment.agent?.lastName} | {formatDateTime(payment.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{payment.method === 'cash' ? 'Espèces' : payment.method === 'card' ? 'Carte' : 'Mobile Money'}</Badge>
                    <span className="font-bold text-primary">{formatCurrency(payment.amount)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
