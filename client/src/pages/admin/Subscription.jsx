import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Crown, Check, Clock, AlertTriangle, Smartphone, ExternalLink,
  RefreshCw, Loader2, ShieldCheck, Calendar, Receipt
} from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriptionAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { COUNTRIES, IKEEPAY_OPERATORS, DURATION_LABELS } from '@/data/countries';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_BADGE = {
  lifetime: { label: 'À Vie', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  active: { label: 'Actif', className: 'bg-green-100 text-green-800 border-green-200' },
  trial: { label: 'Essai Gratuit', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  expired: { label: 'Expiré', className: 'bg-red-100 text-red-800 border-red-200' },
  deactivated: { label: 'Désactivé', className: 'bg-red-100 text-red-800 border-red-200' },
};

export default function Subscription() {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState([]);
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [payDialog, setPayDialog] = useState(false);
  const [payForm, setPayForm] = useState({
    country: 'CI',
    localPhone: '',
    operator: 'ORANGE',
    customerEmail: '',
    otp: '',
  });
  const [paying, setPaying] = useState(false);
  const [pendingTx, setPendingTx] = useState(null);
  const [verifyingRef, setVerifyingRef] = useState('');
  const pollTimerRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [plansRes, statusRes] = await Promise.all([
        subscriptionAPI.getPlans(),
        subscriptionAPI.getStatus(),
      ]);
      setPlans(plansRes.data.data || []);
      setStatusData(statusRes.data.data || null);
      const r = statusRes.data.data?.restaurant;
      if (r) {
        setPayForm(prev => ({
          ...prev,
          country: r.country || prev.country,
          localPhone: r.phone || prev.localPhone,
          customerEmail: r.email || user?.email || prev.customerEmail,
        }));
      }
    } catch {
      toast.error('Erreur lors du chargement des plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const selectedCountry = COUNTRIES.find(c => c.code === payForm.country) || COUNTRIES[0];

  const openPayDialog = (plan) => {
    setSelectedPlan(plan);
    setPendingTx(null);
    stopPolling();
    setPayDialog(true);
  };

  const verifyReference = async (reference, silent = false) => {
    if (!reference) return;
    setVerifyingRef(reference);
    try {
      const res = await subscriptionAPI.verify(reference);
      const status = res.data?.data?.status;
      if (status === 'completed') {
        stopPolling();
        toast.success('Paiement confirmé ! Votre abonnement est activé.');
        setPayDialog(false);
        await fetchAll();
        if (refreshUser) await refreshUser();
      } else if (status === 'failed') {
        stopPolling();
        toast.error('Le paiement a échoué.');
        await fetchAll();
      } else if (!silent) {
        toast.info('Paiement encore en attente de validation.');
      }
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.message || 'Erreur vérification');
    } finally {
      setVerifyingRef('');
    }
  };

  const startPolling = (reference) => {
    stopPolling();
    let attempts = 0;
    pollTimerRef.current = setInterval(() => {
      attempts += 1;
      if (attempts > 24) {
        stopPolling();
        return;
      }
      verifyReference(reference, true);
    }, 5000);
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!selectedPlan) return;
    const cleanLocal = payForm.localPhone.replace(/\D/g, '');
    if (!cleanLocal || cleanLocal.length < 6) {
      toast.error('Numéro de téléphone invalide');
      return;
    }
    const dialDigits = selectedCountry.dialCode.replace(/\D/g, '');
    const fullPhone = cleanLocal.startsWith(dialDigits) ? cleanLocal : `${dialDigits}${cleanLocal}`;

    setPaying(true);
    try {
      const res = await subscriptionAPI.pay({
        planId: selectedPlan._id,
        country: payForm.country,
        phoneNumber: fullPhone,
        operator: payForm.operator,
        customerEmail: payForm.customerEmail,
        otp: payForm.otp || undefined,
      });

      const data = res.data?.data || {};
      if (data.status === 'completed') {
        toast.success('Paiement confirmé ! Votre abonnement est actif.');
        setPayDialog(false);
        await fetchAll();
        if (refreshUser) await refreshUser();
      } else {
        setPendingTx(data);
        toast.info(res.data?.message || 'Transaction initiée.');
        if (data.external_reference) startPolling(data.external_reference);
        await fetchAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Échec du paiement iKeepay');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const sub = statusData?.subscription || user?.restaurantData?.subscription || {};
  const effectiveStatus = sub.effectiveStatus || sub.status || 'trial';
  const badge = STATUS_BADGE[effectiveStatus] || STATUS_BADGE.trial;
  const transactions = statusData?.transactions || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" /> Plans & Abonnement
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez votre abonnement restaurant et renouvelez votre licence après votre essai gratuit de 30 jours.
        </p>
      </div>

      {/* Current Subscription Card */}
      <Card className={!sub.isValid && !statusData?.isLegacy ? 'border-red-300 bg-red-50/40 dark:bg-red-950/10' : ''}>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-lg font-bold">{sub.planName || 'Essai Gratuit 30 Jours'}</span>
                <Badge className={badge.className}>{badge.label}</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                {sub.isLifetime ? (
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <ShieldCheck className="w-4 h-4" /> Accès illimité à vie
                  </span>
                ) : sub.isValid ? (
                  <>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-primary" />
                      <strong>{sub.daysRemaining}</strong> jour(s) restant(s)
                    </span>
                    {(sub.endDate || sub.trialEndsAt) && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Expire le {formatDate(sub.endDate || sub.trialEndsAt)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 text-red-600 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    Votre période d&apos;essai ou abonnement a expiré. Choisissez un plan ci-dessous pour continuer.
                  </span>
                )}
              </div>
            </div>

            {statusData?.restaurant && (
              <div className="text-sm text-muted-foreground md:text-right">
                <p className="font-medium text-foreground">{statusData.restaurant.name}</p>
                <p>{statusData.restaurant.dialCode} {statusData.restaurant.phone}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      {!statusData?.isLegacy && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Plans disponibles</h2>
          {plans.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Aucun plan d&apos;abonnement configuré pour le moment. Contactez l&apos;administrateur de la plateforme.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <Card
                  key={plan._id}
                  className={`flex flex-col relative ${plan.isPopular ? 'border-primary ring-2 ring-primary/20 shadow-md' : ''}`}
                >
                  {plan.isPopular && (
                    <Badge className="absolute -top-2.5 right-4 bg-primary text-primary-foreground">
                      Populaire
                    </Badge>
                  )}
                  <CardHeader>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription>{DURATION_LABELS[plan.duration] || plan.duration}</CardDescription>
                    <div className="pt-2">
                      <span className="text-3xl font-extrabold text-primary">
                        {formatCurrency(plan.price, plan.currency || 'XOF')}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      {plan.description && (
                        <p className="text-xs text-muted-foreground">{plan.description}</p>
                      )}
                      <ul className="space-y-1.5 text-sm">
                        {(plan.features || []).map((feat, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      className="w-full"
                      variant={plan.isPopular ? 'default' : 'outline'}
                      onClick={() => openPayDialog(plan)}
                    >
                      <Smartphone className="w-4 h-4 mr-2" />
                      Payer via Mobile Money
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment History */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Historique des paiements d&apos;abonnement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx._id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border text-sm"
              >
                <div>
                  <p className="font-medium">
                    {tx.plan?.name || 'Abonnement'} — {formatCurrency(tx.amount, tx.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Réf: {tx.externalReference} • {tx.operator} ({tx.phoneNumber}) • {formatDate(tx.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      tx.status === 'completed'
                        ? 'default'
                        : tx.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {tx.status === 'completed' ? 'Payé' : tx.status === 'failed' ? 'Échoué' : 'En attente'}
                  </Badge>
                  {tx.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={verifyingRef === tx.externalReference}
                      onClick={() => verifyReference(tx.externalReference)}
                    >
                      {verifyingRef === tx.externalReference ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      )}
                      Vérifier
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* iKeepay Payin Dialog */}
      <Dialog open={payDialog} onOpenChange={(open) => { if (!open) stopPolling(); setPayDialog(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Paiement Mobile Money (iKeepay)</DialogTitle>
            <DialogDescription>
              {selectedPlan && (
                <>Plan <strong>{selectedPlan.name}</strong> — <strong>{formatCurrency(selectedPlan.price, selectedPlan.currency || 'XOF')}</strong></>
              )}
            </DialogDescription>
          </DialogHeader>

          {pendingTx ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 space-y-2 text-sm">
                <p className="font-semibold text-blue-900 dark:text-blue-200">
                  Transaction enregistrée ({pendingTx.external_reference})
                </p>
                <p className="text-blue-700 dark:text-blue-300">
                  {pendingTx.payment_link
                    ? 'Cliquez sur le lien ci-dessous pour finaliser le paiement, puis vérifiez le statut.'
                    : 'Veuillez confirmer la demande de débit sur votre téléphone Mobile Money.'}
                </p>
              </div>

              {pendingTx.payment_link && (
                <Button asChild className="w-full" variant="default">
                  <a href={pendingTx.payment_link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Ouvrir le lien de paiement
                  </a>
                </Button>
              )}

              <Button
                className="w-full"
                variant="outline"
                disabled={verifyingRef === pendingTx.external_reference}
                onClick={() => verifyReference(pendingTx.external_reference)}
              >
                {verifyingRef === pendingTx.external_reference ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Vérifier la confirmation du paiement
              </Button>
            </div>
          ) : (
            <form onSubmit={handlePaySubmit} className="space-y-3">
              <div>
                <Label>Pays</Label>
                <Select
                  value={payForm.country}
                  onValueChange={(v) => setPayForm({ ...payForm, country: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} {c.name} ({c.dialCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Opérateur Mobile Money *</Label>
                <Select
                  value={payForm.operator}
                  onValueChange={(v) => setPayForm({ ...payForm, operator: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IKEEPAY_OPERATORS.map((op) => (
                      <SelectItem key={op.code} value={op.code}>
                        {op.label} ({op.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Numéro de téléphone (sans indicatif) *</Label>
                <div className="flex gap-2">
                  <div className="px-3 flex items-center rounded-md border bg-muted text-sm font-mono shrink-0">
                    {selectedCountry.dialCode}
                  </div>
                  <Input
                    value={payForm.localPhone}
                    onChange={(e) => setPayForm({ ...payForm, localPhone: e.target.value })}
                    placeholder="0700000000"
                    required
                  />
                </div>
              </div>

              <div>
                <Label>Email (reçu)</Label>
                <Input
                  type="email"
                  value={payForm.customerEmail}
                  onChange={(e) => setPayForm({ ...payForm, customerEmail: e.target.value })}
                  placeholder="client@example.com"
                />
              </div>

              <div>
                <Label>Code OTP <span className="text-xs text-muted-foreground font-normal">(si requis, ex: Orange BF)</span></Label>
                <Input
                  value={payForm.otp}
                  onChange={(e) => setPayForm({ ...payForm, otp: e.target.value })}
                  placeholder="123456"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setPayDialog(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={paying}>
                  {paying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Payer {selectedPlan ? formatCurrency(selectedPlan.price, selectedPlan.currency || 'XOF') : ''}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
