import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePrinter } from '@/contexts/PrinterContext';
import { settingsAPI, printerAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Printer, Monitor, Unplug, Bluetooth, Wifi, WifiOff, Usb, Loader2, CheckCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AgentSettings() {
  const { user } = useAuth();
  const { btConnected, connecting, connectBluetooth, disconnectBluetooth, printerName } = usePrinter();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [netConfig, setNetConfig] = useState({ address: '', port: 9100 });
  const [netStatus, setNetStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    settingsAPI.get().then(res => {
      setSettings(res.data.data);
      if (res.data.data?.printerConfig) {
        const pc = res.data.data.printerConfig;
        if (pc.address) setNetConfig({ address: pc.address, port: pc.port || 9100 });
      }
    }).catch(() => {}).finally(() => setLoading(false));
    printerAPI.getStatus().then(res => setNetStatus(res.data.data)).catch(() => {});
  }, []);

  const testNetworkPrinter = async () => {
    setTesting(true);
    try {
      const { data } = await printerAPI.test({ type: 'network', address: netConfig.address, port: netConfig.port });
      setNetStatus(data.data);
      toast.success('Test imprimante réseau réussi');
    } catch { toast.error('Erreur connexion imprimante réseau'); }
    finally { setTesting(false); }
  };

  const testUsbPrinter = async () => {
    setTesting(true);
    try {
      const { data } = await printerAPI.test({ type: 'usb' });
      setNetStatus(data.data);
      toast.success('Test imprimante USB réussi');
    } catch { toast.error('Erreur connexion imprimante USB'); }
    finally { setTesting(false); }
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

        {/* Peripherals — Printer Connections */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> Imprimante de tickets</CardTitle>
            <CardDescription>Connectez votre imprimante via Bluetooth (recommandé), réseau IP ou USB.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* === BLUETOOTH (auto, recommended) === */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Bluetooth className="w-4 h-4 text-blue-500" /> Bluetooth (recommandé)</h3>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${btConnected ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Bluetooth className={`w-5 h-5 ${btConnected ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{printerName || 'Imprimante Bluetooth'}</p>
                    <p className="text-xs text-muted-foreground">
                      {btConnected ? 'Connectée — impression automatique' : 'Non connectée'}
                    </p>
                  </div>
                </div>
                <Badge variant={btConnected ? 'default' : 'secondary'} className={btConnected ? 'bg-green-600' : ''}>
                  {btConnected ? 'Connectée' : 'Déconnectée'}
                </Badge>
              </div>

              {btConnected && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Imprimante prête. Les tickets seront imprimés automatiquement.</span>
                </div>
              )}

              {!btConnected && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 space-y-1">
                  <p className="font-medium">Connexion Bluetooth :</p>
                  <p>1. Allumez votre imprimante Bluetooth</p>
                  <p>2. Cliquez sur "Connecter" ci-dessous</p>
                  <p>3. Sélectionnez votre imprimante dans la liste</p>
                </div>
              )}

              <div className="flex gap-2">
                {!btConnected ? (
                  <Button size="sm" onClick={connectBluetooth} disabled={connecting}>
                    {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bluetooth className="w-4 h-4 mr-2" />}
                    {connecting ? 'Connexion...' : 'Connecter Bluetooth'}
                  </Button>
                ) : (
                  <Button variant="destructive" size="sm" onClick={disconnectBluetooth}>
                    <Unplug className="w-4 h-4 mr-2" /> Déconnecter
                  </Button>
                )}
              </div>
            </div>

            <div className="border-t" />

            {/* === NETWORK (IP) === */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Wifi className="w-4 h-4 text-purple-500" /> Réseau (IP)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Adresse IP</Label>
                  <Input placeholder="192.168.1.100" value={netConfig.address} onChange={e => setNetConfig({ ...netConfig, address: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Port</Label>
                  <Input type="number" value={netConfig.port} onChange={e => setNetConfig({ ...netConfig, port: parseInt(e.target.value) || 9100 })} />
                </div>
              </div>
              {netStatus?.connected && netStatus.type === 'network' && (
                <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{netStatus.message || 'Imprimante réseau connectée'}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={testNetworkPrinter} disabled={!netConfig.address || testing}>
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Tester la connexion réseau
              </Button>
            </div>

            <div className="border-t" />

            {/* === USB === */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Usb className="w-4 h-4 text-orange-500" /> USB</h3>
              <div className="p-3 rounded-lg bg-gray-50 border text-sm text-gray-700">
                Branchez l'imprimante via USB. Elle sera détectée automatiquement par le serveur.
              </div>
              {netStatus?.connected && netStatus.type === 'usb' && (
                <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{netStatus.message || 'Imprimante USB connectée'}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={testUsbPrinter} disabled={testing}>
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Tester la connexion USB
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
