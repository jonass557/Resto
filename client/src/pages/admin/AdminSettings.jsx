import { useState, useEffect } from 'react';
import { settingsAPI, usersAPI, authAPI, printerAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Store, Printer, Smartphone, Globe, Save, Lock, ToggleRight, Monitor, Unplug, Wifi, WifiOff, CheckCircle, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

const featureLabels = [
  { key: 'verificationCagnotteClient', label: 'Vérification de la cagnotte client', description: 'Vérifie le solde de la cagnotte client en mode connecté' },
  { key: 'autoriserCashBank', label: 'Autoriser le Cash Bank', description: 'Active la fonctionnalité de cash bank' },
  { key: 'autoriserPouvoirs', label: 'Autoriser les pouvoirs', description: 'Active les autorisations spéciales' },
  { key: 'verificationSoldeDebiteur', label: 'Vérification du solde débiteur', description: 'Vérifie le solde débiteur client en mode connecté' },
  { key: 'recuperationBaseClient', label: 'Récupération de la base client', description: 'Récupère la base client en mode connecté' },
  { key: 'gestionDemarques', label: 'Gestion des démarques', description: 'Active la gestion des démarques' },
  { key: 'limiteursUtilisationTitres', label: 'Limiteurs d\'utilisation des titres', description: 'Applique les limitations d\'utilisation des titres' },
];

export default function AdminSettings() {
  const { user, updateUser } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Admin profile
  const [profile, setProfile] = useState({ firstName: '', lastName: '', phone: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  // User password management
  const [users, setUsers] = useState([]);
  const [pwDialog, setPwDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUserPw, setNewUserPw] = useState('');

  // Printer
  const [printerStatus, setPrinterStatus] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [settingsRes, usersRes, statusRes] = await Promise.all([
        settingsAPI.get(),
        usersAPI.getAll(),
        printerAPI.getStatus()
      ]);
      setSettings(settingsRes.data.data);
      setUsers(usersRes.data.data);
      setPrinterStatus(statusRes.data.data);
      setProfile({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '' });
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

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data } = await authAPI.updateProfile(profile);
      updateUser(data.data);
      toast.success('Profil mis à jour');
    } catch (error) {
      toast.error('Erreur mise à jour profil');
    } finally {
      setSaving(false);
    }
  };

  const changeOwnPassword = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) { toast.error('Les mots de passe ne correspondent pas'); return; }
    if (passwords.newPassword.length < 6) { toast.error('Minimum 6 caractères'); return; }
    setSaving(true);
    try {
      await authAPI.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      toast.success('Mot de passe modifié');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const changeUserPassword = async () => {
    if (!selectedUser || newUserPw.length < 6) { toast.error('Minimum 6 caractères'); return; }
    setSaving(true);
    try {
      const { data } = await authAPI.changeUserPassword(selectedUser._id, newUserPw);
      toast.success(data.message);
      setPwDialog(false);
      setNewUserPw('');
      setSelectedUser(null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (key) => {
    setSettings(prev => ({
      ...prev,
      features: { ...(prev.features || {}), [key]: !(prev.features?.[key]) }
    }));
  };

  const testPrinter = async () => {
    try {
      const { data } = await printerAPI.test(settings.printerConfig);
      setPrinterStatus(data.data);
      toast.success('Test imprimante réussi');
    } catch (error) {
      toast.error('Erreur test imprimante');
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

        {/* Admin Profile */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Mon profil administrateur</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prénom</Label><Input value={profile.firstName} onChange={e => setProfile({...profile, firstName: e.target.value})} /></div>
              <div><Label>Nom</Label><Input value={profile.lastName} onChange={e => setProfile({...profile, lastName: e.target.value})} /></div>
            </div>
            <div><Label>Téléphone</Label><Input value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} /></div>
            <Button onClick={saveProfile} disabled={saving} size="sm">Enregistrer le profil</Button>
            <Separator />
            <p className="text-sm font-medium">Changer mon mot de passe</p>
            <div><Label>Mot de passe actuel</Label><Input type="password" value={passwords.currentPassword} onChange={e => setPasswords({...passwords, currentPassword: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nouveau</Label><Input type="password" value={passwords.newPassword} onChange={e => setPasswords({...passwords, newPassword: e.target.value})} /></div>
              <div><Label>Confirmer</Label><Input type="password" value={passwords.confirmPassword} onChange={e => setPasswords({...passwords, confirmPassword: e.target.value})} /></div>
            </div>
            <Button onClick={changeOwnPassword} disabled={saving} size="sm">Changer le mot de passe</Button>
          </CardContent>
        </Card>

        {/* User Password Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Gestion des mots de passe utilisateurs</CardTitle>
            <CardDescription>Modifier le mot de passe de n'importe quel agent</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {users.filter(u => u._id !== user?._id).map(u => (
                <div key={u._id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-muted-foreground">{u.email} — <span className="capitalize">{u.role}</span></p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setSelectedUser(u); setNewUserPw(''); setPwDialog(true); }}>
                    <Lock className="w-3 h-3 mr-1" /> Changer MDP
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Feature Toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ToggleRight className="w-5 h-5" /> Fonctionnalités</CardTitle>
            <CardDescription>Activez ou désactivez les fonctionnalités disponibles pour les agents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {featureLabels.map(f => (
                <div key={f.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                  </div>
                  <Switch checked={settings.features?.[f.key] || false} onCheckedChange={() => toggleFeature(f.key)} />
                </div>
              ))}
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

        {/* Printer & Peripherals */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> Impression & Périphériques</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                {printerStatus?.connected ? (
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><Wifi className="w-5 h-5 text-green-600" /></div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><WifiOff className="w-5 h-5 text-gray-400" /></div>
                )}
                <div>
                  <p className="font-medium text-sm">Imprimante</p>
                  <p className="text-xs text-muted-foreground">{printerStatus?.message || 'Non configurée'}</p>
                </div>
              </div>
              <Badge variant={printerStatus?.connected ? 'default' : 'secondary'}>
                {printerStatus?.connected ? 'Connectée' : 'Déconnectée'}
              </Badge>
            </div>

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

            <div className="flex gap-2">
              <Button variant="outline" onClick={testPrinter} disabled={settings.printerConfig?.type === 'none'}>
                <CheckCircle className="w-4 h-4 mr-2" /> Tester l'imprimante
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setSettings({...settings, printerConfig: { type: 'none', address: '', port: 9100, paperWidth: 80, autoPrint: false }})} disabled={settings.printerConfig?.type === 'none'}>
                <Unplug className="w-4 h-4 mr-2" /> Déconnecter
              </Button>
            </div>
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
          Enregistrer tous les paramètres
        </Button>
      </div>

      {/* Change User Password Dialog */}
      <Dialog open={pwDialog} onOpenChange={setPwDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le mot de passe de {selectedUser?.firstName} {selectedUser?.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nouveau mot de passe (min. 6 caractères)</Label>
              <Input type="password" value={newUserPw} onChange={e => setNewUserPw(e.target.value)} placeholder="Nouveau mot de passe" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialog(false)}>Annuler</Button>
            <Button onClick={changeUserPassword} disabled={saving || newUserPw.length < 6}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
