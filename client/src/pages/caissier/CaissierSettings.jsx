import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePrintAgent } from '@/contexts/PrintAgentContext';
import { settingsAPI, printerAPI, getLocalPrintServerUrl, setLocalPrintServerUrl, pingLocalPrintServer, isLocalPrintServerConfigured, readCache } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Printer, Monitor, Unplug, Wifi, WifiOff, Loader2, CheckCircle, Info, Server } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CaissierSettings() {
  const { user } = useAuth();
  const { isAgentActive, activateAgent, deactivateAgent, jobsProcessed, lastJobTime, isConnected, localServerAvailable, checkLocalServer } = usePrintAgent();
  const [settings, setSettings] = useState(() => readCache('/settings')?.data?.data || null);
  const [loading, setLoading] = useState(() => !readCache('/settings'));
  const [netConfig, setNetConfig] = useState({ address: '', port: 9100 });
  const [netStatus, setNetStatus] = useState(null);
  const [testingNetwork, setTestingNetwork] = useState(false);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [localServerUrl, setLocalServerUrlState] = useState(getLocalPrintServerUrl());
  const [localServerStatus, setLocalServerStatus] = useState(null);
  const [testingLocal, setTestingLocal] = useState(false);

  const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

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
    setLocalServerUrlState('');
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

  const connectNetworkPrinter = async () => {
    const cleanAddress = sanitizeIP(netConfig.address);
    if (!cleanAddress) { toast.error('Entrez l\'adresse IP de l\'imprimante'); return; }
    if (cleanAddress !== netConfig.address) setNetConfig(prev => ({ ...prev, address: cleanAddress }));
    setSavingNetwork(true);
    try {
      const { data: testData } = await printerAPI.test({ type: 'network', address: cleanAddress, port: netConfig.port });
      if (!testData.data?.connected) {
        setNetStatus(testData.data);
        toast.error(testData.data?.message || 'Imprimante non joignable — vérifiez le WiFi');
        return;
      }
      const newPrinterConfig = {
        ...(settings?.printerConfig || {}),
        type: 'network',
        address: cleanAddress,
        port: netConfig.port || 9100,
        paperWidth: settings?.printerConfig?.paperWidth || 80,
        autoPrint: settings?.printerConfig?.autoPrint !== false,
      };
      const { data: savedRes } = await settingsAPI.update({ ...(settings || {}), printerConfig: newPrinterConfig });
      setSettings(savedRes.data || { ...(settings || {}), printerConfig: newPrinterConfig });
      setNetStatus(testData.data);
      toast.success(`Imprimante connectée et sauvegardée (${cleanAddress})`);
    } catch (err) {
      toast.error(err.response?.data?.message || `Erreur connexion: ${err.message}`);
    } finally { setSavingNetwork(false); }
  };

  const disconnectNetworkPrinter = async () => {
    setSavingNetwork(true);
    try {
      const newPrinterConfig = { ...(settings?.printerConfig || {}), type: 'none', address: '', port: 9100 };
      const { data: savedRes } = await settingsAPI.update({ ...(settings || {}), printerConfig: newPrinterConfig });
      setSettings(savedRes.data || { ...(settings || {}), printerConfig: newPrinterConfig });
      setNetStatus(null);
      setNetConfig({ address: '', port: 9100 });
      toast.success('Imprimante déconnectée');
    } catch (err) {
      toast.error(`Erreur: ${err.message}`);
    } finally { setSavingNetwork(false); }
  };

  if (loading) {
    return <div><TopBar title="Paramètres" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>;
  }

  return (
    <div>
      <TopBar title="Paramètres" />
      <div className="p-6 space-y-6 max-w-2xl">
        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Mon profil</CardTitle>
            <CardDescription>Informations de votre compte.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Prénom</span><p className="font-medium">{user?.firstName}</p></div>
              <div><span className="text-muted-foreground">Nom</span><p className="font-medium">{user?.lastName}</p></div>
              <div><span className="text-muted-foreground">Email</span><p className="font-medium">{user?.email}</p></div>
              <div><span className="text-muted-foreground">Rôle</span><p className="font-medium capitalize">{user?.role}</p></div>
            </div>
          </CardContent>
        </Card>

        {/* Printer Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> Imprimante</CardTitle>
            <CardDescription>Connectez-vous au serveur local d'impression pour imprimer le rapport global et les factures.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* === AGENT D'IMPRESSION AUTOMATIQUE === */}
            {isCloud && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-emerald-500" /> Agent d'impression automatique
                </h3>

                <div className={`p-3 rounded-lg border text-sm space-y-1 ${localServerAvailable ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  {localServerAvailable ? (
                    <p className="flex items-center gap-2 font-medium"><CheckCircle className="w-4 h-4" /> Serveur local détecté sur cette machine</p>
                  ) : (
                    <>
                      <p className="font-medium flex items-center gap-2"><Info className="w-4 h-4" /> Serveur local requis sur cette machine</p>
                      <p>Pour que l'agent puisse imprimer, lancez dans un terminal :</p>
                      <code className="block bg-amber-100 px-2 py-1 rounded text-xs font-mono">npm run local</code>
                      <p className="text-xs opacity-80">Le serveur local sert de pont entre le cloud et l'imprimante WiFi.</p>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={checkLocalServer}>
                    Vérifier serveur local
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isAgentActive && isConnected ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                      <Monitor className={`w-5 h-5 ${isAgentActive && isConnected ? 'text-emerald-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Agent d'impression</p>
                      <p className="text-xs text-muted-foreground">
                        {isAgentActive && isConnected ? `Actif — ${jobsProcessed} impressions` : 'Inactif'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={isAgentActive && isConnected ? 'default' : 'secondary'} className={isAgentActive && isConnected ? 'bg-emerald-600' : ''}>
                    {isAgentActive && isConnected ? 'Connecté' : 'Déconnecté'}
                  </Badge>
                </div>

                {isAgentActive && isConnected && localServerAvailable && (
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Prêt — le rapport global et les factures s'imprimeront automatiquement</span>
                  </div>
                )}

                {isAgentActive && isConnected && !localServerAvailable && (
                  <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2">
                    <WifiOff className="w-4 h-4 shrink-0" />
                    <span>Agent connecté mais serveur local introuvable — impression impossible</span>
                  </div>
                )}

                {lastJobTime && (
                  <div className="text-xs text-muted-foreground">
                    Dernière impression : {new Date(lastJobTime).toLocaleTimeString('fr-FR')}
                  </div>
                )}

                <div className="flex gap-2">
                  {!isAgentActive ? (
                    <Button size="sm" onClick={activateAgent} className="bg-emerald-600 hover:bg-emerald-700" disabled={!localServerAvailable}>
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
                    <Label className="text-xs">URL du serveur local</Label>
                    <Input placeholder="http://192.168.1.50:5000" value={localServerUrl} onChange={e => setLocalServerUrlState(e.target.value)} />
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
                    {getLocalPrintServerUrl() && (
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
              {settings?.printerConfig?.type === 'network' && settings?.printerConfig?.address && (
                <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Imprimante sauvegardée : <strong>{settings.printerConfig.address}:{settings.printerConfig.port || 9100}</strong> — impression automatique active</span>
                </div>
              )}
              {netStatus?.connected && netStatus.type === 'network' && settings?.printerConfig?.type !== 'network' && (
                <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{netStatus.message || 'Imprimante réseau connectée'}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={testNetworkPrinter} disabled={!netConfig.address || testingNetwork || savingNetwork}>
                  {testingNetwork ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Tester
                </Button>
                <Button size="sm" onClick={connectNetworkPrinter} disabled={!netConfig.address || testingNetwork || savingNetwork} className="bg-purple-600 hover:bg-purple-700">
                  {savingNetwork ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wifi className="w-4 h-4 mr-2" />}
                  {settings?.printerConfig?.type === 'network' ? 'Mettre à jour' : 'Connecter'}
                </Button>
                {settings?.printerConfig?.type === 'network' && settings?.printerConfig?.address && (
                  <Button variant="destructive" size="sm" onClick={disconnectNetworkPrinter} disabled={savingNetwork}>
                    <Unplug className="w-4 h-4 mr-2" /> Déconnecter
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
