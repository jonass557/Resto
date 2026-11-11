import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyRound, Save, Copy, Check, Loader2, Shield, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '@/services/api';
import { COUNTRIES, IKEEPAY_OPERATORS } from '@/data/countries';

export default function SuperAdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    platformName: 'Restaurant Manager',
    trialDays: '30',
    ikeepayApiKey: '',
    ikeepayWebhookSecret: '',
    ikeepayBaseUrl: 'https://api.ikeepay.com',
    defaultCurrency: 'XOF',
    payoutSettings: {
      operator: 'ORANGE',
      country: 'CI',
      phoneNumber: '',
      accountName: '',
    },
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await superAdminAPI.getSettings();
        const s = res.data.data;
        if (s) {
          setForm({
            platformName: s.platformName || 'Restaurant Manager',
            trialDays: String(s.trialDays ?? 30),
            ikeepayApiKey: s.ikeepayApiKey || '',
            ikeepayWebhookSecret: s.ikeepayWebhookSecret || '',
            ikeepayBaseUrl: s.ikeepayBaseUrl || 'https://api.ikeepay.com',
            defaultCurrency: s.defaultCurrency || 'XOF',
            payoutSettings: {
              operator: s.payoutSettings?.operator || 'ORANGE',
              country: s.payoutSettings?.country || 'CI',
              phoneNumber: s.payoutSettings?.phoneNumber || '',
              accountName: s.payoutSettings?.accountName || '',
            },
          });
        }
      } catch {
        toast.error('Erreur chargement des paramètres plateforme');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const apiRoot = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/api\/?$/, '');
  const webhookUrl = `${apiRoot}/api/subscription/webhook/ikeepay`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL Webhook copiée !');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await superAdminAPI.updateSettings({
        ...form,
        trialDays: Number(form.trialDays) || 30,
      });
      toast.success('Paramètres et clés iKeepay enregistrés !');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-primary" /> Configuration Plateforme & Clés iKeepay
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez vos clés API iKeepay pour recevoir les abonnements des restaurants et effectuer vos retraits.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Passerelle de Paiement iKeepay (H2H)
            </CardTitle>
            <CardDescription>
              Clés utilisées pour les encaissements (Payin), retraits (Payout) et vérification des webhooks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Endpoint API iKeepay</Label>
              <Input
                value={form.ikeepayBaseUrl}
                onChange={(e) => setForm({ ...form, ikeepayBaseUrl: e.target.value })}
                placeholder="https://api.ikeepay.com"
              />
            </div>

            <div>
              <Label>Clé secrète API (`x-api-key`) *</Label>
              <Input
                type="password"
                value={form.ikeepayApiKey}
                onChange={(e) => setForm({ ...form, ikeepayApiKey: e.target.value })}
                placeholder="Insérez votre SECRET_KEY iKeepay..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Envoyée automatiquement dans l&apos;en-tête <code>x-api-key</code> vers iKeepay.
              </p>
            </div>

            <div>
              <Label>Secret Webhook (`X-Ikeepay-Signature`)</Label>
              <Input
                type="password"
                value={form.ikeepayWebhookSecret}
                onChange={(e) => setForm({ ...form, ikeepayWebhookSecret: e.target.value })}
                placeholder="Laissez vide pour utiliser la même clé que x-api-key"
              />
            </div>

            <div>
              <Label>URL Webhook à configurer sur iKeepay</Label>
              <div className="flex gap-2 mt-1">
                <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted" />
                <Button type="button" variant="outline" onClick={copyWebhook}>
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" /> Compte de Retrait par Défaut & Essai Gratuit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Nom de la plateforme</Label>
                <Input
                  value={form.platformName}
                  onChange={(e) => setForm({ ...form, platformName: e.target.value })}
                />
              </div>
              <div>
                <Label>Durée essai gratuit (jours)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.trialDays}
                  onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Pays de retrait par défaut</Label>
                <Select
                  value={form.payoutSettings.country}
                  onValueChange={(v) => setForm({ ...form, payoutSettings: { ...form.payoutSettings, country: v } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.flag} {c.name} ({c.dialCode})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Opérateur de retrait par défaut</Label>
                <Select
                  value={form.payoutSettings.operator}
                  onValueChange={(v) => setForm({ ...form, payoutSettings: { ...form.payoutSettings, operator: v } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IKEEPAY_OPERATORS.map(op => (
                      <SelectItem key={op.code} value={op.code}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Numéro de téléphone retrait (sans indicatif)</Label>
                <Input
                  value={form.payoutSettings.phoneNumber}
                  onChange={(e) => setForm({ ...form, payoutSettings: { ...form.payoutSettings, phoneNumber: e.target.value } })}
                  placeholder="0700000000"
                />
              </div>
              <div>
                <Label>Devise par défaut</Label>
                <Input
                  value={form.defaultCurrency}
                  onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value.toUpperCase() })}
                  placeholder="XOF"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Enregistrer la configuration
        </Button>
      </form>
    </div>
  );
}
