const express = require('express');
const CashRegister = require('../models/CashRegister');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { auth, caissierOnly, caissierOrAdmin } = require('../middleware/auth');
const { generateSessionNumber } = require('../utils/helpers');
const { invalidateStats } = require('../utils/statsCache');

const router = express.Router();

// GET /api/cash-register — list sessions (caissier or admin)
router.get('/', auth, async (req, res) => {
  try {
    const { agent, status, service, startDate, endDate } = req.query;
    const filter = {};
    if (agent) filter.agent = agent;
    if (status) filter.status = status;
    if (service) filter.service = parseInt(service);
    if (startDate || endDate) {
      filter.openedAt = {};
      if (startDate) filter.openedAt.$gte = new Date(startDate);
      if (endDate) filter.openedAt.$lte = new Date(endDate);
    }

    const sessions = await CashRegister.find(filter)
      .populate('agent', 'firstName lastName')
      .populate('openedBy', 'firstName lastName')
      .populate('closedBy', 'firstName lastName')
      .sort({ openedAt: -1 });
    res.json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/current — agent's current open session
router.get('/current', auth, async (req, res) => {
  try {
    const session = await CashRegister.findOne({ agent: req.user._id, status: 'open' })
      .populate('agent', 'firstName lastName')
      .populate('openedBy', 'firstName lastName')
      .populate('payments');
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/agents — list active agents for caissier
router.get('/agents', auth, caissierOnly, async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent', isActive: true }).select('firstName lastName email');
    // For each agent, check if they have an open session
    const result = [];
    for (const agent of agents) {
      const openSession = await CashRegister.findOne({ agent: agent._id, status: 'open' })
        .populate('openedBy', 'firstName lastName');
      result.push({
        _id: agent._id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        openSession: openSession ? {
          _id: openSession._id,
          sessionNumber: openSession.sessionNumber,
          service: openSession.service,
          openedAt: openSession.openedAt,
          openedBy: openSession.openedBy,
          openingAmount: openSession.openingAmount,
          totalSales: openSession.totalSales,
          totalCash: openSession.totalCash,
          totalCard: openSession.totalCard,
          totalMobileMoney: openSession.totalMobileMoney,
        } : null
      });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/agent-invoices/:agentId — factures d'un agent pour le service ouvert
router.get('/agent-invoices/:agentId', auth, caissierOnly, async (req, res) => {
  try {
    const session = await CashRegister.findOne({ agent: req.params.agentId, status: 'open' });
    if (!session) {
      return res.json({ success: true, data: { invoices: [], enCours: 0, aEncaisser: 0, paid: [] } });
    }

    const invoices = await Ticket.find({
      agent: req.params.agentId,
      type: 'invoice',
      createdAt: { $gte: session.openedAt }
    }).sort({ createdAt: -1 });

    const enCours = invoices.filter(t => !t.isPaid && t.memoStatus === 'en_cours');
    const aEncaisser = invoices.filter(t => !t.isPaid && t.memoStatus === 'a_encaisser');
    const paid = invoices.filter(t => t.isPaid);

    res.json({
      success: true,
      data: {
        invoices,
        enCours: enCours.length,
        aEncaisser: aEncaisser.length,
        paid,
        unpaidList: [...enCours, ...aEncaisser]
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/cash-register/open-service — caissier ouvre la caisse d'un agent
router.post('/open-service', auth, caissierOnly, async (req, res) => {
  try {
    const { agentId, service, openingAmount, notes } = req.body;
    if (!agentId || !service) {
      return res.status(400).json({ success: false, message: 'Agent et numéro de service requis' });
    }
    if (![1, 2].includes(service)) {
      return res.status(400).json({ success: false, message: 'Service invalide (1 ou 2)' });
    }

    const agent = await User.findOne({ _id: agentId, role: 'agent', isActive: true });
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent non trouvé' });
    }

    const existing = await CashRegister.findOne({ agent: agentId, status: 'open' });
    if (existing) {
      return res.status(400).json({ success: false, message: `Cet agent a déjà une caisse ouverte (Service ${existing.service})` });
    }

    const session = new CashRegister({
      sessionNumber: generateSessionNumber(),
      agent: agentId,
      openedBy: req.user._id,
      service,
      openingAmount: openingAmount || 0,
      notes: notes || ''
    });

    await session.save();
    await session.populate('agent', 'firstName lastName');
    await session.populate('openedBy', 'firstName lastName');

    const io = req.app.get('io');
    io.emit('cashRegister:opened', session);

    const notif = await Notification.create({
      type: 'cash_opened',
      title: 'Caisse ouverte',
      message: `Le caissier ${req.user.firstName} a ouvert le Service ${service} pour ${agent.firstName} ${agent.lastName}`,
      agent: agentId,
      data: { sessionId: session._id, sessionNumber: session.sessionNumber, service }
    });
    io.emit('notification:new', notif);

    res.status(201).json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/cash-register/close-service — caissier clôture la caisse d'un agent
router.post('/close-service', auth, caissierOnly, async (req, res) => {
  try {
    const { agentId, closingAmount, notes } = req.body;
    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Agent requis' });
    }

    const session = await CashRegister.findOne({ agent: agentId, status: 'open' });
    if (!session) {
      return res.status(400).json({ success: false, message: 'Aucune caisse ouverte pour cet agent' });
    }

    // Vérifier qu'il n'y a aucune facture impayée (en_cours ou a_encaisser)
    const unpaidTickets = await Ticket.find({
      agent: agentId,
      type: 'invoice',
      isPaid: false,
      createdAt: { $gte: session.openedAt }
    });

    if (unpaidTickets.length > 0) {
      const enCours = unpaidTickets.filter(t => t.memoStatus === 'en_cours');
      const aEncaisser = unpaidTickets.filter(t => t.memoStatus === 'a_encaisser');
      return res.status(400).json({
        success: false,
        message: `Impossible de clôturer. ${enCours.length} facture(s) en cours et ${aEncaisser.length} facture(s) à encaisser.`,
        unpaidCount: unpaidTickets.length,
        enCours: enCours.length,
        aEncaisser: aEncaisser.length,
        unpaidTickets: unpaidTickets.map(t => ({
          _id: t._id,
          ticketNumber: t.ticketNumber,
          tableNumber: t.tableNumber,
          total: t.total,
          memoStatus: t.memoStatus
        }))
      });
    }

    session.closingAmount = closingAmount || 0;
    session.difference = (closingAmount || 0) - session.expectedAmount;
    session.status = 'closed';
    session.closedAt = new Date();
    session.closedBy = req.user._id;
    if (notes) session.notes = notes;

    await session.save();
    await session.populate('agent', 'firstName lastName');
    await session.populate('closedBy', 'firstName lastName');

    const io = req.app.get('io');
    invalidateStats();
    io.emit('cashRegister:closed', session);

    const agent = await User.findById(agentId);
    const notif = await Notification.create({
      type: 'cash_closed',
      title: 'Caisse clôturée',
      message: `Le caissier ${req.user.firstName} a clôturé le Service ${session.service} de ${agent.firstName} ${agent.lastName} — Total: ${session.totalSales} FCFA`,
      agent: agentId,
      data: {
        sessionId: session._id, sessionNumber: session.sessionNumber,
        service: session.service, totalSales: session.totalSales,
        closingAmount, difference: session.difference
      }
    });
    io.emit('notification:new', notif);

    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/service-report/:agentId — factures payées + détail modes de paiement
router.get('/service-report/:agentId', auth, caissierOnly, async (req, res) => {
  try {
    const { sessionId } = req.query;
    let session;
    if (sessionId) {
      session = await CashRegister.findById(sessionId);
    } else {
      session = await CashRegister.findOne({ agent: req.params.agentId, status: 'open' });
    }
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session non trouvée' });
    }

    const paidInvoices = await Ticket.find({
      agent: req.params.agentId,
      type: 'invoice',
      isPaid: true,
      createdAt: { $gte: session.openedAt },
      ...(session.closedAt ? { createdAt: { $gte: session.openedAt, $lte: session.closedAt } } : {})
    }).populate('payment').sort({ createdAt: -1 });

    res.json({ success: true, data: { session, invoices: paidInvoices } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/global-report — facture globale de tous les agents d'un service
router.get('/global-report', auth, caissierOnly, async (req, res) => {
  try {
    const { service, date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const dayStart = new Date(targetDate.setHours(0, 0, 0, 0));
    const dayEnd = new Date(targetDate.setHours(23, 59, 59, 999));

    const filter = {
      openedAt: { $gte: dayStart, $lte: dayEnd },
      status: 'closed'
    };
    if (service) filter.service = parseInt(service);

    const sessions = await CashRegister.find(filter)
      .populate('agent', 'firstName lastName')
      .populate('openedBy', 'firstName lastName')
      .populate('closedBy', 'firstName lastName')
      .sort({ openedAt: -1 });

    // For each session, get paid invoices
    const report = [];
    for (const sess of sessions) {
      if (!sess.agent) continue; // agent supprimé, ignorer
      const dateFilter = { $gte: sess.openedAt };
      if (sess.closedAt) dateFilter.$lte = sess.closedAt;

      const invoices = await Ticket.find({
        agent: sess.agent._id,
        type: 'invoice',
        isPaid: true,
        createdAt: dateFilter
      });

      const totalAmount = invoices.reduce((s, i) => s + i.total, 0);
      report.push({
        session: sess,
        invoiceCount: invoices.length,
        totalAmount,
        totalCash: sess.totalCash,
        totalCard: sess.totalCard,
        totalMobileMoney: sess.totalMobileMoney
      });
    }

    const grandTotal = report.reduce((s, r) => s + r.totalAmount, 0);
    const totalInvoices = report.reduce((s, r) => s + r.invoiceCount, 0);

    res.json({ success: true, data: { report, grandTotal, totalInvoices } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/daily-detail — données complètes pour impression de la facture journalière
router.get('/daily-detail', auth, caissierOnly, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

    const sessions = await CashRegister.find({ openedAt: { $gte: dayStart, $lte: dayEnd }, status: 'closed' })
      .populate('agent', 'firstName lastName')
      .populate('openedBy', 'firstName lastName')
      .populate('closedBy', 'firstName lastName')
      .sort({ openedAt: 1 });

    let grandTotal = 0, grandCash = 0, grandCard = 0, grandMobile = 0, grandGiftCard = 0;
    let totalInvoices = 0;
    const detail = [];

    for (const sess of sessions) {
      if (!sess.agent) continue; // agent supprimé, ignorer la session
      const dateFilter = { $gte: sess.openedAt };
      if (sess.closedAt) dateFilter.$lte = sess.closedAt;

      const invoices = await Ticket.find({
        agent: sess.agent._id,
        type: 'invoice',
        isPaid: true,
        createdAt: dateFilter
      }).populate('payment').sort({ createdAt: 1 });

      const sessionTotal = invoices.reduce((s, i) => s + i.total, 0);
      grandTotal   += sessionTotal;
      grandCash    += sess.totalCash    || 0;
      grandCard    += sess.totalCard    || 0;
      grandMobile  += sess.totalMobileMoney || 0;
      grandGiftCard+= sess.totalGiftCard || 0;
      totalInvoices += invoices.length;

      detail.push({
        session: {
          _id: sess._id,
          sessionNumber: sess.sessionNumber,
          service: sess.service,
          agent: sess.agent,
          openedBy: sess.openedBy,
          closedBy: sess.closedBy,
          openedAt: sess.openedAt,
          closedAt: sess.closedAt,
          status: sess.status,
          openingAmount: sess.openingAmount,
          closingAmount: sess.closingAmount,
          expectedAmount: sess.expectedAmount,
          difference: sess.difference,
          totalSales: sess.totalSales,
          totalCash: sess.totalCash,
          totalCard: sess.totalCard,
          totalMobileMoney: sess.totalMobileMoney,
          totalGiftCard: sess.totalGiftCard,
          transactionCount: sess.transactionCount,
        },
        invoices: invoices.map(inv => ({
          _id: inv._id,
          ticketNumber: inv.ticketNumber,
          tableNumber: inv.tableNumber || '',
          orderType: inv.orderType,
          createdAt: inv.createdAt,
          items: inv.items,
          subtotal: inv.subtotal,
          taxAmount: inv.taxAmount,
          discount: inv.discount,
          total: inv.total,
          paymentMethod: inv.payment?.method || null,
          amountReceived: inv.payment?.amountReceived || 0,
          mixedPayments: inv.payment?.mixedPayments || [],
        })),
        totalAmount: sessionTotal,
      });
    }

    res.json({
      success: true,
      data: {
        date: dayStart,
        detail,
        grandTotal,
        grandCash,
        grandCard,
        grandMobile,
        grandGiftCard,
        totalInvoices,
        sessionCount: sessions.length,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/cash-register/close-all — clôturer toutes les caisses ouvertes d'un coup
router.post('/close-all', auth, caissierOnly, async (req, res) => {
  try {
    const openSessions = await CashRegister.find({ status: 'open' })
      .populate('agent', 'firstName lastName');

    if (openSessions.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune caisse ouverte' });
    }

    // Vérifier les factures impayées sur tous les agents
    const allUnpaid = [];
    for (const sess of openSessions) {
      if (!sess.agent) continue; // agent supprimé
      const unpaid = await Ticket.find({
        agent: sess.agent._id,
        type: 'invoice',
        isPaid: false,
        createdAt: { $gte: sess.openedAt }
      });
      allUnpaid.push(...unpaid);
    }

    if (allUnpaid.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Clôture impossible — ${allUnpaid.length} facture(s) impayée(s) en attente.`,
        unpaidCount: allUnpaid.length,
      });
    }

    const now = new Date();
    for (const sess of openSessions) {
      if (!sess.agent) continue; // agent supprimé, ignorer
      sess.status = 'closed';
      sess.closedAt = now;
      sess.closedBy = req.user._id;
      sess.difference = (sess.closingAmount || 0) - sess.expectedAmount;
      await sess.save();
    }

    const io = req.app.get('io');
    io.emit('cashRegister:closed', { closedCount: openSessions.length });

    const notif = await Notification.create({
      type: 'cash_closed',
      title: 'Clôture journalière',
      message: `${req.user.firstName} a clôturé ${openSessions.length} caisse(s) — Fin de journée`,
      data: { closedCount: openSessions.length }
    });
    io.emit('notification:new', notif);

    res.json({
      success: true,
      message: `${openSessions.length} caisse(s) clôturée(s)`,
      data: { closedCount: openSessions.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const session = await CashRegister.findById(req.params.id)
      .populate('agent', 'firstName lastName')
      .populate('openedBy', 'firstName lastName')
      .populate('closedBy', 'firstName lastName')
      .populate({ path: 'payments', populate: { path: 'ticket' } });
    if (!session) return res.status(404).json({ success: false, message: 'Session non trouvée' });
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
