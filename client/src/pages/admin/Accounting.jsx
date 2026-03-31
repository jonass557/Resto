import { useState, useEffect } from 'react';
import { accountingAPI, readCache } from '@/services/api';
import TopBar from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { Loader2, Plus, TrendingUp, TrendingDown, Wallet, BookOpen, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Accounting() {
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [journal, setJournal] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return readCache('/accounting/journal', { startDate: sd, endDate: ed })?.data?.data || null;
  });
  const [balance, setBalance] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return readCache('/accounting/balance', { startDate: sd, endDate: ed })?.data?.data || null;
  });
  const [expenses, setExpenses] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return readCache('/accounting/expenses', { startDate: sd, endDate: ed })?.data?.data || [];
  });
  const [ledger, setLedger] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return readCache('/accounting/ledger', { startDate: sd, endDate: ed })?.data?.data || [];
  });
  const [loading, setLoading] = useState(() => {
    const sd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ed = new Date().toISOString().split('T')[0];
    return !readCache('/accounting/journal', { startDate: sd, endDate: ed }) || !readCache('/accounting/balance', { startDate: sd, endDate: ed });
  });
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'other', paymentMethod: 'cash', date: new Date().toISOString().split('T')[0] });
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    if (!readCache('/accounting/journal', { startDate, endDate })) setLoading(true);
    try {
      const [journalRes, balanceRes, expensesRes, ledgerRes] = await Promise.all([
        accountingAPI.getJournal({ startDate, endDate }),
        accountingAPI.getBalance({ startDate, endDate }),
        accountingAPI.getExpenses({ startDate, endDate }),
        accountingAPI.getLedger({ startDate, endDate })
      ]);
      setJournal(journalRes.data.data);
      setBalance(balanceRes.data.data);
      setExpenses(expensesRes.data.data);
      setLedger(ledgerRes.data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [startDate, endDate]);

  const handleExpenseSubmit = async () => {
    if (!expenseForm.description || !expenseForm.amount) { toast.error('Champs requis'); return; }
    setSubmitting(true);
    try {
      await accountingAPI.createExpense({ ...expenseForm, amount: parseFloat(expenseForm.amount) });
      toast.success('Dépense enregistrée');
      setExpenseDialog(false);
      setExpenseForm({ description: '', amount: '', category: 'other', paymentMethod: 'cash', date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch (error) {
      toast.error('Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const expenseCategories = [
    { value: 'food', label: 'Alimentation' }, { value: 'supplies', label: 'Fournitures' },
    { value: 'utilities', label: 'Services publics' }, { value: 'rent', label: 'Loyer' },
    { value: 'salary', label: 'Salaires' }, { value: 'maintenance', label: 'Maintenance' },
    { value: 'marketing', label: 'Marketing' }, { value: 'other', label: 'Autre' }
  ];

  if (loading) {
    return <div><TopBar title="Comptabilité" /><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></div>;
  }

  return (
    <div>
      <TopBar title="Comptabilité" />
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div><Label>Du</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label>Au</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <Button className="mt-5" onClick={() => setExpenseDialog(true)}><Plus className="w-4 h-4 mr-2" /> Dépense</Button>
        </div>

        {/* Balance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-green-200"><CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-600" /><span className="text-sm text-muted-foreground">Recettes</span></div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(balance?.totalRevenue || 0)}</p>
          </CardContent></Card>
          <Card className="border-red-200"><CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-red-600" /><span className="text-sm text-muted-foreground">Dépenses</span></div>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(balance?.totalExpenses || 0)}</p>
          </CardContent></Card>
          <Card className="border-orange-200"><CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-orange-600" /><span className="text-sm text-muted-foreground">Remboursements</span></div>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(balance?.totalRefunds || 0)}</p>
          </CardContent></Card>
          <Card className="border-blue-200"><CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-blue-600" /><span className="text-sm text-muted-foreground">Résultat net</span></div>
            <p className={`text-2xl font-bold ${(balance?.netIncome || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(balance?.netIncome || 0)}</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="journal">
          <TabsList>
            <TabsTrigger value="journal">Journal comptable</TabsTrigger>
            <TabsTrigger value="expenses">Dépenses</TabsTrigger>
            <TabsTrigger value="ledger">Grand livre</TabsTrigger>
            <TabsTrigger value="balance">Balance</TabsTrigger>
          </TabsList>

          <TabsContent value="journal" className="space-y-3 mt-4">
            <div className="text-sm text-muted-foreground mb-2">
              Total Débit: {formatCurrency(journal?.summary?.totalDebit || 0)} | Total Crédit: {formatCurrency(journal?.summary?.totalCredit || 0)} | Solde: {formatCurrency(journal?.summary?.balance || 0)}
            </div>
            {journal?.entries?.map((entry, i) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${entry.type === 'revenue' ? 'bg-green-500' : entry.type === 'expense' ? 'bg-red-500' : 'bg-orange-500'}`} />
                    <div>
                      <p className="font-medium">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(entry.date)} {entry.reference && `| Réf: ${entry.reference}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={entry.type === 'revenue' ? 'default' : 'destructive'}>
                      {entry.type === 'revenue' ? 'Recette' : entry.type === 'expense' ? 'Dépense' : 'Remboursement'}
                    </Badge>
                    {entry.debit > 0 && <span className="text-green-600 font-medium">+{formatCurrency(entry.debit)}</span>}
                    {entry.credit > 0 && <span className="text-red-600 font-medium">-{formatCurrency(entry.credit)}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="expenses" className="space-y-3 mt-4">
            {expenses.map(expense => (
              <Card key={expense._id}>
                <CardContent className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(expense.date)} | {expense.agent?.firstName} {expense.agent?.lastName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{expenseCategories.find(c => c.value === expense.category)?.label || expense.category}</Badge>
                    <span className="font-bold text-red-600">{formatCurrency(expense.amount)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="ledger" className="space-y-2 mt-4">
            {ledger.map((entry, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                <div>
                  <p className="font-medium">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(entry.date)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={entry.type === 'revenue' ? 'text-green-600' : 'text-red-600'}>
                    {entry.type === 'revenue' ? '+' : '-'}{formatCurrency(entry.amount)}
                  </span>
                  <span className="font-bold">{formatCurrency(entry.balance)}</span>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="balance" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Répartition des dépenses</CardTitle></CardHeader>
              <CardContent>
                {balance?.expensesByCategory && Object.keys(balance.expensesByCategory).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(balance.expensesByCategory).map(([cat, amount]) => (
                      <div key={cat} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="font-medium">{expenseCategories.find(c => c.value === cat)?.label || cat}</span>
                        <span className="font-bold">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">Aucune donnée</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Expense Dialog */}
      <Dialog open={expenseDialog} onOpenChange={setExpenseDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle dépense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Description *</Label><Input value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} /></div>
            <div><Label>Montant *</Label><Input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} /></div>
            <div><Label>Catégorie</Label>
              <Select value={expenseForm.category} onValueChange={v => setExpenseForm({...expenseForm, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{expenseCategories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Mode de paiement</Label>
              <Select value={expenseForm.paymentMethod} onValueChange={v => setExpenseForm({...expenseForm, paymentMethod: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="card">Carte</SelectItem>
                  <SelectItem value="transfer">Virement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialog(false)}>Annuler</Button>
            <Button onClick={handleExpenseSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
