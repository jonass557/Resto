import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRIES } from '@/data/countries';
import {
  UtensilsCrossed, Loader2, Mail, Lock, Eye, EyeOff,
  ChefHat, Utensils, Coffee, Wine, Phone, Globe
} from 'lucide-react';
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
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regCountry, setRegCountry] = useState('CI');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverWaking, setServerWaking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { login, register, logout } = useAuth();
  const navigate = useNavigate();
  const pollRef = useRef(null);
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const selectedCountry = COUNTRIES.find(c => c.code === regCountry) || COUNTRIES[0];
  // Detect if we're served from the same origin (local/offline mode)
  // In that case the server is already up — no need for wake polling
  const isLocalMode = !import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL === '/api';

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const getHomeRoute = (role) => {
    if (role === 'superadmin') return '/super-admin';
    if (role === 'admin') return '/admin';
    if (role === 'caissier') return '/caissier';
    return '/agent/restaurant';
  };

  const doLogin = useCallback(async (emailVal, passVal) => {
    try {
      const user = await login(emailVal, passVal);
      stopPoll();
      toast.success(`Bienvenue, ${user.firstName}!`);
      navigate(getHomeRoute(user.role));
      return 'ok';
    } catch (err) {
      if (!err.response) return 'network'; // still waking
      stopPoll();
      setLoading(false);
      setServerWaking(false);
      toast.error(err.response?.data?.message || 'Erreur de connexion');
      return 'auth';
    }
  }, [login, navigate]);

  const startWakePolling = useCallback((emailVal, passVal) => {
    setServerWaking(true);
    let elapsed = 0;
    // In local mode, use shorter intervals and shorter max wait
    const interval = isLocalMode ? 3000 : 12000;
    const maxWait = isLocalMode ? 15 : 180;
    pollRef.current = setInterval(async () => {
      elapsed += interval / 1000;
      if (elapsed > maxWait) {
        stopPoll();
        setLoading(false);
        setServerWaking(false);
        if (isLocalMode) {
          toast.error('Serveur local inaccessible. Vérifiez que le serveur est bien lancé.');
        } else {
          toast.error('Le serveur met trop de temps à démarrer. Réessayez dans quelques secondes.');
        }
        return;
      }
      // Tenter directement le login (plus fiable que /health seul)
      const result = await doLogin(emailVal, passVal);
      if (result === 'ok') {
        stopPoll();
      } else if (result !== 'network') {
        // Erreur d'auth (mauvais mdp), pas une erreur réseau
        stopPoll();
        setLoading(false);
        setServerWaking(false);
      }
      // Si 'network' → serveur encore en démarrage, on continue
    }, interval);
  }, [doLogin, isLocalMode]);

  useEffect(() => {
    logout();
    const t = setTimeout(() => setMounted(true), 100);
    return () => { clearTimeout(t); stopPoll(); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === 'register') {
      const cleanLocal = regPhone.replace(/\D/g, '');
      if (!cleanLocal || cleanLocal.length < 6) {
        toast.error('Veuillez saisir un numéro de téléphone valide (sans indicatif)');
        return;
      }
      if (!/^\d{5,6}$/.test(regPassword)) {
        toast.error('Le mot de passe doit être un code à 5 ou 6 chiffres');
        return;
      }
      setLoading(true);
      try {
        const { userData, message } = await register({
          country: selectedCountry.code,
          countryName: selectedCountry.name,
          dialCode: selectedCountry.dialCode,
          phone: cleanLocal,
          email: regEmail.trim() || undefined,
          password: regPassword,
        });
        toast.success(message || 'Compte restaurant créé avec 30 jours d\'essai gratuit !');
        navigate(getHomeRoute(userData.role));
      } catch (err) {
        toast.error(err.response?.data?.message || 'Erreur lors de l\'inscription');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) { toast.error('Mot de passe (code) requis'); return; }
    setLoading(true);
    const result = await doLogin(email, password);
    if (result === 'network') startWakePolling(email, password);
    else if (result === 'ok') setLoading(false);
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
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 relative overflow-hidden">
        {/* Mobile floating icons */}
        <div className="lg:hidden absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 6 }).map((_, i) => {
            const Icon = [ChefHat, Utensils, Coffee, Wine, UtensilsCrossed][i % 5];
            const left = 10 + (i * 16) % 80;
            const delay = i * 1.5;
            const duration = 12 + i * 2;
            return (
              <div
                key={`m-${i}`}
                className="absolute animate-float-up-mobile"
                style={{
                  left: `${left}%`,
                  bottom: '-30px',
                  animationDelay: `${delay}s`,
                  animationDuration: `${duration}s`,
                  opacity: 0.06
                }}
              >
                <Icon style={{ width: 18, height: 18 }} className="text-blue-600" />
              </div>
            );
          })}
        </div>

        <div className={`w-full max-w-md relative z-10 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-6 sm:mb-8">
            <div className={`inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg mb-3 sm:mb-4 transition-all duration-1000 ${mounted ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
              <UtensilsCrossed className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold">Restaurant Manager</h1>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-900 p-1 mb-6">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'login'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'register'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Créer un restaurant
              </button>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {mode === 'login' ? 'Connexion' : 'Inscription Restaurant'}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                {mode === 'login'
                  ? 'Entrez votre code à 5 ou 6 chiffres (email/téléphone optionnel)'
                  : 'Profitez de 30 jours d\'essai gratuit pour gérer votre restaurant'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'login' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email ou téléphone <span className="text-gray-400 font-normal text-xs">(optionnel)</span>
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="email"
                        type="text"
                        placeholder="votre@email.com ou téléphone"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="username"
                        disabled={loading}
                        className="pl-10 h-12 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Mot de passe (code 5 ou 6 chiffres)</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••"
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
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Pays *</Label>
                    <Select value={regCountry} onValueChange={setRegCountry} disabled={loading}>
                      <SelectTrigger className="h-12 rounded-xl border-gray-200">
                        <div className="flex items-center gap-2 truncate">
                          <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.flag} {c.name} ({c.dialCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="regPhone" className="text-sm font-medium">
                      Numéro de téléphone * <span className="text-gray-400 font-normal text-xs">(sans l&apos;indicatif)</span>
                    </Label>
                    <div className="flex gap-2">
                      <div className="h-12 px-3 rounded-xl border border-gray-200 bg-gray-50 dark:bg-gray-900 flex items-center gap-1.5 text-sm font-semibold shrink-0">
                        <span>{selectedCountry.flag}</span>
                        <span>{selectedCountry.dialCode}</span>
                      </div>
                      <div className="relative flex-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="regPhone"
                          type="tel"
                          inputMode="numeric"
                          placeholder="0700000000"
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                          disabled={loading}
                          required
                          className="pl-10 h-12 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="regEmail" className="text-sm font-medium">
                      Email <span className="text-gray-400 font-normal text-xs">(optionnel)</span>
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="regEmail"
                        type="email"
                        placeholder="restaurant@email.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        disabled={loading}
                        className="pl-10 h-12 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="regPassword" className="text-sm font-medium">
                      Mot de passe (code à 5 ou 6 chiffres) *
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="regPassword"
                        type={showPassword ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Ex: 12345 ou 123456"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={loading}
                        required
                        className="pl-10 pr-10 h-12 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all tracking-widest"
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
                </>
              )}

              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {serverWaking
                      ? 'Démarrage serveur...'
                      : mode === 'login'
                      ? 'Connexion en cours...'
                      : 'Création du restaurant...'}
                  </>
                ) : mode === 'login' ? (
                  'Se connecter'
                ) : (
                  'Créer mon restaurant (30j gratuits)'
                )}
              </Button>
            </form>

          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            &copy; {new Date().getFullYear()} Restaurant Manager. Tous droits réservés.
          </p>
        </div>
      </div>
    </div>
  );
}
