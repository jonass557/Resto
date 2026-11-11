import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Wallet, ArrowDownToLine, ArrowUpRight, RefreshCw, Loader2, TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '@/services/api';
import { COUNTRIES, IKEEPAY_OPERATORS } from '@/data/countries';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export default function SuperAdminPayments() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    totalPayouts: 0,
    pendingPayoutAmount: 0,
    availableBalance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    amount: '',
    currency: 'XOF',
    country: 'CI',
    localPhone: '',
    operator: 'ORANGE',
  });
  const [submitting, setSubmitting] = useState(false);
  const [verifyingRef, setVerifyingRef] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [txRes, settingsRes] = await Promise.all([
        superAdminAPI.getTransactions({ type: typeFilter }),
        superAdminAPI.getSettings(),
      ]);
      const data = txRes.data.data || {};
      setTransactions(data.transactions || []);
      setSummary(data.summary || { totalRevenue: 0, totalPayouts: 0, pendingPayoutAmount: 0, availableBalance: 0 });
      const ps = settingsRes.data?.data?.payoutSettings;
      if (ps) {
        setPayoutForm(prev => ({
          ...prev,
          country: ps.country || prev.country,
          operator: ps.operator || prev.operator,
          localPhone: ps.phoneNumber || prev.localPhone,
          currency: settingsRes.data?.data?.defaultCurrency || prev.currency,
        }));
      }
    } catch {
      toast.error('Erreur chargement des paiements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [typeFilter]);

  const selectedCountry = COUNTRIES.find(c => c.code === payoutForm.country) || COUNTRIES[0];

  const handlePayoutSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(payoutForm.amount);
    const cleanLocal = payoutForm.localPhone.replace(/\D/g, '');
    if (!amount || amount <= 0 || !cleanLocal) {
      toast.error('Montant et numéro de téléphone requis');
      return;
    }
    const dialDigits = selectedCountry.dialCode.replace(/\D/g, '');
    const fullPhone = cleanLocal.startsWith(dialDigits) ? cleanLocal : `${dialDigits}${cleanLocal}`;

    setSubmitting(true);
    try {
      const res = await superAdminAPI.payout({
        amount,
        currency: payoutForm.currency || 'XOF',
        country: payoutForm.country,
        phoneNumber: fullPhone,
        operator: payoutForm.operator,
      });
      toast.success(res.data?.message || 'Retrait effectué');
      setPayoutOpen(false);
      setPayoutForm(prev => ({ ...prev, amount: '' }));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors du retrait iKeepay');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (reference) => {
    setVerifyingRef(reference);
    try {
      await superAdminAPI.verifyTransaction(reference);
      toast.success('Statut actualisé');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur vérification');
    } finally {
      setVerifyingRef('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" /> Paiements & Retraits iKeepay
          </h1>
          <p className="text-sm text-muted-foreground">
            Encaissements des abonnements restaurants et retraits Mobile Money vers votre compte.
          </p>
        </div>
        <Button onClick={() => setPayoutOpen(true)}>
          <ArrowUpRight className="w-4 h-4 mr-2" /> Retirer des fonds (Payout)
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-green-600" /> Total Encaissements
            </p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {formatCurrency(summary.totalRevenue, 'XOF')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <ArrowDownToLine className="w-4 h-4 text-blue-600" /> Total Retiré
            </p>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(summary.totalPayouts, 'XOF')}
            </p>
            {summary.pendingPayoutAmount > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                {formatCurrency(summary.pendingPayoutAmount, 'XOF')} en attente
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-primary" /> Solde Disponible
            </p>
            <p className="text-2xl font-bold text-primary mt-1">
              {formatCurrency(summary.availableBalance, 'XOF')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Journal des transactions</CardTitle>
          <div className="flex gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes (Payin & Payout)</SelectItem>
                <SelectItem value="payin">Encaissements (Payin)</SelectItem>
                <SelectItem value="payout">Retraits (Payout)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData}>Actualiser</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Aucune transaction trouvée.</p>
          ) : (
            <div className="space-y-2.5">
              {transactions.map((tx) => (
                <div key={tx._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border text-sm">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={tx.type === 'payout' ? 'outline' : 'secondary'}>
                        {tx.type === 'payout' ? 'Retrait' : 'Abonnement'}
                      </Badge>
                      <span className="font-bold">
                        {formatCurrency(tx.amount, tx.currency)}
                      </span>
                      <span className="text-muted-foreground">
                        • {tx.type === 'payin' ? (tx.restaurant?.name || 'Restaurant') : 'Compte Admin'}
                        {tx.plan?.name ? ` (${tx.plan.name})` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Réf: {tx.externalReference}
                      {tx.providerReference ? ` (${tx.providerReference})` : ''} • {tx.operator} ({tx.phoneNumber}) • {formatDateTime(tx.createdAt)}
                    </p>
                    {tx.failureReason && (
                      <p className="text-xs text-red-600">{tx.failureReason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={tx.status === 'completed' ? 'default' : tx.status === 'failed' ? 'destructive' : 'secondary'}>
                      {tx.status === 'completed' ? 'Validé' : tx.status === 'failed' ? 'Échoué' : 'En attente'}
                    </Badge>
                    {tx.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={verifyingRef === tx.externalReference}
                        onClick={() => handleVerify(tx.externalReference)}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout Modal */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Effectuer un retrait iKeepay</DialogTitle>
            <DialogDescription>
              Solde disponible estimé : {formatCurrency(summary.availableBalance, 'XOF')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePayoutSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Montant *</Label>
                <Input
                  type="number"
                  min="100"
                  value={payoutForm.amount}
                  onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                  placeholder="5000"
                  required
                />
              </div>
              <div>
                <Label>Devise</Label>
                <Input
                  value={payoutForm.currency}
                  onChange={(e) => setPayoutForm({ ...payoutForm, currency: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div>
              <Label>Pays</Label>
              <Select value={payoutForm.country} onValueChange={(v) => setPayoutForm({ ...payoutForm, country: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Select value={payoutForm.operator} onValueChange={(v) => setPayoutForm({ ...payoutForm, operator: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IKEEPAY_OPERATORS.map((op) => (
                    <SelectItem key={op.code} value={op.code}>{op.label} ({op.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Numéro bénéficiaire (sans indicatif) *</Label>
              <div className="flex gap-2">
                <div className="px-3 flex items-center rounded-md border bg-muted text-sm font-mono shrink-0">
                  {selectedCountry.dialCode}
                </div>
                <Input
                  value={payoutForm.localPhone}
                  onChange={(e) => setPayoutForm({ ...payoutForm, localPhone: e.target.value })}
                  placeholder="0700000000"
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setPayoutOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Lancer le retrait
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
