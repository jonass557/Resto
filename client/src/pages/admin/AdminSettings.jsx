import { useState, useEffect } from 'react';
import { settingsAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Store, Printer, Smartphone, Globe, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await settingsAPI.get();
      setSettings(data.data);
    } catch (error) {
      toast.error('Erreur chargement paramètres');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await settingsAPI.update(settings);
      toast.success('Paramètres enregistrés');
    } catch (error) {
      toast.error('Erreur sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <div><TopBar title="Paramètres" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>;
  }

  return (
    <div>
      <TopBar title="Paramètres globaux" />
      <div className="p-6 space-y-6 max-w-3xl">
        {/* Restaurant Info */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Store className="w-5 h-5" /> Restaurant</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Nom du restaurant</Label><Input value={settings.restaurantName} onChange={e => setSettings({...settings, restaurantName: e.target.value})} /></div>
            <div><Label>Adresse</Label><Input value={settings.address} onChange={e => setSettings({...settings, address: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Téléphone</Label><Input value={settings.phone} onChange={e => setSettings({...settings, phone: e.target.value})} /></div>
              <div><Label>Email</Label><Input value={settings.email} onChange={e => setSettings({...settings, email: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Devise</Label><Input value={settings.currency} onChange={e => setSettings({...settings, currency: e.target.value})} /></div>
              <div><Label>Symbole devise</Label><Input value={settings.currencySymbol} onChange={e => setSettings({...settings, currencySymbol: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Taux de taxe par défaut (%)</Label><Input type="number" value={settings.taxRate} onChange={e => setSettings({...settings, taxRate: parseFloat(e.target.value) || 0})} /></div>
              <div><Label>Libellé taxe</Label><Input value={settings.taxLabel} onChange={e => setSettings({...settings, taxLabel: e.target.value})} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Locale */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" /> Localisation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Langue</Label>
              <Select value={settings.language} onValueChange={v => setSettings({...settings, language: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Fuseau horaire</Label><Input value={settings.timezone} onChange={e => setSettings({...settings, timezone: e.target.value})} /></div>
          </CardContent>
        </Card>

        {/* Printer */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> Impression</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Type d'imprimante</Label>
              <Select value={settings.printerConfig?.type || 'none'} onValueChange={v => setSettings({...settings, printerConfig: { ...settings.printerConfig, type: v }})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="usb">USB</SelectItem>
                  <SelectItem value="network">Réseau</SelectItem>
                  <SelectItem value="bluetooth">Bluetooth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settings.printerConfig?.type === 'network' && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Adresse IP</Label><Input value={settings.printerConfig?.address || ''} onChange={e => setSettings({...settings, printerConfig: { ...settings.printerConfig, address: e.target.value }})} /></div>
                <div><Label>Port</Label><Input type="number" value={settings.printerConfig?.port || 9100} onChange={e => setSettings({...settings, printerConfig: { ...settings.printerConfig, port: parseInt(e.target.value) }})} /></div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={settings.printerConfig?.autoPrint || false} onCheckedChange={v => setSettings({...settings, printerConfig: { ...settings.printerConfig, autoPrint: v }})} />
              <Label>Impression automatique des tickets</Label>
            </div>
            <div><Label>Largeur papier (mm)</Label><Input type="number" value={settings.printerConfig?.paperWidth || 80} onChange={e => setSettings({...settings, printerConfig: { ...settings.printerConfig, paperWidth: parseInt(e.target.value) }})} /></div>
          </CardContent>
        </Card>

        {/* Receipt */}
        <Card>
          <CardHeader><CardTitle className="text-base">Ticket de caisse</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>En-tête du ticket</Label><Input value={settings.receiptHeader} onChange={e => setSettings({...settings, receiptHeader: e.target.value})} placeholder="Texte en haut du ticket" /></div>
            <div><Label>Pied de page du ticket</Label><Input value={settings.receiptFooter} onChange={e => setSettings({...settings, receiptFooter: e.target.value})} placeholder="Merci de votre visite!" /></div>
          </CardContent>
        </Card>

        {/* Mobile Money */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5" /> Mobile Money</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>MTN MoMo</Label>
              <Switch checked={settings.mobileMoneyConfig?.mtnMomoEnabled || false} onCheckedChange={v => setSettings({...settings, mobileMoneyConfig: { ...settings.mobileMoneyConfig, mtnMomoEnabled: v }})} />
            </div>
            {settings.mobileMoneyConfig?.mtnMomoEnabled && (
              <div><Label>Clé API MTN MoMo</Label><Input type="password" value={settings.mobileMoneyConfig?.mtnMomoApiKey || ''} onChange={e => setSettings({...settings, mobileMoneyConfig: { ...settings.mobileMoneyConfig, mtnMomoApiKey: e.target.value }})} /></div>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Orange Money</Label>
              <Switch checked={settings.mobileMoneyConfig?.orangeMoneyEnabled || false} onCheckedChange={v => setSettings({...settings, mobileMoneyConfig: { ...settings.mobileMoneyConfig, orangeMoneyEnabled: v }})} />
            </div>
            {settings.mobileMoneyConfig?.orangeMoneyEnabled && (
              <div><Label>Clé API Orange Money</Label><Input type="password" value={settings.mobileMoneyConfig?.orangeMoneyApiKey || ''} onChange={e => setSettings({...settings, mobileMoneyConfig: { ...settings.mobileMoneyConfig, orangeMoneyApiKey: e.target.value }})} /></div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button className="w-full" size="lg" onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Enregistrer les paramètres
        </Button>
      </div>
    </div>
  );
}
