import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Check, Loader2, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '@/services/api';
import { DURATION_LABELS } from '@/data/countries';
import { formatCurrency } from '@/lib/utils';

const DEFAULT_DAYS = {
  mensuel: 30,
  trimestre: 90,
  semestriel: 180,
  annuel: 365,
  a_vie: 36500,
};

export default function SuperAdminPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    duration: 'mensuel',
    durationDays: '30',
    price: '',
    currency: 'XOF',
    description: '',
    featuresText: '',
    isPopular: false,
    isActive: true,
    order: '0',
  });

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await superAdminAPI.getPlans();
      setPlans(res.data.data || []);
    } catch {
      toast.error('Erreur chargement des plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      duration: 'mensuel',
      durationDays: '30',
      price: '',
      currency: 'XOF',
      description: '',
      featuresText: '',
      isPopular: false,
      isActive: true,
      order: String(plans.length + 1),
    });
    setDialogOpen(true);
  };

  const openEdit = (plan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      duration: plan.duration,
      durationDays: String(plan.durationDays || DEFAULT_DAYS[plan.duration] || 30),
      price: String(plan.price),
      currency: plan.currency || 'XOF',
      description: plan.description || '',
      featuresText: (plan.features || []).join('\n'),
      isPopular: Boolean(plan.isPopular),
      isActive: plan.isActive !== false,
      order: String(plan.order || 0),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || form.price === '') {
      toast.error('Nom et prix requis');
      return;
    }
    setSubmitting(true);
    const payload = {
      name: form.name,
      duration: form.duration,
      durationDays: Number(form.durationDays) || DEFAULT_DAYS[form.duration] || 30,
      price: Number(form.price),
      currency: form.currency || 'XOF',
      description: form.description,
      features: form.featuresText.split('\n').map(s => s.trim()).filter(Boolean),
      isPopular: form.isPopular,
      isActive: form.isActive,
      order: Number(form.order) || 0,
    };

    try {
      if (editing) {
        await superAdminAPI.updatePlan(editing._id, payload);
        toast.success('Plan mis à jour');
      } else {
        await superAdminAPI.createPlan(payload);
        toast.success('Plan créé');
      }
      setDialogOpen(false);
      fetchPlans();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (plan) => {
    if (!window.confirm(`Supprimer le plan "${plan.name}" ?`)) return;
    try {
      await superAdminAPI.deletePlan(plan._id);
      toast.success('Plan supprimé');
      fetchPlans();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" /> Plans & Tarifs d&apos;abonnement
          </h1>
          <p className="text-sm text-muted-foreground">
            Créez et modifiez les plans mensuels, trimestriels, semestriels, annuels et à vie visibles dans le dashboard des restaurants.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Nouveau Plan
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan._id} className={!plan.isActive ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription>{DURATION_LABELS[plan.duration] || plan.duration}</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    {plan.isPopular && <Badge>Populaire</Badge>}
                    {!plan.isActive && <Badge variant="secondary">Inactif</Badge>}
                  </div>
                </div>
                <p className="text-2xl font-bold text-primary pt-2">
                  {formatCurrency(plan.price, plan.currency || 'XOF')}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan.description && <p className="text-xs text-muted-foreground">{plan.description}</p>}
                <ul className="space-y-1 text-sm">
                  {(plan.features || []).map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                    <Edit className="w-3.5 h-3.5 mr-1.5" /> Modifier
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(plan)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le plan' : 'Nouveau plan d\'abonnement'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            <div>
              <Label>Nom du plan *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Pro Trimestriel"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Périodicité *</Label>
                <Select
                  value={form.duration}
                  onValueChange={(v) => setForm({ ...form, duration: v, durationDays: String(DEFAULT_DAYS[v] || 30) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensuel">Mensuel</SelectItem>
                    <SelectItem value="trimestre">Trimestriel</SelectItem>
                    <SelectItem value="semestriel">Semestriel</SelectItem>
                    <SelectItem value="annuel">Annuel</SelectItem>
                    <SelectItem value="a_vie">À Vie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Durée (jours)</Label>
                <Input
                  type="number"
                  value={form.durationDays}
                  onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prix *</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="15000"
                  required
                />
              </div>
              <div>
                <Label>Devise</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  placeholder="XOF"
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <Label>Avantages (1 par ligne)</Label>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.featuresText}
                onChange={(e) => setForm({ ...form, featuresText: e.target.value })}
                placeholder={'Commandes illimitées\nSupport prioritaire'}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Switch checked={form.isPopular} onCheckedChange={(v) => setForm({ ...form, isPopular: v })} />
                <Label>Mettre en avant (Populaire)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label>Actif</Label>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? 'Mettre à jour' : 'Créer le plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
