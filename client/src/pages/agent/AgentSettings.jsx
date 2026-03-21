import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { printerAPI, settingsAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { User, Printer, Monitor, Unplug, Wifi, WifiOff, Loader2, CheckCircle, XCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AgentSettings() {
  const { user } = useAuth();
  const [printerConfig, setPrinterConfig] = useState({ type: 'none', address: '', port: 9100 });
  const [printerStatus, setPrinterStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsRes, statusRes] = await Promise.all([
        settingsAPI.get(),
        printerAPI.getStatus()
      ]);
      setSettings(settingsRes.data.data);
      setPrinterStatus(statusRes.data.data);
      if (settingsRes.data.data.printerConfig) {
        setPrinterConfig(settingsRes.data.data.printerConfig);
      }
    } catch (error) {
      toast.error('Erreur chargement paramètres');
    } finally {
      setLoading(false);
    }
  };

  const testPrinter = async () => {
    setTesting(true);
    try {
      const { data } = await printerAPI.test(printerConfig);
      setPrinterStatus(data.data);
      toast.success('Test imprimante réussi');
    } catch (error) {
      toast.error('Erreur connexion imprimante');
    } finally {
      setTesting(false);
    }
  };

  const disconnectPrinter = () => {
    setPrinterConfig({ type: 'none', address: '', port: 9100 });
    setPrinterStatus({ connected: false, type: 'none', message: 'Déconnecté' });
    toast.success('Imprimante déconnectée');
  };

  const features = settings?.features || {};

  const featureLabels = [
    { key: 'verificationCagnotteClient', label: 'Vérification de la cagnotte client', description: 'Vérifie le solde de la cagnotte client en mode connecté' },
    { key: 'autoriserCashBank', label: 'Autoriser le Cash Bank', description: 'Active la fonctionnalité de cash bank' },
    { key: 'autoriserPouvoirs', label: 'Autoriser les pouvoirs', description: 'Active les autorisations spéciales' },
    { key: 'verificationSoldeDebiteur', label: 'Vérification du solde débiteur', description: 'Vérifie le solde débiteur client en mode connecté' },
    { key: 'recuperationBaseClient', label: 'Récupération de la base client', description: 'Récupère la base client en mode connecté' },
    { key: 'gestionDemarques', label: 'Gestion des démarques', description: 'Active la gestion des démarques' },
    { key: 'limiteursUtilisationTitres', label: 'Limiteurs d\'utilisation des titres', description: 'Applique les limitations d\'utilisation des titres' },
  ];

  if (loading) {
    return <div><TopBar title="Paramètres" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>;
  }

  return (
    <div>
      <TopBar title="Paramètres" />
      <div className="p-6 space-y-6 max-w-2xl">
        {/* Profile Info — Read Only */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Mon profil</CardTitle>
            <CardDescription>Informations de votre compte. Contactez l'administrateur pour toute modification.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Prénom</span><p className="font-medium">{user?.firstName}</p></div>
              <div><span className="text-muted-foreground">Nom</span><p className="font-medium">{user?.lastName}</p></div>
              <div><span className="text-muted-foreground">Email</span><p className="font-medium">{user?.email}</p></div>
              <div><span className="text-muted-foreground">Rôle</span><p className="font-medium capitalize">{user?.role}</p></div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Seul l'administrateur peut modifier votre profil et votre mot de passe.</span>
            </div>
          </CardContent>
        </Card>

        {/* Peripherals — Printer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> Périphériques — Imprimante</CardTitle>
            <CardDescription>Connectez et gérez votre imprimante de tickets</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                {printerStatus?.connected ? (
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><Wifi className="w-5 h-5 text-green-600" /></div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><WifiOff className="w-5 h-5 text-gray-400" /></div>
                )}
                <div>
                  <p className="font-medium text-sm">Imprimante de tickets</p>
                  <p className="text-xs text-muted-foreground">{printerStatus?.message || 'Non configurée'}</p>
                </div>
              </div>
              <Badge variant={printerStatus?.connected ? 'default' : 'secondary'}>
                {printerStatus?.connected ? 'Connectée' : 'Déconnectée'}
              </Badge>
            </div>

            <div>
              <Label>Type de connexion</Label>
              <Select value={printerConfig.type} onValueChange={v => setPrinterConfig({...printerConfig, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="usb">USB</SelectItem>
                  <SelectItem value="network">Réseau (IP)</SelectItem>
                  <SelectItem value="bluetooth">Bluetooth</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {printerConfig.type === 'network' && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Adresse IP</Label><Input value={printerConfig.address} onChange={e => setPrinterConfig({...printerConfig, address: e.target.value})} placeholder="192.168.1.100" /></div>
                <div><Label>Port</Label><Input type="number" value={printerConfig.port} onChange={e => setPrinterConfig({...printerConfig, port: parseInt(e.target.value)})} /></div>
              </div>
            )}

            {printerConfig.type === 'usb' && (
              <div className="p-3 rounded-lg bg-blue-50 text-sm text-blue-800">
                Branchez l'imprimante via USB. Elle sera détectée automatiquement.
              </div>
            )}

            {printerConfig.type === 'bluetooth' && (
              <div className="p-3 rounded-lg bg-blue-50 text-sm text-blue-800">
                Assurez-vous que l'imprimante est appairée via les paramètres Bluetooth de votre appareil.
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={testPrinter} disabled={printerConfig.type === 'none' || testing}>
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Tester la connexion
              </Button>
              <Button variant="destructive" size="sm" onClick={disconnectPrinter} disabled={printerConfig.type === 'none'}>
                <Unplug className="w-4 h-4 mr-2" /> Déconnecter
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Other Peripherals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Monitor className="w-5 h-5" /> Autres périphériques</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><Monitor className="w-5 h-5 text-gray-400" /></div>
                  <div>
                    <p className="font-medium text-sm">Afficheur client</p>
                    <p className="text-xs text-muted-foreground">Non connecté</p>
                  </div>
                </div>
                <Badge variant="secondary">Non disponible</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><Monitor className="w-5 h-5 text-gray-400" /></div>
                  <div>
                    <p className="font-medium text-sm">Tiroir-caisse</p>
                    <p className="text-xs text-muted-foreground">Non connecté</p>
                  </div>
                </div>
                <Badge variant="secondary">Non disponible</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fonctionnalités</CardTitle>
            <CardDescription>Options activées par l'administrateur (lecture seule)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {featureLabels.map(f => (
                <div key={f.key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                  </div>
                  <Badge variant={features[f.key] ? 'default' : 'outline'} className={features[f.key] ? 'bg-green-600' : ''}>
                    {features[f.key] ? 'Activé' : 'Désactivé'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
