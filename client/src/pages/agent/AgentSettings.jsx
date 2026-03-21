import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authAPI, printerAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { User, Lock, Printer, Globe, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AgentSettings() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [printerConfig, setPrinterConfig] = useState({ type: 'none', address: '', port: 9100 });
  const [saving, setSaving] = useState(false);

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

  const changePassword = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
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

  const testPrinter = async () => {
    try {
      await printerAPI.test(printerConfig);
      toast.success('Test imprimante envoyé');
    } catch (error) {
      toast.error('Erreur test imprimante');
    }
  };

  return (
    <div>
      <TopBar title="Paramètres" />
      <div className="p-6 space-y-6 max-w-2xl">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Profil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prénom</Label><Input value={profile.firstName} onChange={e => setProfile({...profile, firstName: e.target.value})} /></div>
              <div><Label>Nom</Label><Input value={profile.lastName} onChange={e => setProfile({...profile, lastName: e.target.value})} /></div>
            </div>
            <div><Label>Téléphone</Label><Input value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} /></div>
            <Button onClick={saveProfile} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Enregistrer
            </Button>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Mot de passe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Mot de passe actuel</Label><Input type="password" value={passwords.currentPassword} onChange={e => setPasswords({...passwords, currentPassword: e.target.value})} /></div>
            <div><Label>Nouveau mot de passe</Label><Input type="password" value={passwords.newPassword} onChange={e => setPasswords({...passwords, newPassword: e.target.value})} /></div>
            <div><Label>Confirmer</Label><Input type="password" value={passwords.confirmPassword} onChange={e => setPasswords({...passwords, confirmPassword: e.target.value})} /></div>
            <Button onClick={changePassword} disabled={saving}>Changer le mot de passe</Button>
          </CardContent>
        </Card>

        {/* Printer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> Imprimante</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Type de connexion</Label>
              <Select value={printerConfig.type} onValueChange={v => setPrinterConfig({...printerConfig, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="usb">USB</SelectItem>
                  <SelectItem value="network">Réseau</SelectItem>
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
            <Button variant="outline" onClick={testPrinter}>Tester l'imprimante</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
