import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2, Crown, Clock, AlertTriangle, Wallet, Users,
  ArrowRight, Loader2, CheckCircle2, CreditCard, KeyRound
} from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '@/services/api';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function SuperAdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await superAdminAPI.getDashboard();
        setData(res.data.data);
      } catch {
        toast.error('Erreur de chargement du tableau de bord Super Admin');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const recentRestaurants = data?.recentRestaurants || [];
  const recentTransactions = data?.recentTransactions || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Super Administrateur</h1>
          <p className="text-sm text-muted-foreground">
            Gestion globale des restaurants, abonnements, plans tarifaires et paiements iKeepay.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link to="/super-admin/settings"><KeyRound className="w-4 h-4 mr-1.5" /> Clés API iKeepay</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/super-admin/restaurants"><Building2 className="w-4 h-4 mr-1.5" /> Gérer les restaurants</Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Restaurants inscrits</p>
              <p className="text-3xl font-bold mt-1">{stats.totalRestaurants || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.totalUsers || 0} utilisateurs total</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Abonnements Actifs</p>
              <p className="text-3xl font-bold mt-1 text-emerald-600">{stats.activeSubscriptions || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">dont {stats.lifetimeCount || 0} à vie</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Crown className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Essai Gratuit / Expirés</p>
              <p className="text-3xl font-bold mt-1 text-blue-600">{stats.trialCount || 0}</p>
              <p className="text-xs text-red-600 mt-1">
                {(stats.expiredCount || 0) + (stats.deactivatedCount || 0)} expiré(s) / désactivé(s)
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Solde Disponible</p>
              <p className="text-2xl font-bold mt-1 text-primary">
                {formatCurrency(stats.availableBalance || 0, 'XOF')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Revenus : {formatCurrency(stats.totalRevenue || 0, 'XOF')}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Derniers restaurants inscrits</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/super-admin/restaurants">Voir tout <ArrowRight className="w-4 h-4 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentRestaurants.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucun restaurant inscrit pour l&apos;instant</p>
            ) : recentRestaurants.map((r) => (
              <div key={r._id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.dialCode} {r.phone} {r.email ? `• ${r.email}` : ''} • {formatDate(r.createdAt)}
                  </p>
                </div>
                <Badge variant={r.subscription?.status === 'deactivated' ? 'destructive' : 'secondary'}>
                  {r.subscription?.planName || r.subscription?.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Dernières transactions iKeepay</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/super-admin/payments">Paiements & Retraits <ArrowRight className="w-4 h-4 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune transaction pour l&apos;instant</p>
            ) : recentTransactions.map((tx) => (
              <div key={tx._id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                <div>
                  <p className="font-semibold">
                    {tx.type === 'payout' ? 'Retrait' : (tx.restaurant?.name || 'Restaurant')} — {formatCurrency(tx.amount, tx.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tx.operator} • {tx.externalReference} • {formatDate(tx.createdAt)}
                  </p>
                </div>
                <Badge variant={tx.status === 'completed' ? 'default' : tx.status === 'failed' ? 'destructive' : 'secondary'}>
                  {tx.status === 'completed' ? 'Validé' : tx.status === 'failed' ? 'Échoué' : 'En attente'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
