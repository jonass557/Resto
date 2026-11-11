import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Crown, Ban, CheckCircle2, Trash2, Loader2,
  Building2, Users, ShoppingBag, ShieldOff, ShieldCheck, CalendarPlus
} from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '@/services/api';
import { COUNTRIES } from '@/data/countries';
import { formatDate } from '@/lib/utils';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'trial', label: 'Essai gratuit' },
  { value: 'active', label: 'Actif' },
  { value: 'lifetime', label: 'À vie' },
  { value: 'expired', label: 'Expiré' },
  { value: 'deactivated', label: 'Désactivé' },
];

const STATUS_UI = {
  lifetime: { label: 'À Vie', cls: 'bg-emerald-100 text-emerald-800' },
  active: { label: 'Actif', cls: 'bg-green-100 text-green-800' },
  trial: { label: 'Essai gratuit', cls: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Expiré', cls: 'bg-red-100 text-red-800' },
  deactivated: { label: 'Désactivé', cls: 'bg-red-100 text-red-800' },
};

export default function SuperAdminRestaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [manageTarget, setManageTarget] = useState(null);
  const [customDays, setCustomDays] = useState('30');
  const [submitting, setSubmitting] = useState(false);

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const res = await superAdminAPI.getRestaurants({ search, status: statusFilter });
      setRestaurants(res.data.data || []);
    } catch {
      toast.error('Erreur chargement des restaurants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, [statusFilter]);

  const handleSubscriptionAction = async (restaurantId, action, extra = {}) => {
    setSubmitting(true);
    try {
      const res = await superAdminAPI.updateRestaurantSubscription(restaurantId, { action, ...extra });
      toast.success(res.data?.message || 'Abonnement mis à jour');
      setManageTarget(null);
      fetchRestaurants();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAccount = async (restaurant) => {
    try {
      const res = await superAdminAPI.updateRestaurantStatus(restaurant._id, { isActive: !restaurant.isActive });
      toast.success(res.data?.message || 'Statut modifié');
      fetchRestaurants();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  const handleDelete = async (restaurant) => {
    if (!window.confirm(`Supprimer le restaurant "${restaurant.name}" ?`)) return;
    try {
      await superAdminAPI.deleteRestaurant(restaurant._id);
      toast.success('Restaurant supprimé');
      fetchRestaurants();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  const getFlag = (code) => COUNTRIES.find(c => c.code === code)?.flag || '🌍';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> Restaurants Inscrits
          </h1>
          <p className="text-sm text-muted-foreground">
            Activez un abonnement (À vie, Annuel, Semestriel, Trimestriel, Mensuel) ou désactivez les licences en un clic.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, téléphone ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchRestaurants()}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map(f => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchRestaurants}>Actualiser</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : restaurants.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Aucun restaurant trouvé.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {restaurants.map((r) => {
            const ui = STATUS_UI[r.effectiveStatus] || STATUS_UI.trial;
            return (
              <Card key={r._id}>
                <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{getFlag(r.country)}</span>
                      <p className="font-bold text-base">{r.name}</p>
                      <Badge className={ui.cls}>{ui.label}</Badge>
                      {!r.isActive && <Badge variant="destructive">Compte suspendu</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Tél: <span className="font-medium text-foreground">{r.dialCode} {r.phone}</span>
                      {r.email && <> • Email: {r.email}</>}
                      {' '}• Inscrit le {formatDate(r.createdAt)}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {r.staffCount || 0} membre(s)</span>
                      <span className="flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5" /> {r.orderCount || 0} commande(s)</span>
                      <span>Plan : <strong>{r.subscription?.planName || 'Essai 30j'}</strong></span>
                      {r.effectiveStatus !== 'lifetime' && r.daysRemaining > 0 && (
                        <span>({r.daysRemaining} jour(s) restant(s))</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => setManageTarget(r)}>
                      <Crown className="w-4 h-4 mr-1.5" /> Gérer Abonnement
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleAccount(r)}
                      title={r.isActive ? 'Suspendre le compte' : 'Réactiver le compte'}
                    >
                      {r.isActive ? <ShieldOff className="w-4 h-4 text-amber-600" /> : <ShieldCheck className="w-4 h-4 text-green-600" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(r)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Manage Subscription Dialog */}
      <Dialog open={!!manageTarget} onOpenChange={(o) => !o && setManageTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gérer l&apos;abonnement — {manageTarget?.name}</DialogTitle>
            <DialogDescription>
              Statut actuel : {manageTarget?.subscription?.planName || manageTarget?.effectiveStatus}
            </DialogDescription>
          </DialogHeader>

          {manageTarget && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Button
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white justify-start"
                  onClick={() => handleSubscriptionAction(manageTarget._id, 'activate_lifetime')}
                >
                  <Crown className="w-4 h-4 mr-2" /> Activer À Vie (Illimité)
                </Button>
                <Button
                  disabled={submitting}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSubscriptionAction(manageTarget._id, 'activate_annuel')}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" /> Activer Annuel (1 an)
                </Button>
                <Button
                  disabled={submitting}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSubscriptionAction(manageTarget._id, 'activate_semestriel')}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2 text-blue-600" /> Activer Semestriel (6 mois)
                </Button>
                <Button
                  disabled={submitting}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSubscriptionAction(manageTarget._id, 'activate_trimestre')}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2 text-indigo-600" /> Activer Trimestriel (3 mois)
                </Button>
                <Button
                  disabled={submitting}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSubscriptionAction(manageTarget._id, 'activate_mensuel')}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2 text-purple-600" /> Activer Mensuel (1 mois)
                </Button>
                <Button
                  disabled={submitting}
                  variant="destructive"
                  className="justify-start"
                  onClick={() => handleSubscriptionAction(manageTarget._id, 'deactivate')}
                >
                  <Ban className="w-4 h-4 mr-2" /> Désactiver l&apos;abonnement
                </Button>
              </div>

              <div className="border-t pt-3 flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Prolonger l&apos;essai gratuit (jours)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => handleSubscriptionAction(manageTarget._id, 'extend_trial', { customDays })}
                >
                  <CalendarPlus className="w-4 h-4 mr-1.5" /> Prolonger l&apos;essai
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageTarget(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
