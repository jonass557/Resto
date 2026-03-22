import { useState, useMemo } from 'react';
import { paymentsAPI } from '@/services/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Plus, Trash2, Loader2, Banknote, Smartphone, CreditCard as CardIcon, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Espèces', icon: Banknote, color: 'text-green-600' },
  { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone, color: 'text-blue-600' },
  { value: 'card', label: 'Carte bancaire', icon: CardIcon, color: 'text-purple-600' },
];

const MOBILE_PROVIDERS = [
  { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'orange_money', label: 'Orange Money' },
];

export default function PaymentDialog({ open, onOpenChange, invoice, onSuccess, deliveryInfo }) {
  const [paymentLines, setPaymentLines] = useState([{ method: 'cash', amount: '', provider: 'mtn_momo', phone: '', ref: '' }]);
  const [submitting, setSubmitting] = useState(false);

  const total = invoice?.total || 0;

  const totalEntered = useMemo(() => {
    return paymentLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  }, [paymentLines]);

  const remaining = Math.max(0, total - totalEntered);
  const overpaid = Math.max(0, totalEntered - total);
  const isValid = totalEntered >= total;

  const addLine = () => {
    setPaymentLines(prev => [...prev, { method: 'mobile_money', amount: '', provider: 'mtn_momo', phone: '', ref: '' }]);
  };

  const removeLine = (idx) => {
    if (paymentLines.length <= 1) return;
    setPaymentLines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx, field, value) => {
    setPaymentLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const fillRemaining = (idx) => {
    const othersTotal = paymentLines.reduce((sum, l, i) => i === idx ? sum : sum + (parseFloat(l.amount) || 0), 0);
    const rem = Math.max(0, total - othersTotal);
    updateLine(idx, 'amount', rem.toString());
  };

  const resetState = () => {
    setPaymentLines([{ method: 'cash', amount: '', provider: 'mtn_momo', phone: '', ref: '' }]);
    setSubmitting(false);
  };

  const handleClose = (val) => {
    if (!val) resetState();
    onOpenChange(val);
  };

  const processPayment = async () => {
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
      toast.success('Paiement effectué !');
      resetState();
      onSuccess?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erreur paiement');
    } finally {
      setSubmitting(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Paiement — {invoice.ticketNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Delivery info if applicable */}
          {deliveryInfo?.clientName && (
            <div className="p-2 rounded-lg bg-blue-50 text-sm">
              <p className="font-medium">{deliveryInfo.clientName}</p>
              <p className="text-muted-foreground">{deliveryInfo.phone} {deliveryInfo.address && `| ${deliveryInfo.address}`}</p>
            </div>
          )}

          {/* Invoice items */}
          <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
            {invoice.items?.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.quantity}x {item.name}</span>
                <span>{formatCurrency(item.totalPrice)}</span>
              </div>
            ))}
            <Separator className="my-2" />
            <div className="flex justify-between font-bold text-base">
              <span>Total à payer</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Payment lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Modes de paiement</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-3 h-3 mr-1" /> Ajouter
              </Button>
            </div>

            {paymentLines.map((line, idx) => {
              const methodInfo = METHOD_OPTIONS.find(m => m.value === line.method);
              const Icon = methodInfo?.icon || Banknote;
              return (
                <div key={idx} className="p-3 border rounded-lg space-y-2 bg-card">
                  <div className="flex items-center gap-2">
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
                    <div className="flex-1">
                      <div className="relative">
                        <Input
                          type="number"
                          placeholder="Montant"
                          value={line.amount}
                          onChange={e => updateLine(idx, 'amount', e.target.value)}
                          className="h-9 pr-16"
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
                    </div>
                    {paymentLines.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeLine(idx)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Mobile money fields */}
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
                      <Input
                        placeholder="N° téléphone"
                        value={line.phone}
                        onChange={e => updateLine(idx, 'phone', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}

                  {/* Reference for card or mobile */}
                  {(line.method === 'card' || line.method === 'mobile_money') && (
                    <Input
                      placeholder="Réf. transaction (optionnel)"
                      value={line.ref}
                      onChange={e => updateLine(idx, 'ref', e.target.value)}
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="p-3 rounded-lg border space-y-1">
            {paymentLines.filter(l => parseFloat(l.amount) > 0).map((l, i) => {
              const m = METHOD_OPTIONS.find(o => o.value === l.method);
              return (
                <div key={i} className="flex justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <m.icon className={`w-3 h-3 ${m.color}`} />
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
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>Reste à payer : {formatCurrency(remaining)}</span>
              </div>
            )}
            {overpaid > 0 && paymentLines.some(l => l.method === 'cash') && (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span>Monnaie à rendre : {formatCurrency(overpaid)}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Annuler</Button>
          <Button onClick={processPayment} disabled={submitting || !isValid}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Valider le paiement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
