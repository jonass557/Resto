const express = require('express');
const CashRegister = require('../models/CashRegister');
const Ticket = require('../models/Ticket');
const { auth } = require('../middleware/auth');
const { generateSessionNumber } = require('../utils/helpers');

const router = express.Router();

// GET /api/cash-register - Get all sessions
router.get('/', auth, async (req, res) => {
  try {
    const { agent, status, startDate, endDate } = req.query;
    const filter = {};
    if (agent) filter.agent = agent;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.openedAt = {};
      if (startDate) filter.openedAt.$gte = new Date(startDate);
      if (endDate) filter.openedAt.$lte = new Date(endDate);
    }

    const sessions = await CashRegister.find(filter)
      .populate('agent', 'firstName lastName')
      .sort({ openedAt: -1 });
    res.json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/current - Get current open session for agent
router.get('/current', auth, async (req, res) => {
  try {
    const session = await CashRegister.findOne({ agent: req.user._id, status: 'open' })
      .populate('agent', 'firstName lastName')
      .populate('payments');
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/cash-register/open
router.post('/open', auth, async (req, res) => {
  try {
    const { openingAmount, notes } = req.body;

    // Check if already open
    const existing = await CashRegister.findOne({ agent: req.user._id, status: 'open' });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà une caisse ouverte' });
    }

    const session = new CashRegister({
      sessionNumber: generateSessionNumber(),
      agent: req.user._id,
      openingAmount: openingAmount || 0,
      notes: notes || ''
    });

    await session.save();
    await session.populate('agent', 'firstName lastName');

    const io = req.app.get('io');
    io.emit('cashRegister:opened', session);

    res.status(201).json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/cash-register/close
router.post('/close', auth, async (req, res) => {
  try {
    const { closingAmount, notes } = req.body;

    const session = await CashRegister.findOne({ agent: req.user._id, status: 'open' });
    if (!session) {
      return res.status(400).json({ success: false, message: 'Aucune caisse ouverte' });
    }

    // Vérifier qu'aucun ticket n'est impayé pour cet agent depuis l'ouverture de la caisse
    const unpaidTickets = await Ticket.find({
      agent: req.user._id,
      isPaid: false,
      createdAt: { $gte: session.openedAt }
    }).populate('table', 'number name');

    if (unpaidTickets.length > 0) {
      const ticketDetails = unpaidTickets.map(t =>
        `${t.ticketNumber} (Table ${t.table?.number || '?'})`
      ).join(', ');
      return res.status(400).json({
        success: false,
        message: `Impossible de clôturer la caisse. ${unpaidTickets.length} ticket(s) impayé(s) : ${ticketDetails}. Tous les tickets doivent être validés avant la clôture.`,
        unpaidTickets: unpaidTickets.map(t => ({
          _id: t._id,
          ticketNumber: t.ticketNumber,
          table: t.table,
          total: t.total,
          type: t.type
        })),
        unpaidCount: unpaidTickets.length
      });
    }

    session.closingAmount = closingAmount || 0;
    session.difference = closingAmount - session.expectedAmount;
    session.status = 'closed';
    session.closedAt = new Date();
    if (notes) session.notes = notes;

    await session.save();
    await session.populate('agent', 'firstName lastName');

    const io = req.app.get('io');
    io.emit('cashRegister:closed', session);

    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/cash-register/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const session = await CashRegister.findById(req.params.id)
      .populate('agent', 'firstName lastName')
      .populate({ path: 'payments', populate: { path: 'ticket' } });
    if (!session) return res.status(404).json({ success: false, message: 'Session non trouvée' });
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
