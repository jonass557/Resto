import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ticketsAPI, paymentsAPI } from '@/services/api';
import { usePrinter } from '@/contexts/PrinterContext';
import TopBar from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowLeft, BookMarked, CreditCard, Loader2, Plus, Trash2,
  Banknote, Smartphone, AlertCircle, CheckCircle, UtensilsCrossed, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Espèces', icon: Banknote, color: 'text-green-600' },
  { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone, color: 'text-blue-600' },
  { value: 'card', label: 'Carte bancaire', icon: CreditCard, color: 'text-purple-600' },
];

const MOBILE_PROVIDERS = [
  { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'orange_money', label: 'Orange Money' },
];

export default function BillingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { printTicketById } = usePrinter();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);

  const [paymentLines, setPaymentLines] = useState([
    { method: 'cash', amount: '', provider: 'mtn_momo', phone: '', ref: '' }
  ]);

  const loadInvoice = useCallback(async () => {
    try {
      const { data } = await ticketsAPI.getById(id);
      if (data.data.isPaid) {
        toast('Cette facture est déjà payée', { icon: 'ℹ️' });
        navigate('/agent/restaurant');
        return;
      }
      setInvoice(data.data);
      // Pre-fill first payment line with total
      setPaymentLines([{ method: 'cash', amount: String(data.data.total), provider: 'mtn_momo', phone: '', ref: '' }]);
    } catch {
      toast.error('Facture introuvable');
      navigate('/agent/restaurant');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  const total = invoice?.total || 0;

  const totalEntered = useMemo(() =>
    paymentLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0),
  [paymentLines]);

  const remaining = Math.max(0, total - totalEntered);
  const overpaid = Math.max(0, totalEntered - total);
  const isValid = totalEntered >= total;

  const addLine = () => setPaymentLines(prev => [
    ...prev, { method: 'mobile_money', amount: '', provider: 'mtn_momo', phone: '', ref: '' }
  ]);

  const removeLine = (idx) => {
    if (paymentLines.length <= 1) return;
    setPaymentLines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx, field, value) =>
    setPaymentLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));

  const fillRemaining = (idx) => {
    const others = paymentLines.reduce((s, l, i) => i === idx ? s : s + (parseFloat(l.amount) || 0), 0);
    updateLine(idx, 'amount', String(Math.max(0, total - others)));
  };

  // ── Mémo: save to "À Encaisser" ──
  const handleMemo = async () => {
    setMemoLoading(true);
    try {
      await ticketsAPI.moveToAEncaisser(id);
      toast.success('Facture mise en attente d\'encaissement');
      navigate('/agent/a-encaisser');
    } catch {
      toast.error('Erreur mémo');
    } finally {
      setMemoLoading(false);
    }
  };

  // ── Confirm payment + auto-print ──
  const handlePay = async () => {
    if (!invoice || !isValid) return;
    setSubmitting(true);
    try {
      const activeMethods = paymentLines.filter(l => parseFloat(l.amount) > 0);
      let payload;

      if (activeMethods.length === 1) {
        const line = activeMethods[0];
        payload = {
          ticketId: invoice._id,
          method: line.method,
          amountReceived: parseFloat(line.amount),
          mobileMoneyProvider: line.method === 'mobile_money' ? line.provider : 'none',
          mobileMoneyNumber: line.method === 'mobile_money' ? line.phone : '',
          transactionRef: line.ref || '',
          notes: ''
        };
      } else {
        payload = {
          ticketId: invoice._id,
          method: 'mixed',
          amountReceived: totalEntered,
          mixedPayments: activeMethods.map(l => ({
            method: l.method,
            amount: parseFloat(l.amount),
            reference: l.method === 'mobile_money' ? `${l.provider}|${l.phone}|${l.ref}` : l.ref || ''
          })),
          notes: ''
        };
      }

      await paymentsAPI.create(payload);
      toast.success('Paiement confirmé !');

      // Auto-print
      try {
        await printTicketById(invoice._id);
        await ticketsAPI.markPrinted(invoice._id);
        toast('🖨️ Reçu envoyé à l\'impression', { icon: '🧾', duration: 3000 });
      } catch {
        toast('Impression échouée — paiement enregistré', { icon: '⚠️', duration: 4000 });
      }

      navigate('/agent/restaurant');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur paiement');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <TopBar title="Facturation" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="flex flex-col bg-background" style={{ height: 'var(--vvh, 100dvh)', overflow: 'hidden' }}>
      <TopBar title={`Facturation — ${invoice.ticketNumber}`} />

      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Invoice header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold">{invoice.ticketNumber}</p>
              <p className="text-xs text-muted-foreground">
                Table {invoice.tableNumber || invoice.table?.number || '—'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="ml-auto">En attente</Badge>
        </div>

        {/* Items summary */}
        <div className="bg-muted rounded-xl p-4 space-y-1.5 text-sm">
          {invoice.items?.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.quantity}× {item.name}</span>
              <span className="font-medium">{formatCurrency(item.totalPrice)}</span>
            </div>
          ))}
          <Separator className="my-2" />
          <div className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Payment lines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-semibold">Modes de paiement</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-3 h-3 mr-1" /> Ajouter
            </Button>
          </div>

          {paymentLines.map((line, idx) => {
            const methodInfo = METHOD_OPTIONS.find(m => m.value === line.method);
            return (
              <div key={idx} className="p-3 border rounded-xl space-y-2 bg-card">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={line.method} onValueChange={v => updateLine(idx, 'method', v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METHOD_OPTIONS.map(m => (
                          <SelectItem key={m.value} value={m.value}>
                            <span className="flex items-center gap-2">
                              <m.icon className={`w-4 h-4 ${m.color}`} />
                              {m.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 relative">
                    <Input
                      type="number"
                      placeholder="Montant"
                      value={line.amount}
                      onChange={e => updateLine(idx, 'amount', e.target.value)}
                      className="h-9 pr-14"
                      min="0"
                    />
                    <button
                      type="button"
                      onClick={() => fillRemaining(idx)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded hover:bg-primary/20"
                    >
                      Reste
                    </button>
                  </div>
                  {paymentLines.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0" onClick={() => removeLine(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {line.method === 'mobile_money' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={line.provider} onValueChange={v => updateLine(idx, 'provider', v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOBILE_PROVIDERS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="N° téléphone (optionnel)" value={line.phone}
                      onChange={e => updateLine(idx, 'phone', e.target.value)} className="h-8 text-xs" />
                  </div>
                )}

                {(line.method === 'card' || line.method === 'mobile_money') && (
                  <Input placeholder="Réf. transaction (optionnel)" value={line.ref}
                    onChange={e => updateLine(idx, 'ref', e.target.value)} className="h-8 text-xs" />
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="p-3 rounded-xl border space-y-1.5 text-sm">
          {paymentLines.filter(l => parseFloat(l.amount) > 0).map((l, i) => {
            const m = METHOD_OPTIONS.find(o => o.value === l.method);
            return (
              <div key={i} className="flex justify-between">
                <span className="flex items-center gap-1.5">
                  <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                  {m.label}
                  {l.method === 'mobile_money' && l.provider && (
                    <span className="text-xs text-muted-foreground">
                      ({MOBILE_PROVIDERS.find(p => p.value === l.provider)?.label})
                    </span>
                  )}
                </span>
                <span className="font-medium">{formatCurrency(parseFloat(l.amount))}</span>
              </div>
            );
          })}
          <Separator />
          <div className="flex justify-between font-bold">
            <span>Total payé</span>
            <span className={isValid ? 'text-green-600' : 'text-red-600'}>{formatCurrency(totalEntered)}</span>
          </div>
          {remaining > 0 && (
            <div className="flex items-center gap-1 text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Reste à payer : {formatCurrency(remaining)}</span>
            </div>
          )}
          {overpaid > 0 && paymentLines.some(l => l.method === 'cash') && (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Monnaie à rendre : {formatCurrency(overpaid)}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3 pb-6">
          <Button
            variant="outline"
            className="h-12"
            onClick={handleMemo}
            disabled={memoLoading || submitting}
          >
            {memoLoading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <BookMarked className="w-4 h-4 mr-2" />}
            Mémo
          </Button>

          <Button
            className="h-12"
            onClick={handlePay}
            disabled={submitting || memoLoading || !isValid}
          >
            {submitting
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Printer className="w-4 h-4 mr-2" />}
            Confirmer & Imprimer
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
