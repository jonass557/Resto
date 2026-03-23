import { useState, useEffect, useCallback } from 'react';
import { usersAPI } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils';
import { Plus, Search, Edit, Trash2, Users, Loader2, Shield, UserCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialog, setDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'agent', phone: '' });

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await usersAPI.getAll({ search: searchQuery });
      setUsers(data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur chargement utilisateurs');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ firstName: '', lastName: '', email: '', password: '', role: 'agent', phone: '' });
    setDialog(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({ firstName: user.firstName, lastName: user.lastName, email: user.email, password: '', role: user.role, phone: user.phone || '' });
    setDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName || !form.email) { toast.error('Veuillez remplir les champs obligatoires'); return; }
    if (!editingUser && !form.password) { toast.error('Mot de passe requis'); return; }
    setSubmitting(true);
    try {
      if (editingUser) {
        const updateData = { ...form };
        if (!updateData.password) delete updateData.password;
        await usersAPI.update(editingUser._id, updateData);
        toast.success('Utilisateur mis à jour');
      } else {
        await usersAPI.create(form);
        toast.success('Utilisateur créé');
      }
      setDialog(false);
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (user) => {
    try {
      await usersAPI.update(user._id, { isActive: !user.isActive });
      toast.success(`Utilisateur ${user.isActive ? 'désactivé' : 'activé'}`);
      loadUsers();
    } catch (error) {
      toast.error('Erreur');
    }
  };

  const deleteUser = async (user) => {
    if (!confirm(`Supprimer ${user.firstName} ${user.lastName}?`)) return;
    try {
      await usersAPI.delete(user._id);
      toast.success('Utilisateur supprimé');
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur suppression');
    }
  };

  return (
    <div>
      <TopBar title="Gestion des utilisateurs" />
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nouvel utilisateur
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-3">
            {users.map(user => (
              <Card key={user._id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${user.role === 'admin' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                      {user.role === 'admin' ? <Shield className="w-6 h-6 text-purple-600" /> : <UserCircle className="w-6 h-6 text-blue-600" />}
                    </div>
                    <div>
                      <p className="font-bold">{user.firstName} {user.lastName}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role === 'admin' ? 'Administrateur' : 'Agent'}</Badge>
                        <Badge variant={user.isActive ? 'outline' : 'destructive'}>{user.isActive ? 'Actif' : 'Inactif'}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm text-muted-foreground">
                      {user.lastLogin && <p>Dernière connexion: {formatDateTime(user.lastLogin)}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={user.isActive} onCheckedChange={() => toggleActive(user)} />
                      <Button size="icon" variant="ghost" onClick={() => openEdit(user)}><Edit className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteUser(user)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prénom *</Label><Input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} /></div>
              <div><Label>Nom *</Label><Input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} /></div>
            </div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><Label>{editingUser ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe *'}</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} /></div>
            <div><Label>Téléphone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><Label>Rôle</Label>
              <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="admin">Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingUser ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
