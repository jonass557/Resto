const express = require('express');
const Client = require('../models/Client');
const Ticket = require('../models/Ticket');
const Payment = require('../models/Payment');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/clients
router.get('/', auth, async (req, res) => {
  try {
    const { search, type, category, group, page = 1, limit = 50 } = req.query;
    const filter = { isActive: true };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (group) filter.group = group;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Client.countDocuments(filter);
    const clients = await Client.find(filter)
      .sort({ lastName: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: clients,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/clients/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: 'Client non trouvé' });
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/clients/:id/history
router.get('/:id/history', auth, async (req, res) => {
  try {
    const tickets = await Ticket.find({ client: req.params.id })
      .populate('table', 'number name')
      .populate('agent', 'firstName lastName')
      .sort({ createdAt: -1 });

    const payments = await Payment.find({ client: req.params.id })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { tickets, payments } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/clients
router.post('/', auth, async (req, res) => {
  try {
    const client = new Client(req.body);
    await client.save();
    const io = req.app.get('io');
    io.emit('client:created', client);
    res.status(201).json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/clients/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!client) return res.status(404).json({ success: false, message: 'Client non trouvé' });
    const io = req.app.get('io');
    io.emit('client:updated', client);
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await Client.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Client désactivé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/clients/:id/balance
router.get('/:id/balance', auth, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: 'Client non trouvé' });

    const payments = await Payment.find({ client: req.params.id, status: 'completed' });
    const tickets = await Ticket.find({ client: req.params.id });

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalInvoiced = tickets.reduce((sum, t) => sum + t.total, 0);

    res.json({
      success: true,
      data: {
        balance: client.balance,
        totalPaid,
        totalInvoiced,
        difference: totalPaid - totalInvoiced
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
