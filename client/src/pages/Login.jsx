import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UtensilsCrossed, Loader2, Mail, Lock, Eye, EyeOff, ChefHat, Utensils, Coffee, Wine } from 'lucide-react';
import toast from 'react-hot-toast';

function FloatingIcons() {
  const icons = [ChefHat, Utensils, Coffee, Wine, UtensilsCrossed];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 12 }).map((_, i) => {
        const Icon = icons[i % icons.length];
        const left = Math.random() * 100;
        const delay = Math.random() * 8;
        const duration = 10 + Math.random() * 15;
        const size = 16 + Math.random() * 20;
        return (
          <div
            key={i}
            className="absolute animate-float-up"
            style={{
              left: `${left}%`,
              bottom: '-40px',
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              opacity: 0.08 + Math.random() * 0.08
            }}
          >
            <Icon style={{ width: size, height: size }} className="text-white" />
          </div>
        );
      })}
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Bienvenue, ${user.firstName}!`);
      navigate(user.role === 'admin' ? '/admin' : '/agent');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Left — Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 relative items-center justify-center p-12">
        <FloatingIcons />
        <div className={`relative z-10 text-center transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 mb-8 shadow-2xl animate-pulse-slow">
            <UtensilsCrossed className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-5xl font-extrabold text-white tracking-tight mb-4">
            Restaurant<br /><span className="text-blue-300">Manager</span>
          </h1>
          <p className="text-blue-200/80 text-lg max-w-sm mx-auto leading-relaxed">
            Plateforme complète de gestion de votre restaurant. Commandes, tickets, caisse et bien plus.
          </p>
          <div className="mt-10 flex items-center justify-center gap-8 text-blue-300/60 text-sm">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/10"><Utensils className="w-5 h-5" /></div>
              <span>Commandes</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/10"><Coffee className="w-5 h-5" /></div>
              <span>Tickets</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/10"><Wine className="w-5 h-5" /></div>
              <span>Caisse</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
        <div className={`w-full max-w-md transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg mb-4">
              <UtensilsCrossed className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Restaurant Manager</h1>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Connexion</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                Entrez vos identifiants pour accéder au système
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={loading}
                    className="pl-10 h-12 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    className="pl-10 pr-10 h-12 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  'Se connecter'
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600">
              <p className="font-semibold text-xs text-gray-600 dark:text-gray-300 mb-2 uppercase tracking-wide">Comptes de démonstration</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2 rounded-lg bg-white dark:bg-gray-800 border">
                  <p className="font-medium text-blue-600">Admin</p>
                  <p className="text-gray-500 mt-0.5">admin@restaurant.com</p>
                  <p className="text-gray-400">admin123</p>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-gray-800 border">
                  <p className="font-medium text-green-600">Agent</p>
                  <p className="text-gray-500 mt-0.5">agent@restaurant.com</p>
                  <p className="text-gray-400">agent123</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            &copy; {new Date().getFullYear()} Restaurant Manager. Tous droits réservés.
          </p>
        </div>
      </div>
    </div>
  );
}
