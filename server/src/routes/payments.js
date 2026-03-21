const express = require('express');
const Payment = require('../models/Payment');
const Ticket = require('../models/Ticket');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Client = require('../models/Client');
const CashRegister = require('../models/CashRegister');
const { auth } = require('../middleware/auth');
const { generatePaymentNumber } = require('../utils/helpers');

const router = express.Router();

// GET /api/payments
router.get('/', auth, async (req, res) => {
  try {
    const { method, agent, startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (method) filter.method = method;
    if (agent) filter.agent = agent;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .populate('ticket').populate('agent', 'firstName lastName')
      .populate('client', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: payments,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/payments - Process payment
router.post('/', auth, async (req, res) => {
  try {
    const {
      ticketId, method, amountReceived,
      mobileMoneyProvider, mobileMoneyNumber, transactionRef,
      mixedPayments, notes
    } = req.body;

    const ticket = await Ticket.findById(ticketId).populate('orders');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket non trouvé' });
    if (ticket.isPaid) return res.status(400).json({ success: false, message: 'Ce ticket est déjà payé' });

    // Find open cash register
    const cashRegister = await CashRegister.findOne({ agent: req.user._id, status: 'open' });
    if (!cashRegister) {
      return res.status(400).json({ success: false, message: 'Veuillez ouvrir une caisse avant de procéder au paiement' });
    }

    const change = method === 'cash' ? Math.max(0, amountReceived - ticket.total) : 0;

    const payment = new Payment({
      paymentNumber: generatePaymentNumber(),
      ticket: ticket._id,
      table: ticket.table,
      agent: req.user._id,
      client: ticket.client,
      amount: ticket.total,
      amountReceived: amountReceived || ticket.total,
      change,
      method,
      mobileMoneyProvider: mobileMoneyProvider || 'none',
      mobileMoneyNumber: mobileMoneyNumber || '',
      transactionRef: transactionRef || '',
      mixedPayments: mixedPayments || [],
      cashRegister: cashRegister._id,
      notes: notes || ''
    });

    await payment.save();

    // Update ticket
    ticket.isPaid = true;
    ticket.payment = payment._id;
    await ticket.save();

    // Update orders status
    for (const order of ticket.orders) {
      await Order.findByIdAndUpdate(order._id || order, { status: 'paid' });
    }

    // Update table
    const table = await Table.findById(ticket.table);
    if (table) {
      // Remove paid orders
      const paidOrderIds = ticket.orders.map(o => (o._id || o).toString());
      table.currentOrders = table.currentOrders.filter(
        id => !paidOrderIds.includes(id.toString())
      );
      if (table.currentOrders.length === 0) {
        table.status = 'available';
      }
      await table.save();
    }

    // Update cash register
    cashRegister.payments.push(payment._id);
    cashRegister.totalSales += ticket.total;
    cashRegister.transactionCount += 1;
    if (method === 'cash') cashRegister.totalCash += ticket.total;
    else if (method === 'card') cashRegister.totalCard += ticket.total;
    else if (method === 'mobile_money') cashRegister.totalMobileMoney += ticket.total;
    else if (method === 'gift_card') cashRegister.totalGiftCard += ticket.total;
    else if (method === 'mixed' && mixedPayments) {
      for (const mp of mixedPayments) {
        if (mp.method === 'cash') cashRegister.totalCash += mp.amount;
        else if (mp.method === 'card') cashRegister.totalCard += mp.amount;
        else if (mp.method === 'mobile_money') cashRegister.totalMobileMoney += mp.amount;
      }
    }
    cashRegister.expectedAmount = cashRegister.openingAmount + cashRegister.totalCash;
    await cashRegister.save();

    // Update client
    if (ticket.client) {
      await Client.findByIdAndUpdate(ticket.client, {
        $inc: { totalSpent: ticket.total, visitCount: 1, loyaltyPoints: Math.floor(ticket.total / 100) }
      });
    }

    const io = req.app.get('io');
    io.emit('payment:created', payment);
    io.emit('ticket:paid', { ticketId: ticket._id, payment });
    if (table) io.emit('table:updated', table);

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/payments/:id/refund
router.post('/:id/refund', auth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Paiement non trouvé' });

    payment.status = 'refunded';
    await payment.save();

    const ticket = await Ticket.findById(payment.ticket);
    if (ticket) {
      ticket.isPaid = false;
      await ticket.save();
    }

    const io = req.app.get('io');
    io.emit('payment:refunded', payment);

    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
