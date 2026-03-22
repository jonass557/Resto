import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePrinter } from '@/contexts/PrinterContext';
import { settingsAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Printer, Monitor, Unplug, Bluetooth, Loader2, CheckCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AgentSettings() {
  const { user } = useAuth();
  const { btConnected, connecting, connectBluetooth, disconnectBluetooth, printerName } = usePrinter();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsAPI.get().then(res => setSettings(res.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

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

        {/* Peripherals — Bluetooth Printer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> Imprimante Bluetooth</CardTitle>
            <CardDescription>Connectez votre imprimante de tickets via Bluetooth. La connexion est automatique.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${btConnected ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Bluetooth className={`w-5 h-5 ${btConnected ? 'text-green-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="font-medium text-sm">{printerName || 'Imprimante de tickets'}</p>
                  <p className="text-xs text-muted-foreground">
                    {btConnected ? 'Connectée via Bluetooth — impression automatique' : 'Non connectée'}
                  </p>
                </div>
              </div>
              <Badge variant={btConnected ? 'default' : 'secondary'} className={btConnected ? 'bg-green-600' : ''}>
                {btConnected ? 'Connectée' : 'Déconnectée'}
              </Badge>
            </div>

            {!btConnected && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 space-y-1">
                <p className="font-medium">Comment connecter :</p>
                <p>1. Allumez votre imprimante Bluetooth</p>
                <p>2. Cliquez sur "Connecter l'imprimante" ci-dessous</p>
                <p>3. Sélectionnez votre imprimante dans la liste</p>
                <p>Les tickets et factures seront envoyés automatiquement à l'imprimante.</p>
              </div>
            )}

            {btConnected && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Imprimante prête. Les tickets et factures seront imprimés automatiquement lorsque vous cliquez sur "Imprimer".</span>
              </div>
            )}

            {!navigator.bluetooth && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Bluetooth non supporté par ce navigateur. Utilisez Chrome ou Edge sur un appareil compatible.</span>
              </div>
            )}

            <div className="flex gap-2">
              {!btConnected ? (
                <Button onClick={connectBluetooth} disabled={connecting || !navigator.bluetooth}>
                  {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bluetooth className="w-4 h-4 mr-2" />}
                  {connecting ? 'Connexion...' : 'Connecter l\'imprimante'}
                </Button>
              ) : (
                <Button variant="destructive" size="sm" onClick={disconnectBluetooth}>
                  <Unplug className="w-4 h-4 mr-2" /> Déconnecter
                </Button>
              )}
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
