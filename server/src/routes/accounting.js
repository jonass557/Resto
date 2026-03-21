const express = require('express');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Ticket = require('../models/Ticket');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/accounting/journal - Accounting journal
router.get('/journal', auth, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const end = endDate ? new Date(endDate) : new Date();

    const entries = [];

    // Revenues (payments)
    if (!type || type === 'revenue') {
      const payments = await Payment.find({
        createdAt: { $gte: start, $lte: end }, status: 'completed'
      }).populate('agent', 'firstName lastName').populate('ticket', 'ticketNumber');

      for (const p of payments) {
        entries.push({
          date: p.createdAt,
          type: 'revenue',
          description: `Paiement ${p.paymentNumber}`,
          reference: p.ticket?.ticketNumber || '',
          debit: p.amount,
          credit: 0,
          method: p.method,
          agent: p.agent
        });
      }
    }

    // Expenses
    if (!type || type === 'expense') {
      const expenses = await Expense.find({
        date: { $gte: start, $lte: end }
      }).populate('agent', 'firstName lastName');

      for (const e of expenses) {
        entries.push({
          date: e.date,
          type: 'expense',
          description: e.description,
          reference: e.reference,
          debit: 0,
          credit: e.amount,
          category: e.category,
          agent: e.agent
        });
      }
    }

    // Refunds
    if (!type || type === 'refund') {
      const refunds = await Payment.find({
        createdAt: { $gte: start, $lte: end }, status: 'refunded'
      }).populate('agent', 'firstName lastName');

      for (const r of refunds) {
        entries.push({
          date: r.updatedAt,
          type: 'refund',
          description: `Remboursement ${r.paymentNumber}`,
          reference: r.paymentNumber,
          debit: 0,
          credit: r.amount,
          agent: r.agent
        });
      }
    }

    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

    res.json({
      success: true,
      data: {
        entries,
        summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounting/revenue
router.get('/revenue', auth, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const end = endDate ? new Date(endDate) : new Date();

    const payments = await Payment.find({
      createdAt: { $gte: start, $lte: end }, status: 'completed'
    }).populate('agent', 'firstName lastName');

    const byDay = {};
    for (const p of payments) {
      const day = p.createdAt.toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { date: day, total: 0, count: 0 };
      byDay[day].total += p.amount;
      byDay[day].count++;
    }

    res.json({
      success: true,
      data: {
        payments,
        daily: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
        total: payments.reduce((sum, p) => sum + p.amount, 0)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Expenses CRUD
router.get('/expenses', auth, async (req, res) => {
  try {
    const { category, startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const total = await Expense.countDocuments(filter);
    const expenses = await Expense.find(filter)
      .populate('agent', 'firstName lastName')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: expenses,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/expenses', auth, async (req, res) => {
  try {
    const expense = new Expense({ ...req.body, agent: req.user._id });
    await expense.save();
    await expense.populate('agent', 'firstName lastName');
    const io = req.app.get('io');
    io.emit('expense:created', expense);
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/expenses/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('agent', 'firstName lastName');
    if (!expense) return res.status(404).json({ success: false, message: 'Dépense non trouvée' });
    res.json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/expenses/:id', auth, adminOnly, async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Dépense supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounting/balance - Balance sheet
router.get('/balance', auth, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const end = endDate ? new Date(endDate) : new Date();

    const [payments, refunds, expenses] = await Promise.all([
      Payment.find({ createdAt: { $gte: start, $lte: end }, status: 'completed' }),
      Payment.find({ createdAt: { $gte: start, $lte: end }, status: 'refunded' }),
      Expense.find({ date: { $gte: start, $lte: end } })
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalRefunds = refunds.reduce((sum, p) => sum + p.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const expensesByCategory = {};
    for (const e of expenses) {
      if (!expensesByCategory[e.category]) expensesByCategory[e.category] = 0;
      expensesByCategory[e.category] += e.amount;
    }

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalRefunds,
        totalExpenses,
        netIncome: totalRevenue - totalRefunds - totalExpenses,
        expensesByCategory
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounting/ledger - Grand livre
router.get('/ledger', auth, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear(), 0, 1));
    const end = endDate ? new Date(endDate) : new Date();

    const [payments, expenses] = await Promise.all([
      Payment.find({ createdAt: { $gte: start, $lte: end } })
        .populate('agent', 'firstName lastName').sort({ createdAt: 1 }),
      Expense.find({ date: { $gte: start, $lte: end } })
        .populate('agent', 'firstName lastName').sort({ date: 1 })
    ]);

    let runningBalance = 0;
    const ledger = [];

    const allEntries = [
      ...payments.map(p => ({
        date: p.createdAt,
        type: p.status === 'refunded' ? 'refund' : 'revenue',
        description: `${p.status === 'refunded' ? 'Remboursement' : 'Paiement'} ${p.paymentNumber}`,
        amount: p.amount,
        method: p.method,
        agent: p.agent
      })),
      ...expenses.map(e => ({
        date: e.date,
        type: 'expense',
        description: e.description,
        amount: e.amount,
        category: e.category,
        agent: e.agent
      }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const entry of allEntries) {
      if (entry.type === 'revenue') runningBalance += entry.amount;
      else runningBalance -= entry.amount;
      ledger.push({ ...entry, balance: runningBalance });
    }

    res.json({ success: true, data: ledger });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
