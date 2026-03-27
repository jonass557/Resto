import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePrinter } from '@/contexts/PrinterContext';
import { usePrintAgent } from '@/contexts/PrintAgentContext';
import { settingsAPI, printerAPI, getLocalPrintServerUrl, setLocalPrintServerUrl, pingLocalPrintServer, isLocalPrintServerConfigured } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Printer, Monitor, Unplug, Bluetooth, Wifi, WifiOff, Usb, Loader2, CheckCircle, Info, Server } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AgentSettings() {
  const { user } = useAuth();
  const { btConnected, connecting, connectBluetooth, disconnectBluetooth, printerName } = usePrinter();
  const { isAgentActive, activateAgent, deactivateAgent, jobsProcessed, lastJobTime, isConnected } = usePrintAgent();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [netConfig, setNetConfig] = useState({ address: '', port: 9100 });
  const [netStatus, setNetStatus] = useState(null);
  const [testingNetwork, setTestingNetwork] = useState(false);
  const [testingUsb, setTestingUsb] = useState(false);
  const [localServerUrl, setLocalServerUrl] = useState(getLocalPrintServerUrl());
  const [localServerStatus, setLocalServerStatus] = useState(null);
  const [testingLocal, setTestingLocal] = useState(false);

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

  const sanitizeIP = (ip) => (ip || '').trim().replace(/[-\s]+/g, '.');

  const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  const testLocalServer = async () => {
    if (!localServerUrl) { toast.error('Entrez l\'URL du serveur local'); return; }
    setTestingLocal(true);
    try {
      const result = await pingLocalPrintServer(localServerUrl);
      if (result) {
        setLocalPrintServerUrl(localServerUrl);
        setLocalServerStatus(result);
        toast.success(`Serveur local détecté: ${result.hostname} (${result.localIPs?.join(', ')})`);
        printerAPI.getStatus().then(res => setNetStatus(res.data.data)).catch(() => {});
      } else {
        setLocalServerStatus(null);
        toast.error('Serveur local non joignable. Vérifiez l\'URL et que le serveur est lancé.');
      }
    } catch {
      setLocalServerStatus(null);
      toast.error('Impossible de contacter le serveur local');
    } finally { setTestingLocal(false); }
  };

  const disconnectLocalServer = () => {
    setLocalPrintServerUrl('');
    setLocalServerUrl('');
    setLocalServerStatus(null);
    toast.success('Serveur local déconnecté');
  };

  const testNetworkPrinter = async () => {
    const cleanAddress = sanitizeIP(netConfig.address);
    if (cleanAddress !== netConfig.address) setNetConfig(prev => ({ ...prev, address: cleanAddress }));
    setTestingNetwork(true);
    try {
      const { data } = await printerAPI.test({ type: 'network', address: cleanAddress, port: netConfig.port });
      setNetStatus(data.data);
      if (data.data?.connected) {
        toast.success(data.data.message || `Connectée à ${netConfig.address}:${netConfig.port}`);
      } else {
        toast.error(data.data?.message || 'Imprimante réseau non joignable');
      }
    } catch (err) {
      const errData = err.response?.data?.data;
      setNetStatus({ ...(errData || {}), connected: false, type: 'network' });
      toast.error(err.response?.data?.message || `Impossible de joindre ${netConfig.address}:${netConfig.port}`);
    } finally { setTestingNetwork(false); }
  };

  const testUsbPrinter = async () => {
    setTestingUsb(true);
    try {
      const { data } = await printerAPI.test({ type: 'usb' });
      setNetStatus(data.data);
      if (data.data?.connected) {
        toast.success(data.data.message || 'Imprimante USB connectée');
      } else {
        toast.error(data.data?.message || 'Aucune imprimante USB détectée');
      }
    } catch (err) {
      setNetStatus({ connected: false, type: 'usb' });
      toast.error('Erreur détection imprimante USB');
    } finally { setTestingUsb(false); }
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

            {/* === AGENT D'IMPRESSION AUTOMATIQUE === */}
            {isCloud && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-emerald-500" /> Agent d'impression automatique
                </h3>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 space-y-1">
                  <p className="font-medium">💡 Solution pour imprimer depuis le cloud vers WiFi local :</p>
                  <p>1. Laissez cette page ouverte sur un appareil du même WiFi que l'imprimante</p>
                  <p>2. Activez l'agent ci-dessous</p>
                  <p>3. Les commandes passées depuis n'importe où seront imprimées automatiquement ici</p>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isAgentActive && isConnected ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                      <Monitor className={`w-5 h-5 ${isAgentActive && isConnected ? 'text-emerald-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Agent d'impression</p>
                      <p className="text-xs text-muted-foreground">
                        {isAgentActive && isConnected ? `Actif — ${jobsProcessed} tickets imprimés` : 'Inactif'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={isAgentActive && isConnected ? 'default' : 'secondary'} className={isAgentActive && isConnected ? 'bg-emerald-600' : ''}>
                    {isAgentActive && isConnected ? 'Connecté' : 'Déconnecté'}
                  </Badge>
                </div>

                {isAgentActive && isConnected && (
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Agent actif — les commandes en ligne seront imprimées automatiquement sur cette machine</span>
                  </div>
                )}

                {lastJobTime && (
                  <div className="text-xs text-muted-foreground">
                    Dernière impression : {new Date(lastJobTime).toLocaleTimeString('fr-FR')}
                  </div>
                )}

                <div className="flex gap-2">
                  {!isAgentActive ? (
                    <Button size="sm" onClick={activateAgent} className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Activer l'agent
                    </Button>
                  ) : (
                    <Button variant="destructive" size="sm" onClick={deactivateAgent}>
                      <Unplug className="w-4 h-4 mr-2" />
                      Désactiver l'agent
                    </Button>
                  )}
                </div>
              </div>
            )}
            {isCloud && <div className="border-t" />}

            {/* === LOCAL PRINT SERVER === */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Server className="w-4 h-4 text-indigo-500" /> Serveur local d'impression</h3>
              {!isCloud ? (
                <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Mode local actif — l'impression réseau passe directement par ce serveur.</span>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-800 space-y-1">
                    <p className="font-medium">Pour imprimer via réseau WiFi :</p>
                    <p>1. Ouvrez l'application depuis le serveur local : <code className="bg-indigo-100 px-1 rounded">http://192.168.x.x:5000</code></p>
                    <p>2. L'impression réseau fonctionnera automatiquement</p>
                    <p className="text-xs mt-1 opacity-70">Alternative : entrez l'URL du serveur local ci-dessous pour l'utiliser depuis le site en ligne.</p>
                  </div>
                  <div>
                    <Label className="text-xs">URL du serveur local (optionnel depuis le site en ligne)</Label>
                    <Input placeholder="http://192.168.1.50:5000" value={localServerUrl} onChange={e => setLocalServerUrl(e.target.value)} />
                  </div>
                  {localServerStatus && (
                    <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>Connecté à <strong>{localServerStatus.hostname}</strong> ({localServerStatus.localIPs?.join(', ')})</span>
                    </div>
                  )}
                  {getLocalPrintServerUrl() && !localServerStatus && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>Configuré: {getLocalPrintServerUrl()} — cliquez Connecter pour vérifier</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={testLocalServer} disabled={testingLocal || !localServerUrl}>
                      {testingLocal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
                      {testingLocal ? 'Connexion...' : 'Connecter'}
                    </Button>
                    {getLocalPrintServerUrl() && !isLocalPrintServerConfigured() && (
                      <Button variant="destructive" size="sm" onClick={disconnectLocalServer}>
                        <Unplug className="w-4 h-4 mr-2" /> Déconnecter
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="border-t" />

            {/* === NETWORK (IP) === */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Wifi className="w-4 h-4 text-purple-500" /> Réseau (IP)</h3>
              {isCloud && !isLocalPrintServerConfigured() && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Ouvrez l'application depuis le <strong>serveur local</strong> (<code className="bg-amber-100 px-1 rounded">http://192.168.x.x:5000</code>) pour l'impression réseau.</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Adresse IP imprimante</Label>
                  <Input placeholder="192.168.1.100" value={netConfig.address} onChange={e => setNetConfig({ ...netConfig, address: e.target.value.replace(/[-\s]+/g, '.') })} />
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
              {netStatus?.cloudError && (
                <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  <span>{netStatus.message || 'IP locale inaccessible depuis le cloud'}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={testNetworkPrinter} disabled={!netConfig.address || testingNetwork}>
                {testingNetwork ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
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
              <Button variant="outline" size="sm" onClick={testUsbPrinter} disabled={testingUsb}>
                {testingUsb ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
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
